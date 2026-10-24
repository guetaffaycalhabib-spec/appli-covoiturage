import { Global, Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { MAPS_PROVIDER, StraightLineMapsProvider } from './maps.provider';

@Global()
@Module({
  controllers: [GeoController],
  providers: [{ provide: MAPS_PROVIDER, useClass: StraightLineMapsProvider }],
  exports: [MAPS_PROVIDER],
})
export class GeoModule {}
