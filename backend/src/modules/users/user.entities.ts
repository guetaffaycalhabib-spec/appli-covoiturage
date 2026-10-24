import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { StaffRole } from '../../common/auth/auth.types';
import { BaseEntity } from '../../common/db/base.entity';

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

export enum Gender {
  FEMALE = 'female',
  MALE = 'male',
}

export enum Language {
  FR = 'fr',
  AR = 'ar',
}

/**
 * Compte unique pouvant cumuler les rôles passager et conducteur (cahier des charges 2.1, 3).
 * Les droits découlent du statut, du niveau de confiance (KYC) et des rôles du personnel — jamais des écrans.
 */
@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column()
  phone: string;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastName: string | null;

  @Column({ type: 'date', nullable: true })
  birthDate: string | null;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  bio: string | null;

  @Column({ type: 'varchar', nullable: true })
  photoRef: string | null;

  @Column({ type: 'enum', enum: Language, default: Language.FR })
  language: Language;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  /** Niveau de confiance (S-01), recalculé par le module KYC. */
  @Column({ type: 'int', default: 0 })
  trustLevel: number;

  @Column({ type: 'boolean', default: false })
  womenOnlyMode: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  driverCharterAcceptedAt: Date | null;

  @Column({ type: 'double precision', default: 0 })
  ratingAverage: number;

  @Column({ type: 'int', default: 0 })
  ratingCount: number;

  /** Score de fiabilité (0 à 100), réduit par les annulations tardives et absences (6.5). */
  @Column({ type: 'int', default: 100 })
  reliabilityScore: number;

  @Column({ type: 'enum', enum: StaffRole, array: true, default: '{}' })
  staffRoles: StaffRole[];

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('emergency_contacts')
export class EmergencyContact extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column()
  name: string;

  @Column()
  phone: string;
}

/** Blocage mutuel (8.3) : les deux personnes ne sont plus jamais appariées. */
@Entity('user_blocks')
export class UserBlock {
  @PrimaryColumn({ type: 'uuid' })
  blockerId: string;

  @PrimaryColumn({ type: 'uuid' })
  blockedId: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
