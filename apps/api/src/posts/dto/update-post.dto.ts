import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';
import { SanitizeHtml } from '../../common/sanitize';

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '標題最多 100 字' })
  @SanitizeHtml()
  title?: string;

  @IsOptional()
  @IsString()
  @SanitizeHtml()
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}
