import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { TagsService } from './tags.service';

@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(private tagsService: TagsService) {}

  @Get()
  @ApiQuery({ name: 'category', required: false, description: '分類 slug，帶上時只回該分類看板可用的標籤' })
  async findAll(@Query('category') category?: string) {
    const data = await this.tagsService.findAll(category);
    return { data };
  }
}
