import { Check, Column, Entity, Index, UpdateDateColumn } from 'typeorm';
import { BaseEntity } from '../../common/db/base.entity';
import { LatLng } from '../../common/utils/geo';

export enum TripStatus {
  PUBLISHED = 'published',
  FULL = 'full',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum AcceptanceMode {
  INSTANT = 'instant',
  MANUAL = 'manual',
}

export interface TripStop extends LatLng {
  label: string;
  wilaya?: number;
}

export interface TripRules {
  smoking: boolean;
  pets: boolean;
  luggage: 'small' | 'medium' | 'large';
  music: boolean;
}

/**
 * Trajet publié (cahier des charges 14.1). Les contraintes CHECK garantissent, même en cas d'appel direct
 * à la base ou de bogue applicatif, qu'un prix ne dépasse jamais le plafond (critère d'acceptation 3)
 * et que le compteur de places reste cohérent.
 */
@Entity('trips')
@Index(['status', 'departureAt'])
@Check('trip_price_within_cap', '"pricePerSeat" > 0 AND "pricePerSeat" <= "priceCap"')
@Check('trip_seats_consistent', '"seatsAvailable" >= 0 AND "seatsAvailable" <= "seatsTotal"')
export class Trip extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  driverId: string;

  @Column({ type: 'uuid' })
  vehicleId: string;

  @Column({ type: 'jsonb' })
  origin: TripStop;

  @Column({ type: 'jsonb' })
  destination: TripStop;

  @Column({ type: 'jsonb', default: [] })
  stops: TripStop[];

  @Column({ type: 'varchar', length: 300, nullable: true })
  meetingPointDescription: string | null;

  @Column({ type: 'jsonb' })
  polyline: LatLng[];

  @Column({ type: 'double precision' })
  distanceKm: number;

  @Column({ type: 'int' })
  durationMinutes: number;

  @Column({ type: 'timestamptz' })
  departureAt: Date;

  @Column({ type: 'int' })
  seatsTotal: number;

  @Column({ type: 'int' })
  seatsAvailable: number;

  @Column({ type: 'int' })
  pricePerSeat: number;

  @Column({ type: 'int' })
  priceCap: number;

  @Column({ type: 'int' })
  priceRoundingStep: number;

  @Column({ type: 'uuid', nullable: true })
  pricingParameterId: string | null;

  @Column({ type: 'enum', enum: AcceptanceMode, default: AcceptanceMode.MANUAL })
  acceptanceMode: AcceptanceMode;

  @Column({ type: 'boolean', default: false })
  womenOnly: boolean;

  @Column({ type: 'jsonb' })
  rules: TripRules;

  @Column({ type: 'int', default: 10 })
  waitingToleranceMinutes: number;

  @Column({ type: 'enum', enum: TripStatus, default: TripStatus.PUBLISHED })
  status: TripStatus;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  cancellationReason: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

export enum BookingStatus {
  /** En attente de la réponse du conducteur (acceptation manuelle). */
  PENDING = 'pending',
  /** Acceptée par le conducteur (ou instantanée) et paiement garanti : place réservée. */
  CONFIRMED = 'confirmed',
  REFUSED = 'refused',
  /** Passager à bord, code de prise en charge validé. */
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED_BY_PASSENGER = 'cancelled_by_passenger',
  CANCELLED_BY_DRIVER = 'cancelled_by_driver',
  EXPIRED = 'expired',
  NO_SHOW = 'no_show',
}

/** Statuts qui occupent une place sur le trajet. */
export const SEAT_HOLDING_STATUSES = [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS];

export enum PaymentMethod {
  CASH = 'cash',
  WALLET = 'wallet',
}

export enum PaymentStatus {
  /** Espèces à remettre au conducteur. */
  CASH_DUE = 'cash_due',
  CASH_COLLECTED = 'cash_collected',
  /** Montant bloqué sur le portefeuille du passager (séquestre). */
  HELD = 'held',
  CAPTURED = 'captured',
  REFUNDED = 'refunded',
  NONE = 'none',
}

@Entity('bookings')
@Index(['tripId', 'status'])
@Index(['passengerId', 'idempotencyKey'], { unique: true, where: '"idempotencyKey" IS NOT NULL' })
@Check('booking_seats_positive', '"seats" >= 1')
@Check('booking_price_consistent', '"totalPrice" = "pricePerSeat" * "seats" AND "commissionAmount" >= 0 AND "commissionAmount" <= "totalPrice"')
export class Booking extends BaseEntity {
  @Column({ type: 'uuid' })
  tripId: string;

  @Index()
  @Column({ type: 'uuid' })
  passengerId: string;

  @Index()
  @Column({ type: 'uuid' })
  driverId: string;

  @Column({ type: 'int' })
  seats: number;

  @Column({ type: 'jsonb' })
  pickup: TripStop;

  @Column({ type: 'jsonb' })
  dropoff: TripStop;

  @Column({ type: 'double precision' })
  segmentKm: number;

  @Column({ type: 'int' })
  pricePerSeat: number;

  @Column({ type: 'int' })
  totalPrice: number;

  /** Frais de service inclus dans le prix affiché (7.3). */
  @Column({ type: 'int', default: 0 })
  commissionAmount: number;

  @Column({ type: 'enum', enum: BookingStatus })
  status: BookingStatus;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.CASH })
  paymentMethod: PaymentMethod;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.NONE })
  paymentStatus: PaymentStatus;

  /** Code de prise en charge à 4 chiffres, visible du seul passager (P-23, S-13). */
  @Column({ type: 'varchar', length: 4, nullable: true })
  pickupCode: string | null;

  @Column({ type: 'int', default: 0 })
  pickupCodeAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  responseDeadline: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  boardedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  dropoffConfirmedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  cancellationReason: string | null;

  @Column({ type: 'int', default: 0 })
  cancellationFee: number;

  @Column({ type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** Alerte de trajet (P-15) : notifiée quand un trajet compatible est publié. */
@Entity('trip_alerts')
@Index(['date', 'active'])
export class TripAlert extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  passengerId: string;

  @Column({ type: 'jsonb' })
  origin: TripStop;

  @Column({ type: 'jsonb' })
  destination: TripStop;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', default: 1 })
  seats: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  notifiedAt: Date | null;
}

/** Recherche sans résultat, pour la carte de la demande (C-45, 6.4). */
@Entity('search_misses')
@Index(['date'])
export class SearchMiss extends BaseEntity {
  @Column({ type: 'jsonb' })
  origin: LatLng & { wilaya?: number };

  @Column({ type: 'jsonb' })
  destination: LatLng & { wilaya?: number };

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int' })
  seats: number;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;
}
