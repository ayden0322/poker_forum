import { BadRequestException, Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsObject } from 'class-validator';
import { Prisma } from '@betting-forum/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@betting-forum/database';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../common/prisma.service';
import { decrypt, encrypt, maskSecret } from '../common/crypto.util';
import { SmsService } from '../verification/sms.service';
import { normalizeTwMobile, generateOtp } from '../verification/phone.util';

class UpsertSmsProviderDto {
  @IsString() providerCode!: string;
  @IsString() displayName!: string;
  @IsBoolean() enabled!: boolean;
  @IsString() apiEndpoint!: string;

  // 若為空字串 / undefined 代表「不更新」現有值；明文字串會被加密
  @IsOptional() @IsString() apiKey?: string;
  @IsOptional() @IsString() apiSecret?: string;

  @IsOptional() @IsString() senderId?: string;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsObject() extraConfig?: Record<string, any>;
}

class TestSmsDto {
  @IsString() phone!: string;
}

@ApiTags('admin:sms-provider')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/sms-provider')
export class AdminSmsProviderController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  @Get()
  async getActive() {
    const rows = await this.prisma.smsProviderConfig.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    const data = rows.map((r) => ({
      id: r.id,
      providerCode: r.providerCode,
      displayName: r.displayName,
      enabled: r.enabled,
      apiEndpoint: r.apiEndpoint,
      apiKeyMasked: maskSecret(safeDecrypt(r.apiKeyEnc)),
      apiSecretMasked: r.apiSecretEnc ? maskSecret(safeDecrypt(r.apiSecretEnc)) : '',
      senderId: r.senderId,
      templateId: r.templateId,
      extraConfig: r.extraConfig,
      updatedAt: r.updatedAt,
      updatedBy: r.updatedBy,
    }));
    return { data };
  }

  @Put()
  async upsert(@CurrentUser('id') adminId: string, @Body() dto: UpsertSmsProviderDto) {
    const existing = await this.prisma.smsProviderConfig.findUnique({
      where: { providerCode: dto.providerCode },
    });

    // 若啟用該廠商，同時把其他的停用
    const data: any = {
      displayName: dto.displayName,
      enabled: dto.enabled,
      apiEndpoint: dto.apiEndpoint,
      senderId: dto.senderId ?? null,
      templateId: dto.templateId ?? null,
      extraConfig: dto.extraConfig ?? Prisma.JsonNull,
      updatedBy: adminId,
      ...(dto.apiKey ? { apiKeyEnc: encrypt(dto.apiKey) } : {}),
      ...(dto.apiSecret ? { apiSecretEnc: encrypt(dto.apiSecret) } : {}),
    };

    if (dto.enabled) {
      await this.prisma.smsProviderConfig.updateMany({
        where: { NOT: { providerCode: dto.providerCode } },
        data: { enabled: false },
      });
    }

    const saved = existing
      ? await this.prisma.smsProviderConfig.update({
          where: { providerCode: dto.providerCode },
          data,
        })
      : await this.prisma.smsProviderConfig.create({
          data: {
            providerCode: dto.providerCode,
            apiKeyEnc: dto.apiKey ? encrypt(dto.apiKey) : '',
            ...data,
          },
        });

    if (!existing && !dto.apiKey) {
      throw new BadRequestException('首次建立必須提供 API Key');
    }

    return { data: { id: saved.id, providerCode: saved.providerCode } };
  }

  @Post('test')
  async test(@Body() dto: TestSmsDto) {
    const phone = normalizeTwMobile(dto.phone);
    const result = await this.sms.send({ phone, code: generateOtp() });
    return { data: result };
  }
}

function safeDecrypt(enc: string): string {
  try {
    return decrypt(enc);
  } catch {
    return '';
  }
}
