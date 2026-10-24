import { Injectable } from '@nestjs/common';
import { haversineKm, LatLng } from '../../common/utils/geo';
import { SettingsService } from '../settings/settings.service';

export interface Route {
  distanceKm: number;
  durationMinutes: number;
  polyline: LatLng[];
}

/** Abstraction du fournisseur de cartographie (13.1, à arbitrer) : itinéraire, distance et durée. */
export interface MapsProvider {
  route(points: LatLng[]): Promise<Route>;
}

export const MAPS_PROVIDER = Symbol('MAPS_PROVIDER');

const AVERAGE_SPEED_KMH = 80;

/**
 * Fournisseur de repli sans dépendance externe : distance à vol d'oiseau × coefficient routier
 * paramétrable, polyligne passant par les points donnés. Sert en développement et en mode dégradé (15.1)
 * en attendant le branchement du fournisseur retenu (commercial ou OpenStreetMap auto-hébergé).
 */
@Injectable()
export class StraightLineMapsProvider implements MapsProvider {
  constructor(private readonly settings: SettingsService) {}

  async route(points: LatLng[]): Promise<Route> {
    const factor = await this.settings.get('maps.roadFactor');
    let distance = 0;
    for (let i = 1; i < points.length; i++) distance += haversineKm(points[i - 1], points[i]);
    const distanceKm = Math.round(distance * factor * 10) / 10;
    return {
      distanceKm,
      durationMinutes: Math.round((distanceKm / AVERAGE_SPEED_KMH) * 60),
      polyline: points.map(({ lat, lng }) => ({ lat, lng })),
    };
  }
}
