import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../../common/errors';

export interface SmsProvider {
  readonly name: string;
  send(to: string, text: string): Promise<void>;
}

export const SMS_PROVIDERS = Symbol('SMS_PROVIDERS');

/** Fournisseur de développement : écrit le SMS dans les journaux. Ne jamais l'activer en production. */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  private readonly logger = new Logger('ConsoleSms');

  async send(to: string, text: string): Promise<void> {
    this.logger.log(`SMS → ${to} : ${text}`);
  }
}

/**
 * Envoi de SMS avec bascule entre passerelles (cahier des charges 11.5, 13.1) :
 * les fournisseurs sont essayés dans l'ordre jusqu'au premier succès.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(@Inject(SMS_PROVIDERS) private readonly providers: SmsProvider[]) {}

  async send(to: string, text: string): Promise<string> {
    for (const provider of this.providers) {
      try {
        await provider.send(to, text);
        return provider.name;
      } catch (err) {
        this.logger.warn(`Échec SMS via ${provider.name}, bascule : ${(err as Error).message}`);
      }
    }
    throw new DomainError('SMS_UNAVAILABLE', "Envoi du SMS impossible pour le moment, réessayez dans quelques instants", 503);
  }
}
