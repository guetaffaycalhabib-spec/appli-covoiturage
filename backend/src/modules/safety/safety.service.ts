import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ArrayContains, DataSource, In, Repository } from 'typeorm';
import { StaffRole } from '../../common/auth/auth.types';
import { DomainError, notFound } from '../../common/errors';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../notifications/sms.provider';
import { SettingsService } from '../settings/settings.service';
import { TripStatus } from '../trips/trip.entities';
import { TripsService } from '../trips/trips.service';
import { User } from '../users/user.entities';
import { UsersService } from '../users/users.service';
import { ReportDto, SosDto, UpdateIncidentDto } from './safety.dto';
import { IncidentCategory, IncidentSeverity, IncidentStatus, IncidentType, SafetyIncident } from './safety.entities';
import { TrackingService } from './tracking.service';

const HIGH_SEVERITY = [IncidentCategory.HARASSMENT, IncidentCategory.DANGEROUS_DRIVING, IncidentCategory.DISCRIMINATION];

@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);

  constructor(
    @InjectRepository(SafetyIncident) private readonly incidents: Repository<SafetyIncident>,
    private readonly dataSource: DataSource,
    private readonly trips: TripsService,
    private readonly tracking: TrackingService,
    private readonly users: UsersService,
    private readonly sms: SmsService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * SOS (P-32, S-10) : crée un incident critique, prévient l'équipe sécurité et envoie aux contacts
   * d'urgence un SMS avec un lien de suivi en direct. Un échec d'envoi à un contact ne bloque pas les autres.
   */
  async sos(userId: string, tripId: string, dto: SosDto) {
    await this.tracking.assertParticipant(userId, tripId);
    const trip = await this.trips.get(tripId);
    if ([TripStatus.CANCELLED, TripStatus.EXPIRED].includes(trip.status)) {
      throw new DomainError('TRIP_OVER', "Ce trajet n'est plus actif", HttpStatus.CONFLICT);
    }
    const incident = await this.incidents.save(
      this.incidents.create({
        type: IncidentType.SOS,
        category: IncidentCategory.OTHER,
        severity: IncidentSeverity.CRITICAL,
        reporterId: userId,
        targetUserId: null,
        tripId,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
      }),
    );
    const share = await this.tracking.issueShare(userId, trip);
    await this.alertStaff(incident);

    const notifiedContacts: string[] = [];
    if (await this.settings.get('safety.emergencyNotifySms')) {
      const reporter = await this.users.get(userId);
      const contacts = await this.users.listContacts(userId);
      const where = dto.lat !== undefined && dto.lng !== undefined ? ` Position : ${dto.lat.toFixed(5)},${dto.lng.toFixed(5)}.` : '';
      const text = `ALERTE SOS de ${reporter.firstName ?? 'votre proche'} pendant un trajet ${trip.origin.label} → ${trip.destination.label}.${where} Suivi : ${this.config.publicTrackingUrl}/${share.token}`;
      const results = await Promise.allSettled(contacts.map((c) => this.sms.send(c.phone, text)));
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') notifiedContacts.push(contacts[i].id);
        else this.logger.error(`SOS ${incident.id} : échec SMS au contact ${contacts[i].id}`);
      });
    }
    return { incidentId: incident.id, shareToken: share.token, notifiedContacts: notifiedContacts.length };
  }

  /** Signalement (8.3) depuis un trajet, un profil, un message ou un avis. Priorité renforcée en mode « Entre femmes ». */
  async report(userId: string, dto: ReportDto) {
    let severity = HIGH_SEVERITY.includes(dto.category) ? IncidentSeverity.HIGH : IncidentSeverity.NORMAL;
    if (dto.tripId) {
      await this.tracking.assertParticipant(userId, dto.tripId);
      const trip = await this.trips.get(dto.tripId);
      if (trip.womenOnly) severity = IncidentSeverity.HIGH;
    }
    if (dto.targetUserId) await this.users.get(dto.targetUserId);
    const incident = await this.incidents.save(
      this.incidents.create({
        type: IncidentType.REPORT,
        category: dto.category,
        severity,
        reporterId: userId,
        targetUserId: dto.targetUserId ?? null,
        tripId: dto.tripId ?? null,
        bookingId: dto.bookingId ?? null,
        description: dto.description,
      }),
    );
    if (severity !== IncidentSeverity.NORMAL) await this.alertStaff(incident);
    return incident;
  }

  list(status?: IncidentStatus) {
    return this.incidents
      .createQueryBuilder('i')
      .where(status ? 'i.status = :status' : 'i.status <> :closed', { status, closed: IncidentStatus.CLOSED })
      .orderBy(`CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END`)
      .addOrderBy('i.createdAt', 'ASC')
      .take(200)
      .getMany();
  }

  async update(id: string, dto: UpdateIncidentDto, actorId: string, ip?: string) {
    const incident = await this.incidents.findOneBy({ id });
    if (!incident) throw notFound('Incident');
    const before = { status: incident.status, assignedTo: incident.assignedTo };
    Object.assign(incident, { status: dto.status, resolution: dto.resolution ?? incident.resolution, assignedTo: incident.assignedTo ?? actorId });
    await this.incidents.save(incident);
    await this.audit.record({ actorId, action: 'incident.update', objectType: 'incident', objectId: id, before, after: dto, ip });
    return incident;
  }

  private async alertStaff(incident: SafetyIncident) {
    const staff = await this.dataSource.getRepository(User).find({
      where: [{ staffRoles: ArrayContains([StaffRole.SUPPORT]) }, { staffRoles: ArrayContains([StaffRole.ADMIN]) }],
      select: { id: true },
    });
    await this.notifications.notifyMany(
      staff.map((s) => s.id),
      incident.type === IncidentType.SOS ? 'safety.sos' : 'safety.report',
      { incidentId: incident.id, tripId: incident.tripId, severity: incident.severity, lat: incident.lat, lng: incident.lng },
    );
  }
}
