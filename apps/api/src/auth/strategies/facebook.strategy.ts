import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-facebook';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { getClientIp } from '../../common/get-client-ip.util';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('FACEBOOK_CLIENT_ID', 'not-configured'),
      clientSecret: configService.get<string>('FACEBOOK_CLIENT_SECRET', 'not-configured'),
      callbackURL: configService.get<string>('FACEBOOK_CALLBACK_URL', 'http://localhost:4010/api/auth/facebook/callback'),
      profileFields: ['id', 'displayName', 'emails', 'photos'],
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: Error | null, user?: unknown) => void,
  ) {
    const email = profile.emails?.[0]?.value;
    const avatar = profile.photos?.[0]?.value;
    const nickname = (profile.displayName || 'User').substring(0, 8);

    const result = await this.authService.oauthLogin(
      'facebook',
      profile.id,
      { nickname, email, avatar },
      getClientIp(req),
    );
    done(null, result);
  }
}
