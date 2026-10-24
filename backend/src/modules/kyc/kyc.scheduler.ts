import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { KycService } from './kyc.service';

@Injectable()
export class KycScheduler {
  constructor(private readonly kyc: KycService) {}

  @Cron('0 6 * * *', { name: 'kyc-expirations', timeZone: 'Africa/Algiers' })
  run() {
    return this.kyc.processExpirations();
  }
}
