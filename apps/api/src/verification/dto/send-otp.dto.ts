import { IsString, IsNotEmpty } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;
}

export class ConfirmOtpDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class RequestPhoneChangeEmailDto {}

export class ConfirmPhoneChangeEmailDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
