import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UploadService } from './upload.service';
import { PrismaService } from '../common/prisma.service';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

@ApiTags('上傳')
@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: '上傳頭像' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_SIZE } }))
  async uploadAvatar(
    @CurrentUser() user: { id: string },
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_AVATAR_SIZE, message: '圖片大小不能超過 2MB' }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp|gif)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('請選擇要上傳的圖片');

    // 上傳到 MinIO（內含 magic number 驗證）
    const url = await this.uploadService.uploadAvatar(file);

    // 更新使用者頭像
    await this.prisma.user.update({
      where: { id: user.id },
      data: { avatar: url },
    });

    return { data: { url } };
  }

  @Post('image')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: '上傳文章/回覆圖片' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE } }))
  async uploadImage(
    @CurrentUser() _user: { id: string },
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_IMAGE_SIZE, message: '圖片大小不能超過 5MB' }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp|gif)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('請選擇要上傳的圖片');

    const url = await this.uploadService.uploadImage(file);
    return { data: { url } };
  }
}
