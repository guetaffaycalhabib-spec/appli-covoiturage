import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycController } from './kyc.controller';
import { KycDocument } from './kyc-document.entity';
import { KycScheduler } from './kyc.scheduler';
import { KycService } from './kyc.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([KycDocument])],
  controllers: [KycController],
  providers: [KycService, KycScheduler],
  exports: [KycService],
})
export class KycModule {}
