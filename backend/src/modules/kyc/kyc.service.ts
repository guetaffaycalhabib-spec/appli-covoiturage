import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { DomainError, forbidden, notFound } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Gender, User, UserStatus } from '../users/user.entities';
import { UsersService } from '../users/users.service';
import { VehicleStatus } from '../vehicles/vehicle.entity';
import { VehiclesService } from '../vehicles/vehicles.service';
import { ApproveDocumentDto, RejectDocumentDto, SubmitDocumentDto } from './kyc.dto';
import { EXPIRING_TYPES, KycDocument, KycDocumentType, KycStatus } from './kyc-document.entity';

export interface KycEvaluation {
  trustLevel: number;
  verified: boolean;
  /** Pièces validées et en cours de validité à la date évaluée. */
  validTypes: KycDocumentType[];
  /** Ce qui manque pour pouvoir publier un trajet. */
  missingForDriving: string[];
}

const isValidAt = (doc: KycDocument, at: Date) =>
  doc.status === KycStatus.APPROVED && (!doc.expiresAt || new Date(`${doc.expiresAt}T23:59:59Z`) >= at);

@Injectable()
export class KycService {
  constructor(
    @InjectRepository(KycDocument) private readonly documents: Repository<KycDocument>,
    private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly vehicles: VehiclesService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async submit(userId: string, dto: SubmitDocumentDto): Promise<KycDocument> {
    if (dto.type === KycDocumentType.VEHICLE_REGISTRATION) {
      await this.vehicles.getOwned(userId, dto.vehicleId!);
    }
    return this.dataSource.transaction(async (m) => {
      // Un nouveau dépôt remplace le dépôt en attente ou à corriger du même type (et du même véhicule).
      await m.update(
        KycDocument,
        {
          userId,
          type: dto.type,
          ...(dto.vehicleId ? { vehicleId: dto.vehicleId } : {}),
          status: In([KycStatus.SUBMITTED, KycStatus.NEEDS_CORRECTION]),
        },
        { status: KycStatus.SUPERSEDED },
      );
      return m.save(KycDocument, m.create(KycDocument, { userId, type: dto.type, fileRef: dto.fileRef, vehicleId: dto.vehicleId ?? null }));
    });
  }

  listForUser(userId: string): Promise<KycDocument[]> {
    return this.documents.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Niveaux de confiance (S-01) :
   *  0 téléphone vérifié ; 1 pièce d'identité et selfie validés ; 2 permis, assurance et un véhicule validés.
   *  Le niveau 3 (« conducteur de confiance ») relève des incitations de la phase 2.
   */
  async evaluate(userId: string, at = new Date()): Promise<KycEvaluation> {
    const docs = await this.documents.find({ where: { userId, status: KycStatus.APPROVED } });
    const valid = new Set(docs.filter((d) => isValidAt(d, at)).map((d) => d.type));
    const has = (t: KycDocumentType) => valid.has(t);

    const level1 = has(KycDocumentType.NATIONAL_ID) && has(KycDocumentType.SELFIE);
    const missing: string[] = [];
    if (!has(KycDocumentType.NATIONAL_ID)) missing.push(KycDocumentType.NATIONAL_ID);
    if (!has(KycDocumentType.SELFIE)) missing.push(KycDocumentType.SELFIE);
    if (!has(KycDocumentType.DRIVING_LICENSE)) missing.push(KycDocumentType.DRIVING_LICENSE);
    if (!has(KycDocumentType.INSURANCE)) missing.push(KycDocumentType.INSURANCE);
    if (!(await this.vehicles.hasApprovedVehicle(userId))) missing.push('approved_vehicle');
    const level2 = level1 && missing.length === 0;

    return { trustLevel: level2 ? 2 : level1 ? 1 : 0, verified: level1, validTypes: [...valid], missingForDriving: missing };
  }

  /** Recalcule et enregistre le niveau de confiance courant. */
  async refreshTrustLevel(userId: string): Promise<number> {
    const { trustLevel } = await this.evaluate(userId);
    await this.dataSource.getRepository(User).update({ id: userId }, { trustLevel });
    return trustLevel;
  }

  /**
   * Droit de publier (C-06, 3.1 règle 4) : pièces valides à la date du départ, charte acceptée,
   * véhicule validé, compte actif.
   */
  async assertCanDrive(userId: string, departureAt: Date): Promise<User> {
    const user = await this.users.assertActive(userId);
    this.users.assertProfileComplete(user);
    if (!user.driverCharterAcceptedAt) throw forbidden('DRIVER_CHARTER_REQUIRED', 'Acceptez la charte du conducteur avant de publier');
    const evaluation = await this.evaluate(userId, departureAt);
    if (evaluation.trustLevel < 2) {
      throw new DomainError('DRIVER_NOT_VERIFIED', 'Documents conducteur manquants ou expirés à la date du départ', 403, {
        missing: evaluation.missingForDriving,
      });
    }
    return user;
  }

  queue(status: KycStatus = KycStatus.SUBMITTED): Promise<KycDocument[]> {
    // File d'attente FIFO : le plus ancien dépôt d'abord (S-03).
    return this.documents.find({ where: { status }, order: { createdAt: 'ASC' }, take: 200 });
  }

  async approve(id: string, dto: ApproveDocumentDto, reviewerId: string, ip?: string): Promise<KycDocument> {
    const doc = await this.getReviewable(id);
    if (EXPIRING_TYPES.includes(doc.type) && !dto.expiresAt) {
      throw new DomainError('EXPIRY_REQUIRED', "La date d'expiration de ce document est obligatoire");
    }
    if (dto.expiresAt && new Date(dto.expiresAt) < new Date()) {
      throw new DomainError('DOCUMENT_EXPIRED', 'Ce document est déjà expiré');
    }
    if (doc.type === KycDocumentType.NATIONAL_ID && !dto.gender) {
      throw new DomainError('GENDER_REQUIRED', "Le genre figurant sur la pièce d'identité est obligatoire");
    }
    const saved = await this.dataSource.transaction(async (m) => {
      // La nouvelle pièce validée remplace la précédente du même type.
      await m.update(
        KycDocument,
        { userId: doc.userId, type: doc.type, status: KycStatus.APPROVED, ...(doc.vehicleId ? { vehicleId: doc.vehicleId } : {}) },
        { status: KycStatus.SUPERSEDED },
      );
      Object.assign(doc, { status: KycStatus.APPROVED, expiresAt: dto.expiresAt ?? null, reviewerId, reviewedAt: new Date(), rejectionReason: null });
      const result = await m.save(doc);
      if (doc.type === KycDocumentType.NATIONAL_ID) {
        // Un profil masculin ne peut pas conserver le mode « Entre femmes » (11.1).
        await m.update(User, { id: doc.userId }, { gender: dto.gender!, ...(dto.gender === Gender.MALE ? { womenOnlyMode: false } : {}) });
      }
      await this.audit.record(
        { actorId: reviewerId, action: 'kyc.approve', objectType: 'kyc_document', objectId: doc.id, after: { type: doc.type, expiresAt: dto.expiresAt, gender: dto.gender }, ip },
        m,
      );
      return result;
    });
    if (doc.type === KycDocumentType.VEHICLE_REGISTRATION && doc.vehicleId) {
      await this.vehicles.setStatus(doc.vehicleId, VehicleStatus.APPROVED);
    }
    const trustLevel = await this.refreshTrustLevel(doc.userId);
    await this.notifications.notify(doc.userId, 'kyc.approved', { documentId: doc.id, type: doc.type, trustLevel });
    return saved;
  }

  async reject(id: string, dto: RejectDocumentDto, reviewerId: string, ip?: string): Promise<KycDocument> {
    const doc = await this.getReviewable(id);
    Object.assign(doc, {
      status: dto.allowCorrection === false ? KycStatus.REJECTED : KycStatus.NEEDS_CORRECTION,
      rejectionReason: dto.reason,
      reviewerId,
      reviewedAt: new Date(),
    });
    const saved = await this.dataSource.transaction(async (m) => {
      const result = await m.save(doc);
      await this.audit.record(
        { actorId: reviewerId, action: 'kyc.reject', objectType: 'kyc_document', objectId: doc.id, after: { status: doc.status, reason: dto.reason }, ip },
        m,
      );
      return result;
    });
    await this.notifications.notify(doc.userId, 'kyc.rejected', { documentId: doc.id, type: doc.type, status: doc.status, reason: dto.reason });
    return saved;
  }

  /**
   * Tâche quotidienne (C-06) : alertes à J-30 et J-7, puis recalcul du niveau à l'échéance.
   * Les trajets déjà réservés restent gérés par le module trajets (3.1 règle 4).
   */
  async processExpirations(today = new Date()): Promise<void> {
    const day = (offset: number) => new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
    for (const offset of [30, 7]) {
      const expiring = await this.documents.find({ where: { status: KycStatus.APPROVED, expiresAt: day(offset) } });
      for (const doc of expiring) {
        await this.notifications.notify(doc.userId, 'kyc.expiring', { documentId: doc.id, type: doc.type, expiresAt: doc.expiresAt, daysLeft: offset });
      }
    }
    const expired = await this.documents.find({ where: { status: KycStatus.APPROVED, expiresAt: day(-1) } });
    for (const userId of new Set(expired.map((d) => d.userId))) {
      await this.refreshTrustLevel(userId);
      await this.notifications.notify(userId, 'kyc.expired', {});
    }
  }

  private async getReviewable(id: string): Promise<KycDocument> {
    const doc = await this.documents.findOneBy({ id });
    if (!doc) throw notFound('KycDocument');
    if (doc.status !== KycStatus.SUBMITTED) throw new DomainError('KYC_NOT_REVIEWABLE', 'Ce document a déjà été traité', 409);
    const owner = await this.users.get(doc.userId);
    if (owner.status === UserStatus.DELETED) throw new DomainError('KYC_NOT_REVIEWABLE', 'Compte supprimé', 409);
    return doc;
  }
}
