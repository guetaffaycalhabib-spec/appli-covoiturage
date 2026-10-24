import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/decorators';
import { searchWilayas } from './wilayas';

@ApiTags('Référentiel géographique')
@Controller('geo')
export class GeoController {
  @Public()
  @Get('wilayas')
  wilayas(@Query('q') q?: string) {
    return searchWilayas(q ?? '');
  }
}
