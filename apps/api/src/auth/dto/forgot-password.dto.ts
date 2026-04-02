import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: '請輸入有效的 Email' })
  @IsNotEmpty({ message: '請輸入 Email' })
  email!: string;
}
