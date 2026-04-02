import { IsString, IsEmail, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ description: '暱稱（最多 8 字，不可更改）', example: '小明' })
  @IsString()
  @MinLength(1)
  @MaxLength(8)
  nickname!: string;

  @ApiProperty({ description: '帳號（英文或數字）', example: 'user123' })
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9]+$/, { message: '帳號只能包含英文字母或數字' })
  account!: string;

  @ApiProperty({ description: '密碼（8 字以上，需包含英文和數字）', example: 'pass1234' })
  @IsString()
  @MinLength(8, { message: '密碼至少 8 個字元' })
  @MaxLength(30)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/, { message: '密碼需包含英文字母和數字' })
  password!: string;

  @ApiPropertyOptional({ description: 'Email', example: 'user@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;
}
