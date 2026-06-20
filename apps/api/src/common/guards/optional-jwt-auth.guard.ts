import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * 可選 JWT 驗證：有有效 token 就把 user 帶上 request；沒有或無效也放行（user = null）。
 * 用於公開但「登入者要有額外行為」的端點（如文章詳情：登入者瀏覽要記任務）。
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(_err: unknown, user: TUser | false): TUser | null {
    return user || null; // 不丟錯，未登入 / token 無效都回 null
  }
}
