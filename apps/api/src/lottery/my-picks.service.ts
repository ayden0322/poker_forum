import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { GameType, GAME_CONFIG } from './lottery.service';

export interface CreatePickInput {
  gameType: GameType;
  label: string;
  numbers: number[];
  specialNum?: number[];
}

export interface UpdatePickInput {
  label?: string;
}

/** 序列化的 Pick 物件（API 對外格式，避免曝露 Prisma raw 型別） */
export interface SerializedPick {
  id: string;
  userId: string;
  gameType: string;
  label: string;
  numbers: number[];
  specialNum: number[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface MyPickWithCheck {
  id: string;
  gameType: string;
  label: string;
  numbers: number[];
  specialNum: number[] | null;
  createdAt: string;
  updatedAt: string;
  // 對獎結果（與最新一期比對的 inline 結果）
  lastCheck: {
    period: string;
    drawDate: string;
    drawNumbers: number[];
    drawSpecial: number[] | null;
    matchedNumbers: number[];
    hits: number;
    specialHit: boolean;
    prize: string | null; // 中獎等級描述
  } | null;
}

@Injectable()
export class MyPicksService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string): Promise<MyPickWithCheck[]> {
    const picks = await this.prisma.userLotteryPick.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (picks.length === 0) return [];

    // 為了 inline 對獎，預先抓每個 gameType 的最新一期
    const gameTypes = Array.from(new Set(picks.map((p) => p.gameType)));
    const latestMap = new Map<string, { period: string; drawDate: Date; numbers: number[]; specialNum: number[] | null }>();
    for (const gt of gameTypes) {
      const latest = await this.prisma.lotteryResult.findFirst({
        where: { gameType: gt },
        orderBy: { drawDate: 'desc' },
      });
      if (latest) {
        latestMap.set(gt, {
          period: latest.period,
          drawDate: latest.drawDate,
          numbers: latest.numbers as number[],
          specialNum: latest.specialNum as number[] | null,
        });
      }
    }

    return picks.map((p): MyPickWithCheck => {
      const numbers = p.numbers as number[];
      const specialNum = (p.specialNum as number[] | null) ?? null;
      const latest = latestMap.get(p.gameType);
      let lastCheck: MyPickWithCheck['lastCheck'] = null;
      if (latest) {
        const matchedNumbers = numbers.filter((n) => latest.numbers.includes(n));
        const hits = matchedNumbers.length;
        const specialHit =
          GAME_CONFIG[p.gameType as GameType]?.hasSpecial &&
          latest.specialNum &&
          specialNum &&
          specialNum.length > 0 &&
          latest.specialNum.includes(specialNum[0])
            ? true
            : false;

        lastCheck = {
          period: latest.period,
          drawDate: latest.drawDate.toISOString(),
          drawNumbers: latest.numbers,
          drawSpecial: latest.specialNum,
          matchedNumbers,
          hits,
          specialHit,
          prize: this.calcPrize(p.gameType as GameType, hits, specialHit),
        };
      }

      return {
        id: p.id,
        gameType: p.gameType,
        label: p.label,
        numbers,
        specialNum,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        lastCheck,
      };
    });
  }

  async create(userId: string, input: CreatePickInput): Promise<SerializedPick> {
    this.validateInput(input);
    const pick = await this.prisma.userLotteryPick.create({
      data: {
        userId,
        gameType: input.gameType,
        label: input.label.trim(),
        numbers: [...input.numbers].sort((a, b) => a - b),
        specialNum: input.specialNum ?? undefined,
      },
    });
    return this.serialize(pick);
  }

  async update(userId: string, id: string, input: UpdatePickInput): Promise<SerializedPick> {
    const existing = await this.prisma.userLotteryPick.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('號碼組不存在');
    if (existing.userId !== userId) throw new NotFoundException('號碼組不存在');

    const updated = await this.prisma.userLotteryPick.update({
      where: { id },
      data: {
        ...(input.label !== undefined && { label: input.label.trim() }),
      },
    });
    return this.serialize(updated);
  }

  private serialize(p: {
    id: string;
    userId: string;
    gameType: string;
    label: string;
    numbers: unknown;
    specialNum: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): SerializedPick {
    return {
      id: p.id,
      userId: p.userId,
      gameType: p.gameType,
      label: p.label,
      numbers: p.numbers as number[],
      specialNum: (p.specialNum as number[] | null) ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  async delete(userId: string, id: string) {
    const existing = await this.prisma.userLotteryPick.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('號碼組不存在');
    if (existing.userId !== userId) throw new NotFoundException('號碼組不存在');

    await this.prisma.userLotteryPick.delete({ where: { id } });
    return { ok: true };
  }

  // ===== 私有方法 =====

  private validateInput(input: CreatePickInput) {
    const config = GAME_CONFIG[input.gameType];
    if (!config) {
      throw new BadRequestException(`無效的彩種：${input.gameType}`);
    }

    if (!input.label || input.label.trim().length === 0) {
      throw new BadRequestException('號碼組名稱不能為空');
    }
    if (input.label.length > 30) {
      throw new BadRequestException('號碼組名稱不能超過 30 字');
    }

    // 號碼數量
    if (!Array.isArray(input.numbers) || input.numbers.length !== config.numberCount) {
      throw new BadRequestException(
        `${config.name} 必須選 ${config.numberCount} 個號碼，目前 ${input.numbers?.length ?? 0} 個`,
      );
    }

    // 號碼範圍與唯一性
    const minNum = input.gameType === 'LOTTO3D' || input.gameType === 'LOTTO4D' ? 0 : 1;
    const seen = new Set<number>();
    for (const n of input.numbers) {
      if (!Number.isInteger(n) || n < minNum || n > config.maxNumber) {
        throw new BadRequestException(
          `號碼 ${n} 超出範圍（${minNum}~${config.maxNumber}）`,
        );
      }
      // 3星彩/4星彩允許重複，其他不允許
      const allowDuplicate = input.gameType === 'LOTTO3D' || input.gameType === 'LOTTO4D';
      if (!allowDuplicate) {
        if (seen.has(n)) throw new BadRequestException(`號碼 ${n} 重複`);
        seen.add(n);
      }
    }

    // 特別號
    if (config.hasSpecial && 'specialMax' in config) {
      const specialMax = (config as { specialMax: number }).specialMax;
      if (!input.specialNum || input.specialNum.length !== 1) {
        throw new BadRequestException(`${config.name} 必須選 1 個特別號`);
      }
      const sn = input.specialNum[0];
      if (!Number.isInteger(sn) || sn < 1 || sn > specialMax) {
        throw new BadRequestException(`特別號 ${sn} 超出範圍（1~${specialMax}）`);
      }
    } else if (input.specialNum && input.specialNum.length > 0) {
      throw new BadRequestException(`${config.name} 沒有特別號`);
    }
  }

  /** 簡化版中獎判定（同步既有 checkNumbers 邏輯） */
  private calcPrize(gameType: GameType, hits: number, specialHit: boolean): string | null {
    if (gameType === 'LOTTO649') {
      if (hits === 6) return '頭獎';
      if (hits === 5 && specialHit) return '貳獎';
      if (hits === 5) return '參獎';
      if (hits === 4 && specialHit) return '肆獎';
      if (hits === 4) return '伍獎';
      if (hits === 3 && specialHit) return '陸獎';
      if (hits === 2 && specialHit) return '柒獎';
      if (hits === 3) return '普獎';
      return null;
    }
    if (gameType === 'SUPER_LOTTO') {
      if (hits === 6 && specialHit) return '頭獎';
      if (hits === 6) return '貳獎';
      if (hits === 5 && specialHit) return '參獎';
      if (hits === 5) return '肆獎';
      if (hits === 4 && specialHit) return '伍獎';
      if (hits === 4) return '陸獎';
      if (hits === 3 && specialHit) return '柒獎';
      if (hits === 2 && specialHit) return '捌獎';
      if (hits === 1 && specialHit) return '玖獎';
      if (specialHit) return '普獎';
      return null;
    }
    if (gameType === 'DAILY539') {
      if (hits === 5) return '頭獎';
      if (hits === 4) return '貳獎';
      if (hits === 3) return '參獎';
      if (hits === 2) return '肆獎';
      return null;
    }
    if (gameType === 'LOTTO1224') {
      if (hits === 12) return '頭獎';
      if (hits === 0) return '末獎';
      return null;
    }
    return null;
  }
}
