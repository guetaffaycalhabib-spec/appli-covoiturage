/**
 * Valeurs initiales des paramètres métier. Le cahier des charges impose qu'aucun seuil ne soit codé
 * en dur : ces valeurs ne servent que tant qu'aucune version n'a été enregistrée par l'administration
 * (table platform_settings, versionnée).
 */
export const DEFAULT_SETTINGS = {
  'otp.ttlSeconds': 300,
  'otp.maxAttempts': 5,
  'otp.maxSendsPerWindow': 3,
  'otp.sendWindowSeconds': 900,
  'maps.roadFactor': 1.25,
  'search.corridorRadiusKm': 15,
  'search.maxDetourKm': 25,
  'search.nearbyDays': 2,
  'booking.manualResponseMinutes': 120,
  'booking.freeCancellationHours': 24,
  'booking.lateCancellationFeePercent': 20,
  'booking.lateCancellationDriverSharePercent': 50,
  'booking.pickupCodeEnabled': true,
  'booking.pickupCodeMaxAttempts': 5,
  'reliability.lateCancellationPenalty': 5,
  'reliability.noShowPenalty': 15,
  'reliability.driverCancellationPenalty': 10,
  'commission.percent': 0,
  'wallet.minDriverBalanceToPublish': -2000,
  'tracking.preDepartureWindowMinutes': 60,
  'tracking.shareLinkGraceHours': 2,
  'messaging.gracePeriodHours': 72,
  'safety.emergencyNotifySms': true,
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type SettingValue<K extends SettingKey> = (typeof DEFAULT_SETTINGS)[K] extends boolean
  ? boolean
  : (typeof DEFAULT_SETTINGS)[K] extends number
    ? number
    : string;
