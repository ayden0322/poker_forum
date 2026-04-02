import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateReportDto {
  @IsOptional()
  @IsString()
  postId?: string;

  @IsOptional()
  @IsString()
  replyId?: string;

  @IsString()
  @IsNotEmpty({ message: '請輸入檢舉原因' })
  reason!: string;
}
