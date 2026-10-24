import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { Notification } from './notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ConsoleSmsProvider, SMS_PROVIDERS, SmsProvider, SmsService } from './sms.provider';

function buildSmsProviders(config: AppConfig): SmsProvider[] {
  return config.smsProviders.map((name) => {
    switch (name) {
      case 'console':
        return new ConsoleSmsProvider();
      default:
        // Les passerelles réelles (locale et internationale) s'ajoutent ici.
        throw new Error(`Fournisseur SMS inconnu : ${name}`);
    }
  });
}

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    SmsService,
    { provide: SMS_PROVIDERS, inject: [APP_CONFIG], useFactory: buildSmsProviders },
  ],
  exports: [NotificationsService, SmsService],
})
export class NotificationsModule {}
