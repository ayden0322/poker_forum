import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID', 'not-configured'),
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET', 'not-configured'),
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL', 'http://localhost:4010/api/auth/google/callback'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0]?.value;
    const avatar = profile.photos?.[0]?.value;
    const nickname = (profile.displayName || profile.name?.givenName || 'User').substring(0, 8);

    const result = await this.authService.oauthLogin('google', profile.id, {
      nickname,
      email,
      avatar,
    });
    done(null, result);
  }
}
