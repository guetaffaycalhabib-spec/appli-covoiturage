import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { DomainError, forbidden, notFound } from '../../common/errors';
import { CreateVehicleDto, UpdateVehicleDto } from './vehicles.dto';
import { Vehicle, VehicleStatus } from './vehicle.entity';

@Injectable()
export class VehiclesService {
  constructor(@InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>) {}

  create(ownerId: string, dto: CreateVehicleDto): Promise<Vehicle> {
    return this.vehicles.save(this.vehicles.create({ ...dto, ownerId, status: VehicleStatus.PENDING }));
  }

  listMine(ownerId: string): Promise<Vehicle[]> {
    return this.vehicles.find({ where: { ownerId, status: Not(VehicleStatus.INACTIVE) }, order: { createdAt: 'ASC' } });
  }

  async get(id: string): Promise<Vehicle> {
    const vehicle = await this.vehicles.findOneBy({ id });
    if (!vehicle) throw notFound('Vehicle');
    return vehicle;
  }

  async getOwned(ownerId: string, id: string): Promise<Vehicle> {
    const vehicle = await this.get(id);
    if (vehicle.ownerId !== ownerId) throw notFound('Vehicle');
    return vehicle;
  }

  /** Véhicule utilisable pour publier : appartient au conducteur et carte grise validée. */
  async getPublishable(ownerId: string, id: string): Promise<Vehicle> {
    const vehicle = await this.getOwned(ownerId, id);
    if (vehicle.status !== VehicleStatus.APPROVED) {
      throw forbidden('VEHICLE_NOT_APPROVED', "Ce véhicule n'est pas encore validé");
    }
    return vehicle;
  }

  async update(ownerId: string, id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const vehicle = await this.getOwned(ownerId, id);
    if (vehicle.status === VehicleStatus.INACTIVE) throw new DomainError('VEHICLE_INACTIVE', 'Véhicule désactivé');
    // Changer de plaque ou de capacité impose une nouvelle validation de la carte grise.
    const needsReview = (dto.plate && dto.plate !== vehicle.plate) || (dto.seats && dto.seats !== vehicle.seats);
    Object.assign(vehicle, dto);
    if (needsReview) vehicle.status = VehicleStatus.PENDING;
    return this.vehicles.save(vehicle);
  }

  async deactivate(ownerId: string, id: string): Promise<void> {
    const vehicle = await this.getOwned(ownerId, id);
    vehicle.status = VehicleStatus.INACTIVE;
    await this.vehicles.save(vehicle);
  }

  async setStatus(id: string, status: VehicleStatus): Promise<void> {
    await this.vehicles.update({ id, status: Not(VehicleStatus.INACTIVE) }, { status });
  }

  hasApprovedVehicle(ownerId: string): Promise<boolean> {
    return this.vehicles.exists({ where: { ownerId, status: VehicleStatus.APPROVED } });
  }
}
