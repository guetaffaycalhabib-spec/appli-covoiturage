export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Distance cumulée (km) le long de la polyligne, pour chaque sommet. */
export function cumulativeDistances(polyline: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < polyline.length; i++) out.push(out[i - 1] + haversineKm(polyline[i - 1], polyline[i]));
  return out;
}

export interface Projection {
  /** Distance la plus courte entre le point et la polyligne (km). */
  offsetKm: number;
  /** Position du point projeté, exprimée en km depuis le début de la polyligne. */
  alongKm: number;
}

/**
 * Projette un point sur la polyligne (approximation équirectangulaire locale, suffisante à l'échelle
 * d'un corridor de quelques kilomètres). Sert au matching par corridor (cahier des charges 6.1).
 */
export function projectOnPolyline(point: LatLng, polyline: LatLng[], cumulative = cumulativeDistances(polyline)): Projection {
  if (polyline.length === 1) return { offsetKm: haversineKm(point, polyline[0]), alongKm: 0 };
  let best: Projection = { offsetKm: Infinity, alongKm: 0 };
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const kx = Math.cos(toRad((a.lat + b.lat) / 2)) * 111.32;
    const ky = 110.57;
    const bx = (b.lng - a.lng) * kx;
    const by = (b.lat - a.lat) * ky;
    const px = (point.lng - a.lng) * kx;
    const py = (point.lat - a.lat) * ky;
    const len2 = bx * bx + by * by;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
    const offsetKm = Math.hypot(px - t * bx, py - t * by);
    if (offsetKm < best.offsetKm) {
      best = { offsetKm, alongKm: cumulative[i] + t * (cumulative[i + 1] - cumulative[i]) };
    }
  }
  return best;
}
