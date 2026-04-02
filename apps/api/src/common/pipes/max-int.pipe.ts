import { PipeTransform, Injectable } from '@nestjs/common';

/** 限制 query parameter 數值上限 */
@Injectable()
export class MaxIntPipe implements PipeTransform {
  constructor(private readonly max: number) {}

  transform(value: number) {
    return Math.min(value, this.max);
  }
}
