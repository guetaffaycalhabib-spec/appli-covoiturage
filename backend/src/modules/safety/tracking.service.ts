import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { DomainError, forbidden, notFound } from '../../common/errors';
import { haversineKm } from '../../common/utils/geo';
import { SettingsService } from '../settings/settings.service';
import { Booking, BookingStatus, Trip, TripStatus } from '../trips/trip.entities';
import { TripsService } from '../trips/trips.service';
import { UsersService } from '../users/users.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { PositionUpdateDto } from './safety.dto';
import { TrackingShare, TripPosition } from './safety.entities';

const AVERAGE_SPEED_KMH = 70;

/**
 * Suivi du conducteur (P-22, P-30) : envoi de positions par le conducteur, lecture par les passagers
 * inscrits ou par un proche via un lien de partage. Le canal WebSocket viendra s'appuyer sur ce service ;
 * en attendant, les clients interrogent périodiquement (repli prévu par 14.4).
 */
@Injectable()
export class TrackingService {
  constructor(
    @InjectRepository(TripPosition) private readonly positions: Repository<TripPosition>,
    @InjectRepository(TrackingShare) private readonly shares: Repository<TrackingShare>,
    private readonly dataSource: DataSource,
    private readonly trips: TripsService,
    private readonly users: UsersService,
    private readonly vehicles: VehiclesService,
    private readonly settings: SettingsService,
  ) {}

  async record(driverId: string, tripId: string, dto: PositionUpdateDto): Promise<void> {
    const trip = await this.trips.get(tripId);
    if (trip.driverId !== driverId) throw notFound('Trip');
    const window = await this.settings.get('tracking.preDepartureWindowMinutes');
    const beforeDeparture = [TripStatus.PUBLISHED, TripStatus.FULL].includes(trip.status) && Date.now() >= trip.departureAt.getTime() - window * 60_000;
    if (trip.status !== TripStatus.IN_PROGRESS && !beforeDeparture) {
      throw new DomainError('TRACKING_NOT_ACTIVE', "Le suivi n'est pas actif pour ce trajet", HttpStatus.CONFLICT);
    }
    await this.positions.insert({ tripId, ...dto });
  }

  /** Dernière position, avec estimation d'arrivée au point de rendez-vous du passager (ou à destination). */
  async latestFor(userId: string, tripId: string) {
    const role = await this.trips.participantRole(tripId, userId);
    if (!role) throw notFound('Trip');
    const trip = await this.trips.get(tripId);
    const booking =
      role === 'passenger'
        ? await this.dataSource.getRepository(Booking).findOne({ where: { tripId, passengerId: userId }, order: { createdAt: 'DESC' } })
        : null;
    const target = booking && booking.status === BookingStatus.CONFIRMED ? booking.pickup : trip.destination;
    return this.snapshot(trip, target);
  }

  async createShare(userId: string, tripId: string) {
    const role = await this.trips.participantRole(tripId, userId);
    if (!role) throw notFound('Trip');
    const trip = await this.trips.get(tripId);
    if ([TripStatus.COMPLETED, TripStatus.CANCELLED, TripStatus.EXPIRED].includes(trip.status)) {
      throw new DomainError('TRIP_OVER', 'Ce trajet est terminé', HttpStatus.CONFLICT);
    }
    return this.issueShare(userId, trip);
  }

  async issueShare(userId: string, trip: Trip): Promise<TrackingShare> {
    const grace = await this.settings.get('tracking.shareLinkGraceHours');
    const expiresAt = new Date(trip.departureAt.getTime() + (trip.durationMinutes * 60 + grace * 3600) * 1000);
    return this.shares.save(this.shares.create({ tripId: trip.id, createdBy: userId, token: randomBytes(24).toString('base64url'), expiresAt }));
  }

  async revokeShare(userId: string, shareId: string): Promise<void> {
    const share = await this.shares.findOneBy({ id: shareId });
    if (!share || share.createdBy !== userId) throw notFound('Share');
    await this.shares.update({ id: shareId }, { revokedAt: new Date() });
  }

  /** Vue publique d'un lien de suivi : juste ce qu'il faut à un proche pour s'assurer que tout va bien. */
  async publicView(token: string) {
    const share = await this.shares.findOneBy({ token });
    if (!share || share.revokedAt || share.expiresAt < new Date()) throw notFound('Share');
    const trip = await this.trips.get(share.tripId);
    if (trip.status === TripStatus.CANCELLED || trip.status === TripStatus.EXPIRED) throw notFound('Share');
    const [driver, vehicle] = await Promise.all([this.users.get(trip.driverId), this.vehicles.get(trip.vehicleId)]);
    return {
      ...(await this.snapshot(trip, trip.destination)),
      origin: trip.origin.label,
      destination: trip.destination.label,
      departureAt: trip.departureAt,
      driver: { firstName: driver.firstName, photoRef: driver.photoRef },
      vehicle: { make: vehicle.make, model: vehicle.model, color: vehicle.color, plate: vehicle.plate },
      expiresAt: share.expiresAt,
    };
  }

  private async snapshot(trip: Trip, target: { lat: number; lng: number }) {
    const position = await this.positions.findOne({ where: { tripId: trip.id }, order: { recordedAt: 'DESC', id: 'DESC' } });
    const etaMinutes = position ? Math.round((haversineKm(position, target) / AVERAGE_SPEED_KMH) * 60) : null;
    return {
      tripId: trip.id,
      status: trip.status,
      position: position && { lat: position.lat, lng: position.lng, heading: position.heading, recordedAt: position.recordedAt },
      etaMinutes,
    };
  }

  /** Utilisé par le SOS : l'utilisateur doit être participant du trajet. */
  async assertParticipant(userId: string, tripId: string) {
    const role = await this.trips.participantRole(tripId, userId);
    if (!role) throw forbidden('NOT_A_PARTICIPANT', "Vous ne participez pas à ce trajet");
    return role;
  }
}
