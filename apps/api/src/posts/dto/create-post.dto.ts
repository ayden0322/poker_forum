import { IsString, IsNotEmpty, IsOptional, IsArray, IsEnum, IsBoolean, MaxLength } from 'class-validator';
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

  /**
   * 新聞 Agent 自動發文標記。
   * 傳 true 代表這篇走「24h 自動退置頂 + 無互動回 DRAFT」的生命週期。
   * 只有 ADMIN 角色能設為 true（service 層會驗證），玩家帶上會被忽略。
   */
  @IsOptional()
  @IsBoolean()
  isAutoPosted?: boolean;
}
