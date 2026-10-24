import { cumulativeDistances, LatLng, projectOnPolyline } from '../../common/utils/geo';
import { segmentPrice } from '../../common/utils/pricing';
import { Trip } from './trip.entities';

export interface CorridorMatch {
  pickupOffsetKm: number;
  dropoffOffsetKm: number;
  /** Distance du segment passager, ramenée à la distance routière du trajet. */
  segmentKm: number;
  pricePerSeat: number;
}

export interface CorridorOptions {
  radiusKm: number;
  maxDetourKm: number;
}

/**
 * Matching par corridor (6.1) : le point de montée et le point de descente doivent être à moins de
 * `radiusKm` de l'itinéraire, dans le bon sens, avec un détour aller-retour total sous `maxDetourKm`.
 */
export function matchCorridor(trip: Trip, pickup: LatLng, dropoff: LatLng, opts: CorridorOptions): CorridorMatch | null {
  const cumulative = cumulativeDistances(trip.polyline);
  const polylineKm = cumulative[cumulative.length - 1];
  const up = projectOnPolyline(pickup, trip.polyline, cumulative);
  const down = projectOnPolyline(dropoff, trip.polyline, cumulative);
  if (up.offsetKm > opts.radiusKm || down.offsetKm > opts.radiusKm) return null;
  if (down.alongKm <= up.alongKm) return null;
  if (2 * (up.offsetKm + down.offsetKm) > opts.maxDetourKm) return null;

  const ratio = polylineKm > 0 ? (down.alongKm - up.alongKm) / polylineKm : 1;
  const segmentKm = Math.round(Math.min(1, ratio) * trip.distanceKm * 10) / 10;
  return {
    pickupOffsetKm: Math.round(up.offsetKm * 10) / 10,
    dropoffOffsetKm: Math.round(down.offsetKm * 10) / 10,
    segmentKm,
    pricePerSeat: segmentPrice(trip.pricePerSeat, segmentKm, trip.distanceKm, trip.priceRoundingStep),
  };
}
