import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma, PromoStatus } from '@betting-forum/database';
import { PrismaService } from '../common/prisma.service';
import {
  CreatePartnerDto,
  UpdatePartnerDto,
  CreateCodeDto,
  UpdateCodeDto,
} from './dto/promo.dto';

/** 常見爬蟲/機器人 UA 關鍵字（落地點擊過濾，避免漏斗分母灌水） */
const BOT_UA = /(bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|monitor|curl|wget|python-requests|axios|httpclient|lighthouse|gtmetrix|pingdom)/i;

@Injectable()
export class PromoService {
  private readonly logger = new Logger(PromoService.name);

  constructor(private prisma: PrismaService) {}

  /** 統一碼格式：去空白、轉大寫 */
  normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private isBot(ua?: string): boolean {
    return !!ua && BOT_UA.test(ua);
  }

  /** 取一個「可用」的碼（ACTIVE、未過期、廠商也 ACTIVE）；否則 null。 */
  async resolveActiveCode(rawCode?: string | null) {
    if (!rawCode) return null;
    const code = this.normalizeCode(rawCode);
    if (!code) return null;
    const rec = await this.prisma.promoCode.findUnique({
      where: { code },
      include: { partner: true },
    });
    if (!rec) return null;
    if (rec.status !== PromoStatus.ACTIVE) return null;
    if (rec.partner.status !== PromoStatus.ACTIVE) return null;
    if (rec.expiresAt && rec.expiresAt.getTime() < Date.now()) return null;
    return rec;
  }

  // ===== 漏斗上層：點擊 =====

  /**
   * 記錄一次落地點擊。無效碼直接忽略（不丟錯）。同訪客同碼只留一筆。
   * 回傳碼是否有效（active）——讓落地頁據此決定要不要覆寫歸因 cookie，
   * 避免「先點有效 A 碼、再誤點壞 B 碼」把既有有效歸因蓋掉。
   */
  async trackVisit(rawCode: string, visitorId: string, ip?: string, ua?: string): Promise<boolean> {
    const code = await this.resolveActiveCode(rawCode);
    if (!code || !visitorId) return false;
    try {
      await this.prisma.promoVisit.upsert({
        where: { codeId_visitorId: { codeId: code.id, visitorId } },
        create: {
          codeId: code.id,
          visitorId,
          ip: ip ?? null,
          userAgent: ua ?? null,
          isBot: this.isBot(ua),
        },
        update: {}, // 已存在 → 不重複計數
      });
    } catch (e) {
      this.logger.warn(`trackVisit 失敗（忽略）：${(e as Error).message}`);
    }
    return true;
  }

  // ===== 漏斗下層：註冊歸因（給 auth 流程呼叫，best-effort）=====

  /**
   * 將註冊歸因到推廣碼。壞碼/過期/重複一律靜默略過，絕不影響註冊本身。
   * unique(userId) 保證一個使用者最多一筆歸因（天然冪等）。
   */
  async attributeRegistration(
    userId: string,
    rawCode?: string | null,
    visitorId?: string | null,
    regIp?: string | null,
  ): Promise<void> {
    try {
      const code = await this.resolveActiveCode(rawCode);
      if (!code) return;
      await this.prisma.promoReferral.create({
        data: {
          codeId: code.id,
          userId,
          visitorId: visitorId ?? null,
          regIp: regIp ?? null,
        },
      });
    } catch (e) {
      // P2002 = 該 user 已有歸因（冪等，預期內，靜默略過）；
      // 其餘錯誤（DB timeout、schema mismatch…）一樣不擋註冊，但要可觀測——用 error 級別記，別吞成 warn。
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        this.logger.debug(`attributeRegistration 冪等略過（user 已有歸因）：${userId}`);
      } else {
        this.logger.error(`attributeRegistration 失敗（已放行註冊，歸因遺失）：${(e as Error).message}`);
      }
    }
  }

  // ===== 後台：廠商 CRUD =====

  async listPartners() {
    return this.prisma.promoPartner.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { codes: true } } },
    });
  }

  async createPartner(dto: CreatePartnerDto, createdById?: string) {
    return this.prisma.promoPartner.create({
      data: {
        name: dto.name,
        contact: dto.contact ?? null,
        note: dto.note ?? null,
        createdById: createdById ?? null,
      },
    });
  }

  async updatePartner(id: string, dto: UpdatePartnerDto) {
    await this.ensurePartner(id);
    return this.prisma.promoPartner.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.contact !== undefined ? { contact: dto.contact ?? null } : {}),
        ...(dto.note !== undefined ? { note: dto.note ?? null } : {}),
        ...(dto.status ? { status: dto.status as PromoStatus } : {}),
      },
    });
  }

  /** 刪廠商（連同碼/點擊/歸因 cascade）。已有歸因者建議改停用而非刪除。 */
  async deletePartner(id: string) {
    await this.ensurePartner(id);
    await this.prisma.promoPartner.delete({ where: { id } });
    return { ok: true };
  }

  private async ensurePartner(id: string) {
    const p = await this.prisma.promoPartner.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('找不到推廣廠商');
    return p;
  }

  // ===== 後台：推廣碼 CRUD =====

  async listCodes(partnerId?: string) {
    return this.prisma.promoCode.findMany({
      where: partnerId ? { partnerId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { partner: { select: { id: true, name: true, status: true } } },
    });
  }

  async createCode(dto: CreateCodeDto) {
    await this.ensurePartner(dto.partnerId);
    const code = dto.code ? this.normalizeCode(dto.code) : await this.generateUniqueCode();
    const existing = await this.prisma.promoCode.findUnique({ where: { code } });
    if (existing) throw new BadRequestException('此推廣碼已存在');
    return this.prisma.promoCode.create({
      data: {
        code,
        partnerId: dto.partnerId,
        channel: dto.channel ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        note: dto.note ?? null,
      },
    });
  }

  async updateCode(id: string, dto: UpdateCodeDto) {
    await this.ensureCode(id);
    return this.prisma.promoCode.update({
      where: { id },
      data: {
        ...(dto.channel !== undefined ? { channel: dto.channel ?? null } : {}),
        ...(dto.status ? { status: dto.status as PromoStatus } : {}),
        ...(dto.note !== undefined ? { note: dto.note ?? null } : {}),
        ...(dto.expiresAt !== undefined
          ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }
          : {}),
      },
    });
  }

  async deleteCode(id: string) {
    await this.ensureCode(id);
    await this.prisma.promoCode.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureCode(id: string) {
    const c = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('找不到推廣碼');
    return c;
  }

  /** 產生不重複短碼（避開易混淆字元 0/O/1/I） */
  private async generateUniqueCode(): Promise<string> {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = '';
      const bytes = randomBytes(8);
      for (let i = 0; i < 8; i++) code += alphabet[bytes[i] % alphabet.length];
      const hit = await this.prisma.promoCode.findUnique({ where: { code } });
      if (!hit) return code;
    }
    throw new BadRequestException('無法產生推廣碼，請重試');
  }

  // ===== 後台：漏斗報表 =====

  private dateFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    const f: Prisma.DateTimeFilter = {};
    if (from) f.gte = new Date(from);
    if (to) f.lte = new Date(to);
    return from || to ? f : undefined;
  }

  /**
   * 漏斗報表：每個碼的「不重複點擊 / 註冊數 / 手機驗證數」與轉換率，
   * 並依廠商彙總。時間區間：點擊看 visit.createdAt、註冊/驗證看 referral.createdAt。
   * 「手機驗證數」= 該區間內歸因進來、且目前 phoneVerified 的會員數。
   */
  async report(from?: string, to?: string, partnerId?: string) {
    const visitWhen = this.dateFilter(from, to);
    const refWhen = this.dateFilter(from, to);

    const codes = await this.prisma.promoCode.findMany({
      where: partnerId ? { partnerId } : undefined,
      include: { partner: { select: { id: true, name: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const codeIds = codes.map((c) => c.id);
    if (codeIds.length === 0) {
      return { codes: [], partners: [], totals: emptyTotals(), trend: [] };
    }

    const [visitGroups, refGroups, verifiedGroups] = await Promise.all([
      this.prisma.promoVisit.groupBy({
        by: ['codeId'],
        where: { codeId: { in: codeIds }, isBot: false, ...(visitWhen ? { createdAt: visitWhen } : {}) },
        _count: { _all: true },
      }),
      this.prisma.promoReferral.groupBy({
        by: ['codeId'],
        where: { codeId: { in: codeIds }, ...(refWhen ? { createdAt: refWhen } : {}) },
        _count: { _all: true },
      }),
      this.prisma.promoReferral.groupBy({
        by: ['codeId'],
        where: {
          codeId: { in: codeIds },
          ...(refWhen ? { createdAt: refWhen } : {}),
          user: { is: { phoneVerified: true } },
        },
        _count: { _all: true },
      }),
    ]);

    const visitMap = toCountMap(visitGroups);
    const refMap = toCountMap(refGroups);
    const verifiedMap = toCountMap(verifiedGroups);

    const codeRows = codes.map((c) => {
      const visits = visitMap[c.id] ?? 0;
      const registrations = refMap[c.id] ?? 0;
      const verified = verifiedMap[c.id] ?? 0;
      return {
        codeId: c.id,
        code: c.code,
        channel: c.channel,
        status: c.status,
        expiresAt: c.expiresAt,
        partnerId: c.partnerId,
        partnerName: c.partner.name,
        visits,
        registrations,
        verified,
        regRate: rate(registrations, visits), // 點擊→註冊
        verifyRate: rate(verified, registrations), // 註冊→驗證
      };
    });

    // 依廠商彙總
    const partnerMap = new Map<string, any>();
    for (const row of codeRows) {
      const agg = partnerMap.get(row.partnerId) ?? {
        partnerId: row.partnerId,
        partnerName: row.partnerName,
        codeCount: 0,
        visits: 0,
        registrations: 0,
        verified: 0,
      };
      agg.codeCount += 1;
      agg.visits += row.visits;
      agg.registrations += row.registrations;
      agg.verified += row.verified;
      partnerMap.set(row.partnerId, agg);
    }
    const partners = [...partnerMap.values()].map((p) => ({
      ...p,
      regRate: rate(p.registrations, p.visits),
      verifyRate: rate(p.verified, p.registrations),
    }));

    const totals = codeRows.reduce(
      (acc, r) => {
        acc.visits += r.visits;
        acc.registrations += r.registrations;
        acc.verified += r.verified;
        return acc;
      },
      emptyTotals(),
    );
    totals.regRate = rate(totals.registrations, totals.visits);
    totals.verifyRate = rate(totals.verified, totals.registrations);

    const trend = await this.dailyTrend(codeIds, from, to);

    return { codes: codeRows, partners, totals, trend };
  }

  /** 按日趨勢：點擊（非 bot）與註冊數。 */
  private async dailyTrend(codeIds: string[], from?: string, to?: string) {
    const fromD = from ? new Date(from) : null;
    const toD = to ? new Date(to) : null;
    const cond = (col: string) =>
      Prisma.sql`${fromD ? Prisma.sql`AND ${Prisma.raw(col)} >= ${fromD}` : Prisma.empty} ${
        toD ? Prisma.sql`AND ${Prisma.raw(col)} <= ${toD}` : Prisma.empty
      }`;

    const visits = await this.prisma.$queryRaw<{ day: Date; n: bigint }[]>`
      SELECT date_trunc('day', created_at) AS day, count(*) AS n
      FROM promo_visits
      WHERE code_id IN (${Prisma.join(codeIds)}) AND is_bot = false ${cond('created_at')}
      GROUP BY 1 ORDER BY 1`;
    const regs = await this.prisma.$queryRaw<{ day: Date; n: bigint }[]>`
      SELECT date_trunc('day', created_at) AS day, count(*) AS n
      FROM promo_referrals
      WHERE code_id IN (${Prisma.join(codeIds)}) ${cond('created_at')}
      GROUP BY 1 ORDER BY 1`;

    const map = new Map<string, { day: string; visits: number; registrations: number }>();
    const key = (d: Date) => d.toISOString().slice(0, 10);
    for (const v of visits) {
      const k = key(v.day);
      map.set(k, { day: k, visits: Number(v.n), registrations: 0 });
    }
    for (const r of regs) {
      const k = key(r.day);
      const e = map.get(k) ?? { day: k, visits: 0, registrations: 0 };
      e.registrations = Number(r.n);
      map.set(k, e);
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  }

  /** 結算用 CSV（每碼一列）。 */
  async exportCsv(from?: string, to?: string, partnerId?: string): Promise<string> {
    const { codes } = await this.report(from, to, partnerId);
    const header = [
      '廠商',
      '推廣碼',
      '渠道',
      '狀態',
      '不重複點擊',
      '註冊數',
      '手機驗證數',
      '點擊→註冊(%)',
      '註冊→驗證(%)',
    ];
    const lines = codes.map((c) =>
      [
        c.partnerName,
        c.code,
        c.channel ?? '',
        c.status,
        c.visits,
        c.registrations,
        c.verified,
        c.regRate,
        c.verifyRate,
      ]
        .map(csvCell)
        .join(','),
    );
    // BOM 讓 Excel 正確辨識 UTF-8
    return '﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n');
  }
}

function toCountMap(groups: { codeId: string; _count: { _all: number } }[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const g of groups) m[g.codeId] = g._count._all;
  return m;
}

function rate(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num / den) * 1000) / 10; // 一位小數的百分比
}

function emptyTotals() {
  return { visits: 0, registrations: 0, verified: 0, regRate: 0, verifyRate: 0 };
}

function csvCell(v: unknown): string {
  let s = String(v ?? '');
  // 防 Excel/Sheets 公式注入：以 = + - @ tab CR 開頭者前置單引號中和
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
