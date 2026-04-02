import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname } from 'path';

/** 允許的 MIME 類型白名單 */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Magic Number 對照表 — 驗證檔案真實類型 */
const MAGIC_NUMBERS: { mime: string; bytes: number[] }[] = [
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF header
];

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);
  private s3: S3Client;
  private bucket: string;
  private endpoint: string;
  private port: number;
  private useSSL: boolean;

  constructor(private configService: ConfigService) {
    this.endpoint = this.configService.get<string>('MINIO_ENDPOINT', 'localhost');
    this.port = this.configService.get<number>('MINIO_PORT', 9100);
    this.useSSL = this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true';
    this.bucket = this.configService.get<string>('MINIO_BUCKET', 'avatars');

    const protocol = this.useSSL ? 'https' : 'http';

    this.s3 = new S3Client({
      endpoint: `${protocol}://${this.endpoint}:${this.port}`,
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.configService.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
        secretAccessKey: this.configService.get<string>('MINIO_SECRET_KEY', 'minioadmin123'),
      },
      forcePathStyle: true, // MinIO 必須使用 path-style
    });
  }

  async onModuleInit() {
    // 確保 bucket 存在
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`MinIO bucket "${this.bucket}" 已存在`);
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`MinIO bucket "${this.bucket}" 已建立`);
      } catch (err) {
        this.logger.warn(`無法建立 bucket "${this.bucket}"：${err}`);
      }
    }

    // 確保 bucket 為公開讀取（頭像需要被所有人看到）
    try {
      const policy = JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
          Sid: 'PublicRead',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.bucket}/*`],
        }],
      });
      await this.s3.send(new PutBucketPolicyCommand({ Bucket: this.bucket, Policy: policy }));
      this.logger.log(`MinIO bucket "${this.bucket}" 公開讀取 policy 已設定`);
    } catch (err) {
      this.logger.warn(`無法設定 bucket policy：${err}`);
    }
  }

  /** 驗證並上傳頭像圖片 */
  async uploadAvatar(file: Express.Multer.File): Promise<string> {
    // 1. MIME 白名單檢查
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `不支援的圖片格式，僅允許：${ALLOWED_MIME_TYPES.map((m) => m.split('/')[1]).join(', ')}`,
      );
    }

    // 2. Magic Number 驗證 — 確認檔案內容與宣稱的類型一致
    this.validateMagicNumber(file.buffer, file.mimetype);

    // 3. 重新命名 — UUID + 原始副檔名，防止路徑穿越
    const ext = extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    const key = `avatars/${randomUUID()}${safeExt}`;

    // 4. 上傳到 MinIO
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    // 5. 回傳公開存取 URL
    const protocol = this.useSSL ? 'https' : 'http';
    return `${protocol}://${this.endpoint}:${this.port}/${this.bucket}/${key}`;
  }

  /** 驗證 Magic Number（檔案前幾個 byte） */
  private validateMagicNumber(buffer: Buffer, declaredMime: string) {
    if (buffer.length < 4) {
      throw new BadRequestException('檔案太小，無法驗證');
    }

    const matched = MAGIC_NUMBERS.some((magic) => {
      if (magic.mime !== declaredMime) return false;
      return magic.bytes.every((byte, i) => buffer[i] === byte);
    });

    if (!matched) {
      throw new BadRequestException('檔案內容與宣稱的類型不符，請確認上傳的是真正的圖片檔案');
    }
  }
}
