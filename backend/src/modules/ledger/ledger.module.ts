import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerAccount, LedgerEntry, LedgerTransaction } from './ledger.entities';
import { LedgerService } from './ledger.service';
import { WalletController } from './wallet.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([LedgerAccount, LedgerEntry, LedgerTransaction])],
  controllers: [WalletController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
