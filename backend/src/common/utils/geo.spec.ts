import { haversineKm, projectOnPolyline } from './geo';

const ALGER = { lat: 36.7538, lng: 3.0588 };
const ORAN = { lat: 35.6971, lng: -0.6308 };

describe('geo', () => {
  it('calcule une distance Alger–Oran à vol d’oiseau plausible', () => {
    const d = haversineKm(ALGER, ORAN);
    expect(d).toBeGreaterThan(340);
    expect(d).toBeLessThan(370);
  });

  it('projette un point proche de la ligne avec un faible écart et une position cohérente', () => {
    const line = [ALGER, ORAN];
    const mid = { lat: (ALGER.lat + ORAN.lat) / 2, lng: (ALGER.lng + ORAN.lng) / 2 };
    const p = projectOnPolyline(mid, line);
    expect(p.offsetKm).toBeLessThan(1);
    expect(p.alongKm).toBeGreaterThan(170);
    expect(p.alongKm).toBeLessThan(185);
  });

  it('mesure un écart important pour un point éloigné', () => {
    const constantine = { lat: 36.365, lng: 6.6147 };
    expect(projectOnPolyline(constantine, [ALGER, ORAN]).offsetKm).toBeGreaterThan(250);
  });
});
