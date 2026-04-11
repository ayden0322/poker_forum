import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * 手機驗證守門員
 * 用於需要「已完成手機驗證」才能使用的端點（例如發文、回應）
 * 必須搭配 JwtAuthGuard 使用
 */
@Injectable()
export class PhoneVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED',
        message: '尚未登入',
      });
    }

    if (!user.phoneVerified) {
      throw new ForbiddenException({
        code: 'PHONE_VERIFICATION_REQUIRED',
        message: '請先完成手機驗證才能發表文章或回應',
      });
    }

    return true;
  }
}
