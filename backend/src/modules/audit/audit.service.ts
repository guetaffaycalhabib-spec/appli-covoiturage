import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Page, PageQuery, paginate } from '../../common/db/pagination';
import { AuditLog } from './audit-log.entity';

export interface AuditInput {
  actorId: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>) {}

  /** Enregistre une entrée ; passer `manager` pour l'inscrire dans la même transaction que l'action. */
  async record(input: AuditInput, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AuditLog) : this.logs;
    // Colonnes JSON libres : le typage profond de TypeORM ne sait pas représenter `unknown`.
    await repo.insert({
      actorId: input.actorId,
      action: input.action,
      objectType: input.objectType,
      objectId: input.objectId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      ip: input.ip ?? null,
    } as QueryDeepPartialEntity<AuditLog>);
  }

  list(query: PageQuery & { objectType?: string; objectId?: string; action?: string }): Promise<Page<AuditLog>> {
    const qb = this.logs.createQueryBuilder('log');
    if (query.objectType) qb.andWhere('log.objectType = :objectType', { objectType: query.objectType });
    if (query.objectId) qb.andWhere('log.objectId = :objectId', { objectId: query.objectId });
    if (query.action) qb.andWhere('log.action = :action', { action: query.action });
    return paginate(qb, query);
  }
}
