import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

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
            posts: true,
            followers: true,
            following: true,
          },
        },
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
    };
  }

  async getUserPosts(nickname: string, page = 1, pageSize = 20) {
    const user = await this.prisma.user.findUnique({ where: { nickname }, select: { id: true } });
    if (!user) throw new NotFoundException('找不到此用戶');

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: { authorId: user.id },
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
      this.prisma.post.count({ where: { authorId: user.id } }),
    ]);

    return { items: posts, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new NotFoundException('用戶不存在');

    const data: { avatar?: string; passwordHash?: string } = {};

    if (dto.avatar !== undefined) {
      data.avatar = dto.avatar;
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
      select: { id: true, nickname: true, avatar: true, level: true, role: true },
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
        select: { id: true, nickname: true, avatar: true, level: true, _count: { select: { posts: true } } },
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
      where: { createdAt: { gte: since } },
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

  // 自動更新等級（可由其他 service 呼叫）
  async recalculateLevel(userId: string) {
    const postCount = await this.prisma.post.count({ where: { authorId: userId } });
    let level = 1;
    if (postCount >= 500) level = 6;
    else if (postCount >= 200) level = 5;
    else if (postCount >= 100) level = 4;
    else if (postCount >= 50) level = 3;
    else if (postCount >= 20) level = 2;

    await this.prisma.user.update({ where: { id: userId }, data: { level } });
  }
}
