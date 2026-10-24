export interface PriceCapInput {
  distanceKm: number;
  costPerKm: number;
  tollAmount: number;
  seats: number;
  roundingStep: number;
}

/**
 * Plafond de partage de frais par place (cahier des charges 6.3) :
 *   P_max = (d × c_km + t_péage) / (n_places + 1)
 * Arrondi à l'inférieur au pas configuré, pour que l'arrondi ne fasse jamais dépasser le partage de frais.
 */
export function computePriceCap({ distanceKm, costPerKm, tollAmount, seats, roundingStep }: PriceCapInput): number {
  if (seats < 1) throw new Error('Le nombre de places doit être supérieur ou égal à 1');
  const raw = (distanceKm * costPerKm + tollAmount) / (seats + 1);
  return roundDown(raw, roundingStep);
}

export function roundDown(amount: number, step: number): number {
  if (step <= 0) return Math.floor(amount);
  return Math.floor(amount / step) * step;
}

export function roundNearest(amount: number, step: number): number {
  if (step <= 0) return Math.round(amount);
  return Math.round(amount / step) * step;
}

/**
 * Prix d'un segment au prorata de la distance (cahier des charges 6.3), arrondi au pas
 * et jamais au-dessus du prix du trajet complet, ni en dessous d'un pas.
 */
export function segmentPrice(fullPrice: number, segmentKm: number, totalKm: number, step: number): number {
  if (totalKm <= 0 || segmentKm >= totalKm) return fullPrice;
  const prorated = roundNearest((fullPrice * segmentKm) / totalKm, step);
  return Math.min(fullPrice, Math.max(step > 0 ? step : 1, prorated));
}

export function percentOf(amount: number, percent: number): number {
  return Math.round((amount * percent) / 100);
}
