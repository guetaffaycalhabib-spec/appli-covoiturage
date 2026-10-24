import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/db/base.entity';

/** Message du fil d'une réservation (M-01). Le texte stocké est déjà masqué : le texte brut n'est jamais conservé. */
@Entity('messages')
@Index(['bookingId', 'createdAt'])
export class Message extends BaseEntity {
  @Column({ type: 'uuid' })
  bookingId: string;

  @Column({ type: 'uuid' })
  senderId: string;

  @Column({ type: 'varchar', length: 1000 })
  body: string;

  /** Vrai si des coordonnées ou des insultes ont été masquées. */
  @Column({ type: 'boolean', default: false })
  masked: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;
}
