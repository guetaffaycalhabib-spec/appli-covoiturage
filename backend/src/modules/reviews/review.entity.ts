import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/db/base.entity';

export const REVIEW_TAGS = ['punctuality', 'cleanliness', 'driving', 'respect', 'friendliness', 'communication'] as const;

@Entity('reviews')
@Index(['bookingId', 'authorId'], { unique: true })
@Index(['targetId', 'createdAt'])
@Check('"rating" BETWEEN 1 AND 5')
export class Review extends BaseEntity {
  @Column({ type: 'uuid' })
  bookingId: string;

  @Column({ type: 'uuid' })
  tripId: string;

  @Column({ type: 'uuid' })
  authorId: string;

  @Column({ type: 'uuid' })
  targetId: string;

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'varchar', length: 1000, nullable: true })
  comment: string | null;

  /** Masqué par la modération : n'apparaît plus et ne compte plus dans la note. */
  @Column({ type: 'boolean', default: false })
  hidden: boolean;
}
