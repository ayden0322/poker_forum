import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@betting-forum/database';
import { PrismaService } from '../common/prisma.service';
import {
  ADMIN_PAGES,
  ALL_PERM_KEYS,
  CAP_PREFIX,
  PAGE_PREFIX,
  PERMISSION_CATALOG,
  capPerm,
  defaultPermKeysForRole,
  isValidPermKey,
  pageRequiredPerm,
} from './page-registry';
import { rankOf } from '../common/role-hierarchy';

type ActorContext = { id: string; nickname: string; role: string };

/**
 * 後台「帳號級」權限服務（取代舊的角色層級矩陣）。
 * - 授權判斷一律即時查 DB（後台 QPS 低），不做 per-user 記憶體快取、不放進 JWT，
 *   徹底避免多副本快取不一致。
 * - SUPER_ADMIN 一律 bypass（永遠全開）。
 * - PUT / copy 共用同一道護欄（_applyPermissions）：驗 key、級聯、防擴張、
 *   transaction 內鎖 target row、刪後重建、同交易寫 AuditLog（失敗整筆 rollback）。
 */
@Injectable()
export class PagePermissionService {
  constructor(private prisma: PrismaService) {}

  private isSuper(role?: string | null) {
    return role === Role.SUPER_ADMIN;
  }

  /** 取得某帳號的全部 permKey 集合 */
  async getPermKeys(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.adminPermission.findMany({
      where: { userId },
      select: { permKey: true },
    });
    return new Set(rows.map((r) => r.permKey));
  }

  /** 某頁面是否可存取（PageGuard 用）。pageKey 為 SEGMENT_TO_PAGE 解析出的頁面鍵。 */
  async canAccessPage(user: { id: string; role: string }, pageKey: string): Promise<boolean> {
    if (this.isSuper(user.role)) return true;
    const required = pageRequiredPerm(pageKey);
    const set = await this.getPermKeys(user.id);
    return set.has(required);
  }

  /** 是否具備某敏感能力（CapabilityGuard 用）。capKey 例：'member:impersonate'（不含 cap: 前綴）。 */
  async hasCapability(user: { id: string; role: string }, capKey: string): Promise<boolean> {
    if (this.isSuper(user.role)) return true;
    const set = await this.getPermKeys(user.id);
    return set.has(capPerm(capKey));
  }

  /** 側邊選單可見頁面 key（含 news，依其 required perm 判定） */
  async allowedPageKeysFor(user: { id: string; role: string }): Promise<string[]> {
    if (this.isSuper(user.role)) return ADMIN_PAGES.map((p) => p.key);
    const set = await this.getPermKeys(user.id);
    return ADMIN_PAGES.map((p) => p.key).filter((k) => set.has(pageRequiredPerm(k)));
  }

  /** 目前登入者自己的權限（前端隱藏按鈕用；真正把關仍在後端 Guard） */
  async getMyPermissions(user: { id: string; role: string }) {
    if (this.isSuper(user.role)) {
      return {
        isSuperAdmin: true,
        pages: PERMISSION_CATALOG.pages.map((p) => p.permKey),
        caps: PERMISSION_CATALOG.caps.map((c) => c.permKey),
      };
    }
    const set = await this.getPermKeys(user.id);
    return {
      isSuperAdmin: false,
      pages: [...set].filter((k) => k.startsWith(PAGE_PREFIX)),
      caps: [...set].filter((k) => k.startsWith(CAP_PREFIX)),
    };
  }

  /** actor 可授出的權限上限：SUPER_ADMIN → 全集；否則 → 自己擁有的權限集合（防擴張） */
  async grantableSetFor(actor: { id: string; role: string }): Promise<Set<string>> {
    if (this.isSuper(actor.role)) return new Set(ALL_PERM_KEYS);
    return this.getPermKeys(actor.id);
  }

  /**
   * 取得目標管理員的權限 + 完整目錄 + actor 可授出的上限（給前端編輯器）。
   * 僅供「能管理 admins 頁、且階層高於 target」者呼叫（由 controller 的 PageGuard + 此處級聯把關）。
   */
  async getTargetPermissionsForEdit(actor: ActorContext, targetUserId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, nickname: true, role: true },
    });
    if (!target) throw new NotFoundException('找不到此帳號');
    this.assertCanManageTarget(actor, target.role);

    const granted = await this.getPermKeys(targetUserId);
    const grantable = await this.grantableSetFor(actor);
    return {
      target: { id: target.id, nickname: target.nickname, role: target.role },
      catalog: PERMISSION_CATALOG,
      granted: [...granted],
      grantable: [...grantable],
    };
  }

  /** 階層級聯：只能管理「嚴格比自己低階」且為 MODERATOR/ADMIN 的帳號 */
  private assertCanManageTarget(actor: ActorContext, targetRole: string) {
    if (targetRole === Role.SUPER_ADMIN) {
      throw new ForbiddenException('超級管理員權限無法被編輯');
    }
    if (targetRole !== Role.ADMIN && targetRole !== Role.MODERATOR) {
      throw new ForbiddenException('只能設定管理員帳號的權限');
    }
    if (!(rankOf(actor.role) > rankOf(targetRole))) {
      throw new ForbiddenException('只能設定比你低階帳號的權限');
    }
  }

  /** PUT：整組覆寫目標帳號權限 */
  async setUserPermissions(actor: ActorContext, targetUserId: string, permKeys: string[]) {
    return this._applyPermissions(actor, targetUserId, permKeys, 'ADMIN_PERMS_UPDATE', {});
  }

  /** copy：把來源帳號的整組權限套到目標帳號（複用 PUT 的同一道護欄） */
  async copyPermissions(actor: ActorContext, sourceUserId: string, targetUserId: string) {
    if (sourceUserId === targetUserId) {
      throw new ForbiddenException('來源與目標不可相同');
    }
    const source = await this.prisma.user.findUnique({
      where: { id: sourceUserId },
      select: { id: true, nickname: true, role: true },
    });
    if (!source) throw new NotFoundException('找不到來源帳號');
    // 來源必須是有權限列的管理員：SUPER_ADMIN（bypass、無列）會把目標清空、USER 非管理員，皆禁止當來源
    if (source.role !== Role.ADMIN && source.role !== Role.MODERATOR) {
      throw new ForbiddenException('只能從一般管理員（編輯人員 / 總管理員）複製權限');
    }
    const sourceKeys = [...(await this.getPermKeys(sourceUserId))];
    return this._applyPermissions(actor, targetUserId, sourceKeys, 'ADMIN_PERMS_COPY', {
      sourceUserId,
      sourceNickname: source.nickname,
    });
  }

  /**
   * 套用權限的唯一寫入路徑（PUT 與 copy 共用）。
   * 護欄：驗 key → 級聯 → 防擴張 → transaction(鎖 target → 刪後重建 → 同交易寫 audit)。
   */
  private async _applyPermissions(
    actor: ActorContext,
    targetUserId: string,
    rawKeys: string[],
    action: 'ADMIN_PERMS_UPDATE' | 'ADMIN_PERMS_COPY',
    extraMeta: Record<string, unknown>,
  ) {
    if (actor.id === targetUserId) {
      throw new ForbiddenException('不能編輯自己的權限');
    }

    // 輸入型別驗證：非陣列回 400，不要讓 new Set() 噴 500
    if (!Array.isArray(rawKeys)) {
      throw new BadRequestException('permKeys 必須是陣列');
    }

    // 去重 + 驗證每個 key 合法
    const keys = [...new Set(rawKeys)];
    const invalid = keys.filter((k) => !isValidPermKey(k));
    if (invalid.length) {
      throw new BadRequestException(`包含未知權限：${invalid.join(', ')}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 鎖 target user row，序列化同帳號的並發 PUT/copy（避免 lost update）
      const locked = await tx.$queryRaw<Array<{ id: string; role: Role; nickname: string }>>(
        Prisma.sql`SELECT id, role, nickname FROM users WHERE id = ${targetUserId} FOR UPDATE`,
      );
      const target = locked[0];
      if (!target) throw new NotFoundException('找不到此帳號');
      this.assertCanManageTarget(actor, target.role);

      // 防擴張：只能授出自己也有的權限。grantable 在同一交易內重查，避免「檢查後、提交前 actor 被撤權」的競態。
      const grantable = this.isSuper(actor.role)
        ? new Set(ALL_PERM_KEYS)
        : new Set(
            (
              await tx.adminPermission.findMany({
                where: { userId: actor.id },
                select: { permKey: true },
              })
            ).map((r) => r.permKey),
          );
      const exceeded = keys.filter((k) => !grantable.has(k));
      if (exceeded.length) {
        throw new ForbiddenException(`你無權授予下列權限：${exceeded.join(', ')}`);
      }

      await tx.adminPermission.deleteMany({ where: { userId: targetUserId } });
      if (keys.length) {
        await tx.adminPermission.createMany({
          data: keys.map((permKey) => ({ userId: targetUserId, permKey })),
          skipDuplicates: true,
        });
      }

      // 同交易寫稽核：失敗則整筆 rollback（權限異動屬高敏，不可 best-effort）
      await tx.auditLog.create({
        data: {
          actorAdminId: actor.id,
          actorNickname: actor.nickname,
          action,
          targetUserId,
          targetNickname: target.nickname,
          metadata: { permKeys: keys, ...extraMeta } as object,
        },
      });

      return { ok: true, count: keys.length };
    });
  }

  // ===== 帳號生命週期：升為管理員寫預設列、降為一般會員清空列（由 AdminService 在同交易呼叫） =====

  /**
   * 新建/升為管理員時寫入該角色的預設權限列（idempotent）。
   * allowed 傳入時，seed 範圍會與之取交集（防止透過「升級 seed」授出 actor 自己沒有的權限）。
   */
  async seedDefaultsForRole(
    tx: Prisma.TransactionClient,
    userId: string,
    role: 'MODERATOR' | 'ADMIN',
    allowed?: Set<string>,
  ) {
    let keys = defaultPermKeysForRole(role);
    if (allowed) keys = keys.filter((k) => allowed.has(k));
    if (!keys.length) return;
    await tx.adminPermission.createMany({
      data: keys.map((permKey) => ({ userId, permKey })),
      skipDuplicates: true,
    });
  }

  /** 降為一般會員（或被移出管理團隊）時清空所有權限列，避免日後再升級時舊權限復活 */
  async clearPermissions(tx: Prisma.TransactionClient, userId: string) {
    await tx.adminPermission.deleteMany({ where: { userId } });
  }
}
