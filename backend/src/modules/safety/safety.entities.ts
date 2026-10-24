import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '../../common/db/base.entity';

/** Position du conducteur pendant un trajet. Stockage chaud en mémoire à terme (Redis), archive ici. */
@Entity('trip_positions')
@Index(['tripId', 'recordedAt'])
export class TripPosition {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'uuid' })
  tripId: string;

  @Column({ type: 'double precision' })
  lat: number;

  @Column({ type: 'double precision' })
  lng: number;

  @Column({ type: 'double precision', nullable: true })
  heading: number | null;

  @Column({ type: 'double precision', nullable: true })
  speedKmh: number | null;

  @Column({ type: 'double precision', nullable: true })
  accuracyM: number | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  recordedAt: Date;
}

/** Lien de suivi en direct pour un proche, sans compte (P-31, S-11). */
@Entity('tracking_shares')
export class TrackingShare extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  tripId: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @Index({ unique: true })
  @Column()
  token: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}

export enum IncidentType {
  SOS = 'sos',
  REPORT = 'report',
}

export enum IncidentCategory {
  HARASSMENT = 'harassment',
  DANGEROUS_DRIVING = 'dangerous_driving',
  FRAUD = 'fraud',
  DISCRIMINATION = 'discrimination',
  VEHICLE_MISMATCH = 'vehicle_mismatch',
  LOST_ITEM = 'lost_item',
  OTHER = 'other',
}

export enum IncidentSeverity {
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum IncidentStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  CLOSED = 'closed',
}

/** SOS et signalements (8.2, 8.3), traités par l'équipe sécurité/support. */
@Entity('safety_incidents')
@Index(['status', 'severity', 'createdAt'])
export class SafetyIncident extends BaseEntity {
  @Column({ type: 'enum', enum: IncidentType })
  type: IncidentType;

  @Column({ type: 'enum', enum: IncidentCategory, default: IncidentCategory.OTHER })
  category: IncidentCategory;

  @Column({ type: 'enum', enum: IncidentSeverity })
  severity: IncidentSeverity;

  @Column({ type: 'enum', enum: IncidentStatus, default: IncidentStatus.OPEN })
  status: IncidentStatus;

  @Column({ type: 'uuid' })
  reporterId: string;

  @Column({ type: 'uuid', nullable: true })
  targetUserId: string | null;

  @Column({ type: 'uuid', nullable: true })
  tripId: string | null;

  @Column({ type: 'uuid', nullable: true })
  bookingId: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  description: string | null;

  @Column({ type: 'double precision', nullable: true })
  lat: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng: number | null;

  @Column({ type: 'uuid', nullable: true })
  assignedTo: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  resolution: string | null;
}
