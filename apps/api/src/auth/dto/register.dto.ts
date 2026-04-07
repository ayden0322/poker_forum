import { IsString, IsEmail, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ description: '暱稱（最多 8 字，不可更改）', example: '小明' })
  @IsString({ message: '暱稱格式不正確' })
  @MinLength(1, { message: '暱稱不能為空' })
  @MaxLength(8, { message: '暱稱最多 8 個字元' })
  nickname!: string;

  @ApiProperty({ description: '帳號（英文或數字）', example: 'user123' })
  @IsString({ message: '帳號格式不正確' })
  @MinLength(3, { message: '帳號至少 3 個字元' })
  @MaxLength(20, { message: '帳號最多 20 個字元' })
  @Matches(/^[a-zA-Z0-9]+$/, { message: '帳號只能包含英文字母或數字' })
  account!: string;

  @ApiProperty({ description: '密碼（8 字以上，需包含英文和數字）', example: 'pass1234' })
  @IsString({ message: '密碼格式不正確' })
  @MinLength(8, { message: '密碼至少 8 個字元' })
  @MaxLength(30, { message: '密碼最多 30 個字元' })
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/, { message: '密碼需包含英文字母和數字' })
  password!: string;

  @ApiPropertyOptional({ description: 'Email', example: 'user@example.com' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEmail({}, { message: 'Email 格式不正確' })
  @IsOptional()
  email?: string;
}
