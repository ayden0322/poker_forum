import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ADMIN_PAGES, ALWAYS_SUPER_ADMIN_PAGES } from './page-registry';

type Tiers = { moderator: boolean; admin: boolean; superAdmin: boolean };

/**
 * 後台頁面權限矩陣服務。
 * - 啟動時把註冊表 seed 進 DB（只補缺、不覆蓋既有設定），並載入記憶體快取。
 * - canAccess() 供 PageGuard 與 my-pages 使用；權限設定頁有防鎖死底線。
 * - update() 由超級管理員透過 API 呼叫，寫 DB 後即時刷新快取。
 */
@Injectable()
export class PagePermissionService implements OnModuleInit {
  private readonly logger = new Logger(PagePermissionService.name);
  private cache = new Map<string, Tiers>();

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaults();
    await this.reload();
  }

  /** 只補缺的 pageKey，不動既有設定（保留超管已調整的值） */
  private async seedDefaults() {
    for (const p of ADMIN_PAGES) {
      await this.prisma.adminPagePermission.upsert({
        where: { pageKey: p.key },
        create: {
          pageKey: p.key,
          allowModerator: p.defaults.moderator,
          allowAdmin: p.defaults.admin,
          allowSuperAdmin: p.defaults.superAdmin,
        },
        update: {},
      });
    }
  }

  async reload() {
    const rows = await this.prisma.adminPagePermission.findMany();
    const next = new Map<string, Tiers>();
    for (const r of rows) {
      next.set(r.pageKey, {
        moderator: r.allowModerator,
        admin: r.allowAdmin,
        superAdmin: r.allowSuperAdmin,
      });
    }
    this.cache = next;
  }

  /** 某角色是否可存取某頁面 */
  canAccess(role: string | undefined | null, pageKey: string): boolean {
    if (!role) return false;
    // 防鎖死底線：權限設定頁永遠對超級管理員開放，無論矩陣怎麼設
    if (role === 'SUPER_ADMIN' && ALWAYS_SUPER_ADMIN_PAGES.has(pageKey)) return true;

    const t = this.cache.get(pageKey);
    if (!t) return false; // 未知頁面 → fail-closed
    if (role === 'SUPER_ADMIN') return t.superAdmin;
    if (role === 'ADMIN') return t.admin;
    if (role === 'MODERATOR') return t.moderator;
    return false;
  }

  /** 該角色可見的所有 pageKey（前端選單 / 路由守衛用） */
  allowedPagesFor(role: string | undefined | null): string[] {
    return ADMIN_PAGES.map((p) => p.key).filter((k) => this.canAccess(role, k));
  }

  /** 完整矩陣（含 label），給權限設定頁顯示 */
  getMatrix() {
    return ADMIN_PAGES.map((p) => {
      const t = this.cache.get(p.key) ?? {
        moderator: p.defaults.moderator,
        admin: p.defaults.admin,
        superAdmin: p.defaults.superAdmin,
      };
      return {
        key: p.key,
        label: p.label,
        allowModerator: t.moderator,
        allowAdmin: t.admin,
        allowSuperAdmin: t.superAdmin,
        alwaysSuperAdmin: ALWAYS_SUPER_ADMIN_PAGES.has(p.key),
      };
    });
  }

  /** 更新單一頁面的三層可見性（僅超級管理員可呼叫，由 controller 把關） */
  async update(
    pageKey: string,
    tiers: { allowModerator?: boolean; allowAdmin?: boolean; allowSuperAdmin?: boolean },
  ) {
    const known = ADMIN_PAGES.some((p) => p.key === pageKey);
    if (!known) return { ok: false };

    await this.prisma.adminPagePermission.upsert({
      where: { pageKey },
      create: {
        pageKey,
        allowModerator: tiers.allowModerator ?? false,
        allowAdmin: tiers.allowAdmin ?? false,
        allowSuperAdmin: tiers.allowSuperAdmin ?? true,
      },
      update: {
        ...(typeof tiers.allowModerator === 'boolean' && { allowModerator: tiers.allowModerator }),
        ...(typeof tiers.allowAdmin === 'boolean' && { allowAdmin: tiers.allowAdmin }),
        ...(typeof tiers.allowSuperAdmin === 'boolean' && { allowSuperAdmin: tiers.allowSuperAdmin }),
      },
    });
    await this.reload();
    return { ok: true };
  }
}
