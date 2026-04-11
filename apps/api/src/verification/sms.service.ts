import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { decrypt } from '../common/crypto.util';
import { SmsProvider, SmsSendParams, SmsSendResult } from './sms-provider.interface';
import { CustomTwSmsProvider } from './providers/custom-tw.provider';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(params: SmsSendParams): Promise<SmsSendResult> {
    const provider = await this.loadActiveProvider();
    const result = await provider.send(params);
    if (!result.success) {
      this.logger.warn(`簡訊送出失敗 → ${params.phone}：${result.error}`);
    }
    return result;
  }

  private async loadActiveProvider(): Promise<SmsProvider> {
    const config = await this.prisma.smsProviderConfig.findFirst({
      where: { enabled: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!config) {
      throw new InternalServerErrorException({
        code: 'SMS_PROVIDER_NOT_CONFIGURED',
        message: '尚未設定可用的簡訊服務商，請聯絡管理員',
      });
    }

    const runtimeConfig = {
      apiEndpoint: config.apiEndpoint,
      apiKey: decrypt(config.apiKeyEnc),
      apiSecret: config.apiSecretEnc ? decrypt(config.apiSecretEnc) : undefined,
      senderId: config.senderId || undefined,
      templateId: config.templateId || undefined,
      extraConfig: (config.extraConfig as Record<string, any>) || undefined,
    };

    switch (config.providerCode) {
      case 'custom-tw':
      default:
        return new CustomTwSmsProvider(runtimeConfig);
    }
  }
}
