/**
 * Normalise un numéro mobile algérien au format E.164 (+213XXXXXXXXX).
 * Mobiles : 5 (Ooredoo), 6 (Mobilis), 7 (Djezzy), suivis de 8 chiffres.
 * Retourne null si le numéro n'est pas un mobile algérien valide.
 */
export function normalizeAlgerianMobile(raw: string): string | null {
  const digits = raw.replace(/[\s.\-()]/g, '');
  const match = /^(?:\+213|00213|0)?([567]\d{8})$/.exec(digits);
  return match ? `+213${match[1]}` : null;
}
