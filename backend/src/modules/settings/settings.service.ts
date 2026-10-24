import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { DomainError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_SETTINGS, SettingKey, SettingValue } from './settings.defaults';
import { PlatformSetting, PricingParameter } from './settings.entities';

/** Paramètre de prix utilisé quand l'administration n'en a encore saisi aucun. */
export const FALLBACK_PRICING = { costPerKm: 9, tollAmount: 0, roundingStep: 10 };

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(PlatformSetting) private readonly settings: Repository<PlatformSetting>,
    @InjectRepository(PricingParameter) private readonly pricing: Repository<PricingParameter>,
    private readonly audit: AuditService,
  ) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const row = await this.settings.findOne({
      where: { key, effectiveFrom: LessThanOrEqual(new Date()) },
      order: { version: 'DESC' },
    });
    return (row ? row.value : DEFAULT_SETTINGS[key]) as SettingValue<K>;
  }

  async getAll(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) out[key] = await this.get(key);
    return out;
  }

  async set(key: string, value: unknown, actorId: string, ip?: string): Promise<PlatformSetting> {
    if (!(key in DEFAULT_SETTINGS)) throw new DomainError('UNKNOWN_SETTING', `Paramètre inconnu : ${key}`);
    const expected = typeof DEFAULT_SETTINGS[key as SettingKey];
    if (typeof value !== expected) {
      throw new DomainError('INVALID_SETTING_VALUE', `Le paramètre ${key} attend une valeur de type ${expected}`);
    }
    const before = await this.get(key as SettingKey);
    const last = await this.settings.findOne({ where: { key }, order: { version: 'DESC' } });
    const saved = await this.settings.save(
      this.settings.create({ key, value, version: (last?.version ?? 0) + 1, effectiveFrom: new Date(), createdBy: actorId }),
    );
    await this.audit.record({ actorId, action: 'setting.update', objectType: 'setting', objectId: key, before, after: value, ip });
    return saved;
  }

  /** Paramètre de prix en vigueur pour un axe (dans un sens ou dans l'autre), à défaut le paramètre national. */
  async pricingFor(fromWilaya: number, toWilaya: number, at = new Date()): Promise<PricingParameter | typeof FALLBACK_PRICING & { id: null }> {
    const axis = await this.pricing.findOne({
      where: [
        { fromWilaya, toWilaya, effectiveFrom: LessThanOrEqual(at) },
        { fromWilaya: toWilaya, toWilaya: fromWilaya, effectiveFrom: LessThanOrEqual(at) },
      ],
      order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
    });
    if (axis) return axis;
    const national = await this.pricing.findOne({
      where: { fromWilaya: IsNull(), toWilaya: IsNull(), effectiveFrom: LessThanOrEqual(at) },
      order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
    });
    return national ?? { ...FALLBACK_PRICING, id: null };
  }

  listPricing(): Promise<PricingParameter[]> {
    return this.pricing.find({ order: { effectiveFrom: 'DESC', createdAt: 'DESC' } });
  }

  async createPricing(
    input: Pick<PricingParameter, 'fromWilaya' | 'toWilaya' | 'costPerKm' | 'tollAmount' | 'roundingStep'> & { effectiveFrom?: Date },
    actorId: string,
    ip?: string,
  ): Promise<PricingParameter> {
    if ((input.fromWilaya == null) !== (input.toWilaya == null)) {
      throw new DomainError('INVALID_AXIS', 'Un axe se définit par deux wilayas, ou aucune pour le paramètre national');
    }
    const saved = await this.pricing.save(
      this.pricing.create({ ...input, effectiveFrom: input.effectiveFrom ?? new Date(), createdBy: actorId }),
    );
    await this.audit.record({ actorId, action: 'pricing.create', objectType: 'pricing_parameter', objectId: saved.id, after: saved, ip });
    return saved;
  }
}
