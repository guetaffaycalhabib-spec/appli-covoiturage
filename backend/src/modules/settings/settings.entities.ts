import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/db/base.entity';

/** Paramètre de plateforme versionné : chaque modification crée une nouvelle ligne. */
@Entity('platform_settings')
@Index(['key', 'version'], { unique: true })
export class PlatformSetting extends BaseEntity {
  @Column()
  key: string;

  @Column({ type: 'jsonb' })
  value: unknown;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'timestamptz' })
  effectiveFrom: Date;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;
}

/**
 * Paramètres de prix versionnés (cahier des charges 6.3) : coût kilométrique, péages, pas d'arrondi.
 * Un paramètre sans wilayas s'applique à tout le territoire ; un paramètre d'axe s'applique dans les deux sens.
 */
@Entity('pricing_parameters')
@Index(['fromWilaya', 'toWilaya', 'effectiveFrom'])
export class PricingParameter extends BaseEntity {
  @Column({ type: 'int', nullable: true })
  fromWilaya: number | null;

  @Column({ type: 'int', nullable: true })
  toWilaya: number | null;

  @Column({ type: 'double precision' })
  costPerKm: number;

  @Column({ type: 'int', default: 0 })
  tollAmount: number;

  @Column({ type: 'int', default: 10 })
  roundingStep: number;

  @Column({ type: 'timestamptz' })
  effectiveFrom: Date;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;
}
