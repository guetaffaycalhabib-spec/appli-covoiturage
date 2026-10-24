import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformSetting, PricingParameter } from './settings.entities';
import { SettingsService } from './settings.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PlatformSetting, PricingParameter])],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
