import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { DomainError, forbidden, notFound } from '../../common/errors';
import { normalizeAlgerianMobile } from '../../common/utils/phone';
import { AuditService } from '../audit/audit.service';
import { EmergencyContactDto, UpdateProfileDto } from './users.dto';
import { EmergencyContact, Gender, User, UserBlock, UserStatus } from './user.entities';

const ADULT_AGE = 18;

export function ageOn(birthDate: string, at = new Date()): number {
  const birth = new Date(birthDate);
  let age = at.getFullYear() - birth.getFullYear();
  const m = at.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < birth.getDate())) age--;
  return age;
}

/** Vue publique d'un profil : jamais de téléphone ni de nom complet (9.2, 12). */
export function publicProfile(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastInitial: user.lastName ? `${user.lastName[0]}.` : null,
    photoRef: user.photoRef,
    bio: user.bio,
    ratingAverage: Math.round(user.ratingAverage * 10) / 10,
    ratingCount: user.ratingCount,
    verified: user.trustLevel >= 1,
    trustLevel: user.trustLevel,
    memberSince: user.createdAt,
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(EmergencyContact) private readonly contacts: Repository<EmergencyContact>,
    @InjectRepository(UserBlock) private readonly blocks: Repository<UserBlock>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async get(id: string): Promise<User> {
    const user = await this.users.findOneBy({ id });
    if (!user) throw notFound('User');
    return user;
  }

  findByIds(ids: string[]): Promise<User[]> {
    return ids.length ? this.users.findBy({ id: In(ids) }) : Promise.resolve([]);
  }

  /** Un compte suspendu ou supprimé ne peut ni publier ni réserver (3.1 règle 2). */
  async assertActive(id: string): Promise<User> {
    const user = await this.get(id);
    if (user.status !== UserStatus.ACTIVE) throw forbidden('ACCOUNT_NOT_ACTIVE', 'Ce compte ne peut pas effectuer cette action');
    return user;
  }

  /** Profil complet minimal requis pour publier ou réserver. */
  assertProfileComplete(user: User): void {
    if (!user.firstName || !user.lastName || !user.birthDate) {
      throw new DomainError('PROFILE_INCOMPLETE', 'Complétez votre prénom, nom et date de naissance');
    }
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.get(id);
    if (dto.birthDate && ageOn(dto.birthDate) < ADULT_AGE) {
      throw new DomainError('UNDERAGE', 'Il faut être majeur pour utiliser le service');
    }
    // Le genre est fixé par la pièce d'identité une fois celle-ci validée (étanchéité du mode « Entre femmes »).
    if (dto.gender && user.gender && dto.gender !== user.gender && user.trustLevel >= 1) {
      throw forbidden('GENDER_LOCKED', "Le genre ne peut plus être modifié après validation de la pièce d'identité");
    }
    const gender = dto.gender ?? user.gender;
    if (dto.womenOnlyMode && !(gender === Gender.FEMALE && user.trustLevel >= 1)) {
      throw forbidden('WOMEN_ONLY_NOT_ELIGIBLE', "Le mode « Entre femmes » est réservé aux profils féminins vérifiés");
    }
    Object.assign(user, dto);
    return this.users.save(user);
  }

  listContacts(userId: string): Promise<EmergencyContact[]> {
    return this.contacts.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  async replaceContacts(userId: string, input: EmergencyContactDto[]): Promise<EmergencyContact[]> {
    const normalized = input.map((c) => {
      const phone = normalizeAlgerianMobile(c.phone) ?? (/^\+\d{8,15}$/.test(c.phone) ? c.phone : null);
      if (!phone) throw new DomainError('INVALID_PHONE', `Numéro invalide : ${c.phone}`);
      return { userId, name: c.name, phone };
    });
    await this.dataSource.transaction(async (m) => {
      await m.delete(EmergencyContact, { userId });
      if (normalized.length) await m.insert(EmergencyContact, normalized);
    });
    return this.listContacts(userId);
  }

  async acceptDriverCharter(userId: string): Promise<User> {
    const user = await this.get(userId);
    user.driverCharterAcceptedAt ??= new Date();
    return this.users.save(user);
  }

  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) throw new DomainError('INVALID_BLOCK', 'Impossible de se bloquer soi-même');
    await this.get(blockedId);
    await this.blocks.upsert({ blockerId, blockedId }, ['blockerId', 'blockedId']);
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.blocks.delete({ blockerId, blockedId });
  }

  /** Vrai si l'un des deux a bloqué l'autre. */
  async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    return this.blocks.exists({ where: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] });
  }

  /** Identifiants des personnes avec qui `userId` ne doit jamais être apparié. */
  async blockedPeers(userId: string): Promise<Set<string>> {
    const rows = await this.blocks.find({ where: [{ blockerId: userId }, { blockedId: userId }] });
    return new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)));
  }

  async adjustReliability(userId: string, delta: number): Promise<void> {
    await this.users
      .createQueryBuilder()
      .update()
      .set({ reliabilityScore: () => `GREATEST(0, LEAST(100, "reliabilityScore" + ${Math.trunc(delta)}))` })
      .where('id = :userId', { userId })
      .execute();
  }

  async setStatus(userId: string, status: UserStatus, actorId: string, reason: string, ip?: string): Promise<User> {
    const user = await this.get(userId);
    const before = user.status;
    user.status = status;
    const saved = await this.users.save(user);
    await this.audit.record({ actorId, action: `user.${status}`, objectType: 'user', objectId: userId, before: { status: before }, after: { status, reason }, ip });
    return saved;
  }

  /**
   * Suppression de compte (P-05) : anonymisation des données personnelles. L'historique comptable
   * et les trajets restent, rattachés à un compte anonyme, pour les obligations légales de conservation.
   */
  async deleteAccount(userId: string): Promise<void> {
    const [{ active }] = await this.dataSource.query(
      `SELECT (EXISTS (SELECT 1 FROM trips WHERE "driverId" = $1 AND status IN ('published', 'full', 'in_progress'))
            OR EXISTS (SELECT 1 FROM bookings WHERE "passengerId" = $1 AND status IN ('pending', 'confirmed', 'in_progress'))) AS active`,
      [userId],
    );
    if (active) {
      throw new DomainError('ACTIVE_COMMITMENTS', 'Annulez ou terminez vos trajets et réservations en cours avant de supprimer le compte', HttpStatus.CONFLICT);
    }
    await this.dataSource.transaction(async (m) => {
      await m.update(User, { id: userId }, {
        phone: `deleted:${userId}`,
        email: null,
        firstName: null,
        lastName: null,
        birthDate: null,
        bio: null,
        photoRef: null,
        womenOnlyMode: false,
        status: UserStatus.DELETED,
      });
      await m.delete(EmergencyContact, { userId });
    });
    await this.audit.record({ actorId: userId, action: 'user.delete', objectType: 'user', objectId: userId });
  }
}
