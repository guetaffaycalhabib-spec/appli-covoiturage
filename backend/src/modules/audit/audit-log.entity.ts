import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/db/base.entity';

/** Journal d'audit non modifiable (cahier des charges 3.1, 8.4) : un trigger interdit UPDATE et DELETE. */
@Entity('audit_logs')
@Index(['objectType', 'objectId'])
export class AuditLog extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column()
  action: string;

  @Column()
  objectType: string;

  @Column({ type: 'varchar', nullable: true })
  objectId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  before: unknown;

  @Column({ type: 'jsonb', nullable: true })
  after: unknown;

  @Column({ type: 'varchar', nullable: true })
  ip: string | null;
}
