import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { LedgerService } from './ledger.service';

@ApiTags('Portefeuille')
@ApiBearerAuth()
@Controller('wallet')
export class WalletController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  statement(@CurrentUser() user: AuthUser) {
    return this.ledger.walletStatement(user.id);
  }
}
