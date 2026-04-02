import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { SanitizeHtml } from '../../common/sanitize';

export class CreateReplyDto {
  @IsString()
  @IsNotEmpty({ message: '請輸入回覆內容' })
  @SanitizeHtml()
  content!: string;

  @IsOptional()
  @IsString()
  quotedReplyId?: string;
}
