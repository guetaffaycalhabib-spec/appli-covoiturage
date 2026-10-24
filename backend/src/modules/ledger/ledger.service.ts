import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DomainError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { LedgerAccount, LedgerAccountType, LedgerEntry, LedgerTransaction } from './ledger.entities';

export const PLATFORM_REVENUE = 'platform:revenue';
export const PLATFORM_ESCROW = 'platform:escrow';
export const CASH_CLEARING = 'platform:cash_clearing';
export const walletCode = (userId: string) => `wallet:${userId}`;

export interface LedgerLine {
  debit: string;
  credit: string;
  amount: number;
}

export interface PostInput {
  idempotencyKey: string;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  authorId?: string | null;
  lines: LedgerLine[];
}

const PLATFORM_TYPES: Record<string, LedgerAccountType> = {
  [PLATFORM_REVENUE]: LedgerAccountType.PLATFORM_REVENUE,
  [PLATFORM_ESCROW]: LedgerAccountType.PLATFORM_ESCROW,
  [CASH_CLEARING]: LedgerAccountType.CASH_CLEARING,
};

/**
 * Grand livre interne (cahier des charges 7.2) : écritures en partie double, immuables, soldes dérivés,
 * opérations idempotentes. Les opérations métier passent un `EntityManager` pour s'inscrire dans la
 * transaction de la réservation ou du trajet concerné.
 */
@Injectable()
export class LedgerService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async post(m: EntityManager, input: PostInput): Promise<LedgerTransaction | null> {
    const existing = await m.findOneBy(LedgerTransaction, { idempotencyKey: input.idempotencyKey });
    if (existing) return existing;
    const lines = input.lines.filter((l) => l.amount !== 0);
    for (const line of lines) {
      if (!Number.isInteger(line.amount) || line.amount < 0) throw new Error(`Montant d'écriture invalide : ${line.amount}`);
    }
    if (lines.length === 0) return null;

    const tx = await m.save(
      LedgerTransaction,
      m.create(LedgerTransaction, {
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        authorId: input.authorId ?? null,
      }),
    );
    for (const line of lines) {
      const [debit, credit] = await Promise.all([this.account(m, line.debit), this.account(m, line.credit)]);
      await m.insert(LedgerEntry, { transactionId: tx.id, debitAccountId: debit.id, creditAccountId: credit.id, amount: line.amount });
    }
    return tx;
  }

  /** Solde = crédits − débits. Pour un portefeuille, un solde positif est dû à l'utilisateur. */
  async balance(code: string, m: EntityManager = this.dataSource.manager): Promise<number> {
    const account = await m.findOneBy(LedgerAccount, { code });
    if (!account) return 0;
    const [{ balance }] = await m.query(
      `SELECT COALESCE(SUM(CASE WHEN "creditAccountId" = $1 THEN amount ELSE -amount END), 0)::int AS balance
         FROM ledger_entries WHERE "creditAccountId" = $1 OR "debitAccountId" = $1`,
      [account.id],
    );
    return balance;
  }

  walletBalance(userId: string, m?: EntityManager): Promise<number> {
    return this.balance(walletCode(userId), m);
  }

  /**
   * Verrouille le portefeuille et vérifie le solde avant un débit, pour qu'un même solde ne serve pas
   * deux réservations concurrentes.
   */
  async assertSufficientBalance(m: EntityManager, userId: string, amount: number): Promise<void> {
    const account = await this.account(m, walletCode(userId));
    await m.query('SELECT id FROM ledger_accounts WHERE id = $1 FOR UPDATE', [account.id]);
    const balance = await this.balance(account.code, m);
    if (balance < amount) {
      throw new DomainError('INSUFFICIENT_BALANCE', 'Solde du portefeuille insuffisant', 422, { balance, required: amount });
    }
  }

  async walletStatement(userId: string, limit = 50) {
    const account = await this.dataSource.manager.findOneBy(LedgerAccount, { code: walletCode(userId) });
    if (!account) return { balance: 0, entries: [] };
    const entries: { amount: number; reason: string; referenceType: string | null; referenceId: string | null; createdAt: Date }[] =
      await this.dataSource.query(
        `SELECT CASE WHEN e."creditAccountId" = $1 THEN e.amount ELSE -e.amount END AS amount,
                t.reason, t."referenceType", t."referenceId", e."createdAt"
           FROM ledger_entries e JOIN ledger_transactions t ON t.id = e."transactionId"
          WHERE e."creditAccountId" = $1 OR e."debitAccountId" = $1
          ORDER BY e."createdAt" DESC, e.id DESC LIMIT $2`,
        [account.id, limit],
      );
    return { balance: await this.balance(account.code), entries };
  }

  /** Recharge du portefeuille en agence ou point partenaire, saisie par la finance (7.1). */
  async topUp(userId: string, amount: number, idempotencyKey: string, actorId: string, ip?: string) {
    if (!Number.isInteger(amount) || amount <= 0) throw new DomainError('INVALID_AMOUNT', 'Montant invalide');
    return this.dataSource.transaction(async (m) => {
      const tx = await this.post(m, {
        idempotencyKey: `topup:${idempotencyKey}`,
        reason: 'wallet_top_up',
        referenceType: 'user',
        referenceId: userId,
        authorId: actorId,
        lines: [{ debit: CASH_CLEARING, credit: walletCode(userId), amount }],
      });
      await this.audit.record({ actorId, action: 'wallet.top_up', objectType: 'user', objectId: userId, after: { amount, transactionId: tx?.id }, ip }, m);
      return { transactionId: tx?.id, balance: await this.balance(walletCode(userId), m) };
    });
  }

  /**
   * Rapprochement : l'équilibre global (somme des soldes nulle) est garanti par construction ; on vérifie
   * en plus que le séquestre correspond exactement aux réservations payées par portefeuille encore bloquées.
   */
  async reconciliation() {
    const balances: { type: LedgerAccountType; balance: number }[] = await this.dataSource.query(
      `SELECT a.type,
              COALESCE(SUM(CASE WHEN e."creditAccountId" = a.id THEN e.amount ELSE -e.amount END), 0)::int AS balance
         FROM ledger_accounts a
         LEFT JOIN ledger_entries e ON e."creditAccountId" = a.id OR e."debitAccountId" = a.id
        GROUP BY a.type`,
    );
    const [{ total }] = await this.dataSource.query(`SELECT COALESCE(SUM(amount), 0)::int AS total FROM ledger_entries`);
    const [{ held }] = await this.dataSource.query(
      `SELECT COALESCE(SUM("totalPrice"), 0)::int AS held FROM bookings WHERE "paymentStatus" = 'held'`,
    );
    const byType = Object.fromEntries(balances.map((b) => [b.type, b.balance]));
    const escrow = byType[LedgerAccountType.PLATFORM_ESCROW] ?? 0;
    const sum = balances.reduce((acc, b) => acc + b.balance, 0);
    return {
      balanced: sum === 0,
      escrowMatchesHeldBookings: escrow === held,
      balancesByType: byType,
      escrowBalance: escrow,
      heldBookingsTotal: held,
      totalVolume: total,
      checkedAt: new Date(),
    };
  }

  private async account(m: EntityManager, code: string): Promise<LedgerAccount> {
    const found = await m.findOneBy(LedgerAccount, { code });
    if (found) return found;
    const isWallet = code.startsWith('wallet:');
    const type = isWallet ? LedgerAccountType.USER_WALLET : PLATFORM_TYPES[code];
    if (!type) throw new Error(`Compte comptable inconnu : ${code}`);
    await m
      .createQueryBuilder()
      .insert()
      .into(LedgerAccount)
      .values({ code, type, ownerId: isWallet ? code.slice('wallet:'.length) : null })
      .orIgnore()
      .execute();
    return m.findOneByOrFail(LedgerAccount, { code });
  }
}
