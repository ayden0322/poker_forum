import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-oauth2';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  email?: string;
}

@Injectable()
export class LineStrategy extends PassportStrategy(Strategy, 'line') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      authorizationURL: 'https://access.line.me/oauth2/v2.1/authorize',
      tokenURL: 'https://api.line.me/oauth2/v2.1/token',
      clientID: configService.get<string>('LINE_CHANNEL_ID', 'not-configured'),
      clientSecret: configService.get<string>('LINE_CHANNEL_SECRET', 'not-configured'),
      callbackURL: configService.get<string>('LINE_CALLBACK_URL', 'http://localhost:4010/api/auth/line/callback'),
      scope: ['profile', 'openid', 'email'],
    });
  }

  async validate(accessToken: string): Promise<unknown> {
    // 呼叫 LINE Profile API
    const response = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = (await response.json()) as LineProfile;

    const result = await this.authService.oauthLogin('line', profile.userId, {
      nickname: (profile.displayName || 'User').substring(0, 8),
      avatar: profile.pictureUrl,
      email: profile.email,
    });
    return result;
  }
}
