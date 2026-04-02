import { IsString, IsNotEmpty, IsOptional, IsArray, MaxLength } from 'class-validator';
import { SanitizeHtml } from '../../common/sanitize';

export class CreatePostDto {
  @IsString()
  @IsNotEmpty({ message: '請選擇看板' })
  boardId!: string;

  @IsString()
  @IsNotEmpty({ message: '請輸入標題' })
  @MaxLength(100, { message: '標題最多 100 字' })
  @SanitizeHtml()
  title!: string;

  @IsString()
  @IsNotEmpty({ message: '請輸入內容' })
  @SanitizeHtml()
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}
