/**
 * Masquage des coordonnées personnelles dans les messages et avis (cahier des charges M-03, 8.3).
 * Détecte numéros de téléphone (formats algériens et internationaux, chiffres séparés ou en chiffres arabes),
 * adresses e-mail et liens externes.
 */
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
const EMAIL = /[A-Z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[A-Z0-9.-]+\s*(\.|\(dot\))\s*[A-Z]{2,}/gi;
const URL = /\b((https?:\/\/|www\.)\S+|\S+\.(com|net|org|dz|fr|me|io|ly|gl)(\/\S*)?)\b/gi;
// Séquence d'au moins 8 chiffres, éventuellement séparés par espaces, points, tirets ou parenthèses.
const PHONE = /(\+|00)?\d(?:[\s.\-()]*\d){7,}/g;

export const MASK = '•••';

function normalizeDigits(text: string): string {
  return text.replace(ARABIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

export interface MaskResult {
  text: string;
  masked: boolean;
}

export function maskContactDetails(input: string): MaskResult {
  const normalized = normalizeDigits(input);
  const text = normalized.replace(EMAIL, MASK).replace(URL, MASK).replace(PHONE, MASK);
  return { text, masked: text !== normalized };
}

// Liste volontairement courte : la liste réelle est un paramètre administrable et relue par des locuteurs natifs.
const DEFAULT_BLOCKLIST = ['connard', 'salope', 'pute', 'enculé', 'merde'];

export function filterInsults(input: string, blocklist: string[] = DEFAULT_BLOCKLIST): MaskResult {
  let masked = false;
  let text = input;
  for (const word of blocklist) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    text = text.replace(re, () => {
      masked = true;
      return MASK;
    });
  }
  return { text, masked };
}
