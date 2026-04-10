import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { SanitizeRichHtml } from '../../common/sanitize';

export class CreateReplyDto {
  @IsString()
  @IsNotEmpty({ message: '請輸入回覆內容' })
  @SanitizeRichHtml()
  content!: string;

  @IsOptional()
  @IsString()
  quotedReplyId?: string;
}
