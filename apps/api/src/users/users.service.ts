import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PostStatus } from '@betting-forum/database';
import { AUTHOR_COSMETIC_SELECT, serializeAuthorCosmetics } from '../common/author-cosmetics';
import { isMemberEconomyEnabled } from '../economy/economy.flags';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByNickname(nickname: string, currentUserId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { nickname },
      select: {
        id: true,
        nickname: true,
        avatar: true,
        level: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            posts: { where: { status: PostStatus.PUBLISHED } },
            followers: true,
            following: true,
          },
        },
        ...AUTHOR_COSMETIC_SELECT, // 已裝備 frame/title/mainBadge/effect（fail-closed 於序列化層）
      },
    });
    if (!user) throw new NotFoundException('找不到此用戶');

    let isFollowing = false;
    if (currentUserId) {
      const follow = await this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: currentUserId, followingId: user.id } },
      });
      isFollowing = !!follow;
    }

    // 個人頁勳章牆：釘選的勳章（最多 3，依 pinnedOrder），到期者濾除；總開關關閉不外洩。
    const pinnedBadges = isMemberEconomyEnabled()
      ? (
          await this.prisma.userCosmetic.findMany({
            where: {
              userId: user.id,
              pinnedOrder: { not: null },
              item: { type: 'BADGE' },
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            orderBy: { pinnedOrder: 'asc' },
            take: 3,
            select: { item: { select: { name: true, iconKey: true, assetUrl: true, rarity: true } } },
          })
        ).map((r) => r.item)
      : [];

    // 戰績身份卡：勝率 / 連勝 / 在位冠軍（純戰績、公開；競猜關閉則回 null）
    const now = new Date();
    const [settled, wins, stat, reign, followRows] = await Promise.all([
      this.prisma.bet.count({ where: { userId: user.id, status: { in: ['WON', 'LOST'] } } }),
      this.prisma.bet.count({ where: { userId: user.id, status: 'WON' } }),
      this.prisma.userBettingStat.findUnique({ where: { userId: user.id } }),
      this.prisma.championReign.findFirst({
        where: { userId: user.id, reignFrom: { lte: now }, reignTo: { gt: now } },
        select: { board: true, reignFrom: true, reignTo: true },
      }),
      this.prisma.$queryRaw<Array<{ c: number }>>`SELECT COUNT(*)::int AS c FROM pick_follows pf JOIN bets b ON b.id = pf.pick_bet_id WHERE b.user_id = ${user.id}`,
    ]);
    const record = {
      settled,
      winRate: settled > 0 ? Math.round((wins / settled) * 1000) / 10 : 0,
      currentStreak: stat?.currentStreak ?? 0,
      bestStreak: stat?.bestStreak ?? 0,
      followedCount: followRows[0]?.c ?? 0,
    };

    return {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      level: user.level,
      role: user.role,
      createdAt: user.createdAt,
      postCount: user._count.posts,
      followerCount: user._count.followers,
      followingCount: user._count.following,
      isFollowing,
      cosmetics: serializeAuthorCosmetics(user),
      pinnedBadges,
      record,
      championReign: reign ? { board: reign.board, reignFrom: reign.reignFrom, reignTo: reign.reignTo } : null,
    };
  }

  async getUserPosts(nickname: string, page = 1, pageSize = 20) {
    const user = await this.prisma.user.findUnique({ where: { nickname }, select: { id: true } });
    if (!user) throw new NotFoundException('找不到此用戶');

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: { authorId: user.id, status: PostStatus.PUBLISHED },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          board: { select: { name: true, slug: true } },
          replyCount: true,
          pushCount: true,
          createdAt: true,
        },
      }),
      this.prisma.post.count({
        where: { authorId: user.id, status: PostStatus.PUBLISHED },
      }),
    ]);

    return { items: posts, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nickname: true,
        passwordHash: true,
        nicknameChangedAt: true,
      },
    });
    if (!user) throw new NotFoundException('用戶不存在');

    const data: {
      avatar?: string;
      passwordHash?: string;
      nickname?: string;
      nicknameChangedAt?: Date;
    } = {};

    if (dto.avatar !== undefined) {
      data.avatar = dto.avatar;
    }

    if (dto.nickname !== undefined) {
      const newNickname = dto.nickname.trim();
      if (!newNickname) {
        throw new BadRequestException('暱稱不能為空');
      }
      if (newNickname !== user.nickname) {
        if (user.nicknameChangedAt) {
          const cooldownMs = 7 * 24 * 60 * 60 * 1000;
          const nextAllowedAt = user.nicknameChangedAt.getTime() + cooldownMs;
          if (Date.now() < nextAllowedAt) {
            const daysLeft = Math.ceil((nextAllowedAt - Date.now()) / (24 * 60 * 60 * 1000));
            throw new BadRequestException(`暱稱每 7 天可更改一次，請於 ${daysLeft} 天後再試`);
          }
        }
        const existing = await this.prisma.user.findUnique({
          where: { nickname: newNickname },
          select: { id: true },
        });
        if (existing && existing.id !== userId) {
          throw new BadRequestException('此暱稱已被使用');
        }
        data.nickname = newNickname;
        data.nicknameChangedAt = new Date();
      }
    }

    if (dto.newPassword) {
      if (!dto.currentPassword) {
        throw new BadRequestException('請提供目前密碼');
      }
      if (!user.passwordHash) {
        throw new BadRequestException('此帳號使用社群登入，無法設定密碼');
      }
      const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!isMatch) throw new BadRequestException('目前密碼錯誤');
      data.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        nickname: true,
        avatar: true,
        level: true,
        role: true,
        nicknameChangedAt: true,
      },
    });
  }

  async follow(followerId: string, targetNickname: string) {
    const target = await this.prisma.user.findUnique({
      where: { nickname: targetNickname },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('找不到此用戶');
    if (target.id === followerId) throw new BadRequestException('不能追蹤自己');

    await this.prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId: target.id } },
      update: {},
      create: { followerId, followingId: target.id },
    });

    // 寄出追蹤通知
    await this.prisma.notification.create({
      data: {
        userId: target.id,
        type: 'FOLLOW',
        content: `有人開始追蹤你`,
        sourceUrl: `/user/${(await this.prisma.user.findUnique({ where: { id: followerId }, select: { nickname: true } }))?.nickname}`,
      },
    });

    return { success: true };
  }

  async unfollow(followerId: string, targetNickname: string) {
    const target = await this.prisma.user.findUnique({
      where: { nickname: targetNickname },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('找不到此用戶');

    await this.prisma.follow.deleteMany({
      where: { followerId, followingId: target.id },
    });
    return { success: true };
  }

  async search(query: string, page = 1, pageSize = 20) {
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { nickname: { contains: query, mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          nickname: true,
          avatar: true,
          level: true,
          _count: { select: { posts: { where: { status: PostStatus.PUBLISHED } } } },
        },
      }),
      this.prisma.user.count({
        where: { nickname: { contains: query, mode: 'insensitive' } },
      }),
    ]);
    return { items: users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getPopularUsers(limit = 12) {
    // 最近 30 天發文最多的用戶
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const results = await this.prisma.post.groupBy({
      by: ['authorId'],
      where: { createdAt: { gte: since }, status: PostStatus.PUBLISHED },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    const userIds = results.map((r) => r.authorId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true, avatar: true, level: true },
    });

    return users;
  }

  /** 取得追蹤者列表 */
  async getFollowers(nickname: string, page = 1, pageSize = 20) {
    const user = await this.prisma.user.findUnique({ where: { nickname }, select: { id: true } });
    if (!user) throw new NotFoundException('找不到此用戶');

    const [items, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followingId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          follower: { select: { id: true, nickname: true, avatar: true, level: true } },
        },
      }),
      this.prisma.follow.count({ where: { followingId: user.id } }),
    ]);

    return {
      items: items.map((f) => f.follower),
      total,
      page,
      pageSize,
    };
  }

  /** 取得追蹤中列表 */
  async getFollowing(nickname: string, page = 1, pageSize = 20) {
    const user = await this.prisma.user.findUnique({ where: { nickname }, select: { id: true } });
    if (!user) throw new NotFoundException('找不到此用戶');

    const [items, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          following: { select: { id: true, nickname: true, avatar: true, level: true } },
        },
      }),
      this.prisma.follow.count({ where: { followerId: user.id } }),
    ]);

    return {
      items: items.map((f) => f.following),
      total,
      page,
      pageSize,
    };
  }

  /** 取得使用者回覆紀錄 */
  async getUserReplies(nickname: string, page = 1, pageSize = 20) {
    const user = await this.prisma.user.findUnique({ where: { nickname }, select: { id: true } });
    if (!user) throw new NotFoundException('找不到此用戶');

    const [items, total] = await Promise.all([
      this.prisma.reply.findMany({
        where: { authorId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          content: true,
          floorNumber: true,
          createdAt: true,
          post: { select: { id: true, title: true, board: { select: { name: true, slug: true } } } },
        },
      }),
      this.prisma.reply.count({ where: { authorId: user.id } }),
    ]);

    return { items, total, page, pageSize };
  }
}
