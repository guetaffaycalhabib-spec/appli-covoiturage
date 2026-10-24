import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Tables en ajout seul : toute modification ou suppression est refusée par la base (7.2, 8.4). */
const APPEND_ONLY_TABLES = ['audit_logs', 'ledger_entries', 'ledger_transactions'];

/**
 * Installe les garde-fous qui ne s'expriment pas par les décorateurs TypeORM. Idempotent : exécuté à
 * chaque démarrage, après les migrations.
 */
@Injectable()
export class DatabaseGuards implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.dataSource.query(`
      CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'La table % est en ajout seul', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
      END;
      $$ LANGUAGE plpgsql;
    `);
    for (const table of APPEND_ONLY_TABLES) {
      await this.dataSource.query(`DROP TRIGGER IF EXISTS ${table}_append_only ON ${table}`);
      await this.dataSource.query(
        `CREATE TRIGGER ${table}_append_only BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION forbid_mutation()`,
      );
    }
  }
}
