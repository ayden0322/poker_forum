import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: '頭像 URL' })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiPropertyOptional({ description: '新暱稱（1-8 字，每 7 天可更改一次）' })
  @IsString({ message: '暱稱格式不正確' })
  @MinLength(1, { message: '暱稱不能為空' })
  @MaxLength(8, { message: '暱稱最多 8 個字元' })
  @IsOptional()
  nickname?: string;

  @ApiPropertyOptional({ description: '新密碼（六字以上英文或數字）' })
  @IsString()
  @MinLength(6)
  @MaxLength(30)
  @IsOptional()
  newPassword?: string;

  @ApiPropertyOptional({ description: '目前密碼（更改密碼時必填）' })
  @IsString()
  @IsOptional()
  currentPassword?: string;
}
