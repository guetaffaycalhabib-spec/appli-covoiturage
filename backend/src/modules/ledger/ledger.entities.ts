import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/db/base.entity';

export enum LedgerAccountType {
  USER_WALLET = 'user_wallet',
  PLATFORM_REVENUE = 'platform_revenue',
  /** Sommes réservées sur le portefeuille d'un passager, en attente de la fin du trajet. */
  PLATFORM_ESCROW = 'platform_escrow',
  /** Contrepartie des espèces reçues en agence ou point partenaire lors des recharges. */
  CASH_CLEARING = 'cash_clearing',
}

@Entity('ledger_accounts')
export class LedgerAccount extends BaseEntity {
  /** Code stable : `wallet:<userId>`, `platform:revenue`, `platform:escrow`, `platform:cash_clearing`. */
  @Index({ unique: true })
  @Column()
  code: string;

  @Column({ type: 'uuid', nullable: true })
  ownerId: string | null;

  @Column({ type: 'enum', enum: LedgerAccountType })
  type: LedgerAccountType;

  @Column({ default: 'DZD' })
  currency: string;
}

/** Opération métier regroupant une ou plusieurs écritures ; la clé d'idempotence la rend rejouable sans effet. */
@Entity('ledger_transactions')
export class LedgerTransaction extends BaseEntity {
  @Index({ unique: true })
  @Column()
  idempotencyKey: string;

  @Column()
  reason: string;

  @Column({ type: 'varchar', nullable: true })
  referenceType: string | null;

  @Column({ type: 'varchar', nullable: true })
  referenceId: string | null;

  @Column({ type: 'uuid', nullable: true })
  authorId: string | null;
}

/** Écriture en partie double, immuable (trigger), montant entier en DA (7.2). */
@Entity('ledger_entries')
@Check('"amount" > 0')
@Check('"debitAccountId" <> "creditAccountId"')
export class LedgerEntry extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  transactionId: string;

  @Index()
  @Column({ type: 'uuid' })
  debitAccountId: string;

  @Index()
  @Column({ type: 'uuid' })
  creditAccountId: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ default: 'DZD' })
  currency: string;
}
