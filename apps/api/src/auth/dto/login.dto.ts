import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: '帳號', example: 'user123' })
  @IsString()
  account!: string;

  @ApiProperty({ description: '密碼', example: 'pass123' })
  @IsString()
  @MinLength(6)
  password!: string;
}
