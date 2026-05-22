import { IsString, IsNotEmpty, IsOptional, IsArray, IsEnum, MaxLength } from 'class-validator';
import { PostStatus } from '@betting-forum/database';
import { SanitizeHtml, SanitizeRichHtml } from '../../common/sanitize';

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
  @SanitizeRichHtml()
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  /**
   * 文章狀態。預設 PUBLISHED 維持向後相容（玩家發文一律公開）。
   * Agent 自動發文或 admin 想存草稿時傳 'DRAFT'，需後台審核發布。
   */
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;
}
