import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: '頭像 URL' })
  @IsString()
  @IsOptional()
  avatar?: string;

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
