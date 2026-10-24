import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/db/base.entity';

export enum VehicleStatus {
  /** En attente de validation de la carte grise. */
  PENDING = 'pending',
  APPROVED = 'approved',
  INACTIVE = 'inactive',
}

@Entity('vehicles')
export class Vehicle extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  ownerId: string;

  @Column()
  make: string;

  @Column()
  model: string;

  @Column({ type: 'int' })
  year: number;

  @Column()
  color: string;

  @Column()
  plate: string;

  /** Capacité déclarée, place du conducteur comprise (C-12). */
  @Column({ type: 'int' })
  seats: number;

  @Column({ type: 'varchar', default: 'standard' })
  comfort: string;

  @Column({ type: 'text', array: true, default: '{}' })
  equipment: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  photoRefs: string[];

  @Column({ type: 'enum', enum: VehicleStatus, default: VehicleStatus.PENDING })
  status: VehicleStatus;
}

/** Plaque partiellement masquée avant la prise en charge (P-13). */
export function maskPlate(plate: string): string {
  const compact = plate.replace(/\s/g, '');
  return compact.length <= 4 ? '••••' : `${'•'.repeat(compact.length - 4)}${compact.slice(-4)}`;
}

export function publicVehicle(v: Vehicle, revealPlate = false) {
  return {
    id: v.id,
    make: v.make,
    model: v.model,
    year: v.year,
    color: v.color,
    comfort: v.comfort,
    equipment: v.equipment,
    photoRefs: v.photoRefs,
    plate: revealPlate ? v.plate : maskPlate(v.plate),
  };
}
