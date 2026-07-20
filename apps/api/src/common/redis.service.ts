import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.client = new Redis(url);
    this.client.on('error', (err) => this.logger.error('Redis 連線錯誤', err));
    this.client.on('connect', () => this.logger.log('Redis 已連線'));
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /** 原子遞增 + 首次設 TTL（計數器用；get/set 組合在併發下會少計） */
  async incrWithTtl(key: string, ttlSeconds: number, by = 1): Promise<number> {
    const val = await this.client.incrby(key, by);
    if (val === by) await this.client.expire(key, ttlSeconds);
    return val;
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
