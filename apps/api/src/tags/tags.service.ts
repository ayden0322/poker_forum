import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { TagScope, CategoryType } from '@betting-forum/database';

@Injectable()
export class TagsService {
  constructor(private prisma: PrismaService) {}

  /**
   * 由分類型別推出「該分類看板可用的 scope 集合」。
   * GLOBAL 一律可；SPORTS/LOTTERY 各自加上對應 scope；
   * GENERAL（或未知/找不到）只剩通用，避免漏出彩券/運動標籤。
   */
  private scopesForCategoryType(type?: CategoryType | null): TagScope[] {
    if (type === 'SPORTS') return [TagScope.GLOBAL, TagScope.SPORTS];
    if (type === 'LOTTERY') return [TagScope.GLOBAL, TagScope.LOTTERY];
    return [TagScope.GLOBAL];
  }

  /**
   * 取得標籤。
   * - 不帶 categorySlug：回全部（後台管理 / 向後相容用）。
   * - 帶 categorySlug：回「該分類看板可用」的標籤集合。
   */
  async findAll(categorySlug?: string) {
    let scopes: TagScope[] | undefined;

    if (categorySlug) {
      const category = await this.prisma.category.findUnique({
        where: { slug: categorySlug },
        select: { type: true },
      });
      scopes = this.scopesForCategoryType(category?.type);
    }

    return this.prisma.tag.findMany({
      where: scopes ? { scope: { in: scopes } } : undefined,
      orderBy: [{ scope: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * 取得「某看板允許的標籤 id 集合」，供發文/改文時驗證 tagIds 是否合法。
   * 只查分類 type 與標籤 id，避免拉回整筆標籤資料。
   */
  async getAllowedTagIds(boardId: string): Promise<Set<string>> {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      select: { category: { select: { type: true } } },
    });
    if (!board) return new Set();
    const scopes = this.scopesForCategoryType(board.category.type);
    const tags = await this.prisma.tag.findMany({
      where: { scope: { in: scopes } },
      select: { id: true },
    });
    return new Set(tags.map((t) => t.id));
  }
}
