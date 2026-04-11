import { Body, Controller, Ip, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PhoneVerificationService } from './phone-verification.service';
import { IsNotEmpty, IsString } from 'class-validator';

class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;
}

class ConfirmOtpDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}

class ConfirmEmailDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

class SendChangeOtpDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  changeSession!: string;
}

class ConfirmChangeOtpDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  changeSession!: string;
}

@Controller('verification/phone')
export class PhoneVerificationController {
  constructor(private readonly svc: PhoneVerificationService) {}

  // ===== 首次綁定 =====
  @Post('send')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 1 } })
  send(@CurrentUser('id') userId: string, @Body() dto: SendOtpDto, @Ip() ip: string) {
    return this.svc.sendBindOtp(userId, dto.phone, ip);
  }

  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  confirm(@CurrentUser('id') userId: string, @Body() dto: ConfirmOtpDto) {
    return this.svc.confirmBindOtp(userId, dto.code);
  }

  // ===== 換綁手機 =====
  @Post('change/request-email')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 1 } })
  requestEmail(@CurrentUser('id') userId: string) {
    return this.svc.requestPhoneChangeEmail(userId);
  }

  @Post('change/confirm-email')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  confirmEmail(@Body() dto: ConfirmEmailDto) {
    return this.svc.confirmPhoneChangeEmail(dto.token);
  }

  @Post('change/send')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 1 } })
  sendChange(@CurrentUser('id') userId: string, @Body() dto: SendChangeOtpDto, @Ip() ip: string) {
    return this.svc.sendChangeOtp(userId, dto.phone, dto.changeSession, ip);
  }

  @Post('change/confirm')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  confirmChange(@CurrentUser('id') userId: string, @Body() dto: ConfirmChangeOtpDto) {
    return this.svc.confirmChangeOtp(userId, dto.code, dto.changeSession);
  }
}
