import {
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  IsISO8601,
  IsIn,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

/** 公開端點：落地頁回報點擊 */
export class TrackVisitDto {
  @ApiProperty({ description: '推廣碼', example: 'FB2026' })
  @IsString()
  @MaxLength(32)
  code!: string;

  @ApiProperty({ description: '匿名訪客 id（cookie 內隨機值）' })
  @IsString()
  @MaxLength(64)
  visitorId!: string;
}

/** 後台：建立推廣廠商 */
export class CreatePartnerDto {
  @ApiProperty({ description: '廠商名稱' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({ description: '聯絡方式' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contact?: string;

  @ApiPropertyOptional({ description: '備註' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** 後台：更新推廣廠商 */
export class UpdatePartnerDto {
  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contact?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'], { message: '狀態只能是 ACTIVE 或 DISABLED' })
  status?: 'ACTIVE' | 'DISABLED';
}

/** 後台：建立推廣碼（code 留空則自動產生） */
export class CreateCodeDto {
  @ApiProperty({ description: '所屬廠商 id' })
  @IsString()
  partnerId!: string;

  @ApiPropertyOptional({ description: '自訂碼（留空自動產生）；僅限英數字 4-32 碼' })
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : String(value).trim().toUpperCase(),
  )
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  @Matches(/^[A-Z0-9]+$/, { message: '推廣碼只能包含英文字母或數字' })
  code?: string;

  @ApiPropertyOptional({ description: '渠道標記（FB/IG/LINE…）' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  channel?: string;

  @ApiPropertyOptional({ description: '到期時間（ISO8601）' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @ApiPropertyOptional({ description: '備註' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** 後台：更新推廣碼 */
export class UpdateCodeDto {
  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  channel?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'], { message: '狀態只能是 ACTIVE 或 DISABLED' })
  status?: 'ACTIVE' | 'DISABLED';

  @ApiPropertyOptional({ description: '到期時間（ISO8601）；傳空字串/null 可清除' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '') // 允許 null/空字串清除到期，其餘要合法日期
  @IsISO8601({}, { message: '到期時間格式不正確' })
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** 後台：報表查詢區間 */
export class ReportQueryDto {
  @ApiPropertyOptional({ description: '起始（ISO8601，含）' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: '結束（ISO8601，含）' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ description: '只看某廠商' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  partnerId?: string;
}
