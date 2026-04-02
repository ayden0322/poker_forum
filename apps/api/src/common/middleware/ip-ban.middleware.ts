import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../prisma.service';

@Injectable()
export class IpBanMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const ip = req.ip ?? req.socket?.remoteAddress ?? '';
    const cleanIp = ip.replace('::ffff:', '');

    const banned = await this.prisma.bannedIp.findUnique({
      where: { ip: cleanIp },
    });

    if (banned) {
      throw new ForbiddenException('此 IP 已被封鎖，無法存取');
    }

    next();
  }
}
