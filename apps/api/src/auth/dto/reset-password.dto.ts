import { IsString, IsNotEmpty, MinLength, MaxLength, Matches } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: '缺少重設 token' })
  token!: string;

  @IsString()
  @MinLength(8, { message: '密碼至少 8 個字元' })
  @MaxLength(30)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/, { message: '密碼需包含英文字母和數字' })
  newPassword!: string;
}
