import { computePriceCap, segmentPrice } from './pricing';

describe('computePriceCap', () => {
  it('applique la formule de partage de frais avec la part du conducteur', () => {
    // Alger–Oran ≈ 420 km, 9 DA/km, 600 DA de péage, 3 places : (3780 + 600) / 4 = 1095
    expect(computePriceCap({ distanceKm: 420, costPerKm: 9, tollAmount: 600, seats: 3, roundingStep: 1 })).toBe(1095);
  });

  it("arrondit à l'inférieur au pas configuré pour ne jamais dépasser le partage de frais", () => {
    expect(computePriceCap({ distanceKm: 420, costPerKm: 9, tollAmount: 600, seats: 3, roundingStep: 10 })).toBe(1090);
    expect(computePriceCap({ distanceKm: 420, costPerKm: 9, tollAmount: 600, seats: 3, roundingStep: 50 })).toBe(1050);
  });

  it('diminue quand le nombre de places augmente', () => {
    const base = { distanceKm: 300, costPerKm: 10, tollAmount: 0, roundingStep: 5 };
    expect(computePriceCap({ ...base, seats: 1 })).toBeGreaterThan(computePriceCap({ ...base, seats: 4 }));
  });

  it('refuse un nombre de places nul', () => {
    expect(() => computePriceCap({ distanceKm: 10, costPerKm: 1, tollAmount: 0, seats: 0, roundingStep: 1 })).toThrow();
  });
});

describe('segmentPrice', () => {
  it('calcule le prix au prorata de la distance, arrondi au pas', () => {
    expect(segmentPrice(1000, 210, 420, 10)).toBe(500);
    expect(segmentPrice(1000, 133, 420, 10)).toBe(320);
  });

  it('ne dépasse jamais le prix du trajet complet', () => {
    expect(segmentPrice(1000, 430, 420, 10)).toBe(1000);
    expect(segmentPrice(995, 419, 420, 10)).toBeLessThanOrEqual(995);
  });

  it("ne descend pas sous un pas d'arrondi", () => {
    expect(segmentPrice(1000, 1, 420, 10)).toBe(10);
  });
});
