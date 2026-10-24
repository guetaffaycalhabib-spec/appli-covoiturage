import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/db/base.entity';

@Entity('notifications')
@Index(['userId', 'createdAt'])
export class Notification extends BaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @Column()
  type: string;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;
}
