import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/db/base.entity';

export enum KycDocumentType {
  NATIONAL_ID = 'national_id',
  SELFIE = 'selfie',
  DRIVING_LICENSE = 'driving_license',
  INSURANCE = 'insurance',
  VEHICLE_REGISTRATION = 'vehicle_registration',
}

export enum KycStatus {
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  NEEDS_CORRECTION = 'needs_correction',
  REJECTED = 'rejected',
  /** Remplacé par un dépôt plus récent du même type. */
  SUPERSEDED = 'superseded',
}

/** Documents soumis à expiration : leur date d'échéance est obligatoire à la validation. */
export const EXPIRING_TYPES = [KycDocumentType.NATIONAL_ID, KycDocumentType.DRIVING_LICENSE, KycDocumentType.INSURANCE];

@Entity('kyc_documents')
@Index(['userId', 'type'])
@Index(['status', 'createdAt'])
export class KycDocument extends BaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: KycDocumentType })
  type: KycDocumentType;

  /** Référence du fichier dans le stockage objet chiffré ; jamais d'URL publique (S-04). */
  @Column()
  fileRef: string;

  @Column({ type: 'uuid', nullable: true })
  vehicleId: string | null;

  @Column({ type: 'enum', enum: KycStatus, default: KycStatus.SUBMITTED })
  status: KycStatus;

  @Column({ type: 'varchar', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'date', nullable: true })
  expiresAt: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewerId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;
}
