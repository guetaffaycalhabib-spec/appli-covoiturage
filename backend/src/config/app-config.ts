export interface AppConfig {
  port: number;
  databaseUrl: string;
  dbSynchronize: boolean;
  dbRunMigrations: boolean;
  jwtAccessSecret: string;
  jwtAccessTtlSeconds: number;
  jwtRefreshTtlSeconds: number;
  smsProviders: string[];
  /** Adresse publique des liens de suivi envoyés aux proches (P-31, SOS). */
  publicTrackingUrl: string;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

function required(env: NodeJS.ProcessEnv, key: string, fallback?: string): string {
  const value = env[key] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Variable d'environnement manquante : ${key}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProd = env.NODE_ENV === 'production';
  const smsProviders = (env.SMS_PROVIDERS ?? 'console').split(',').map((s) => s.trim()).filter(Boolean);
  if (isProd && smsProviders.includes('console')) {
    // Le fournisseur console écrit les codes OTP dans les journaux.
    throw new Error('Le fournisseur SMS « console » est interdit en production');
  }
  if (isProd && env.DB_SYNCHRONIZE === 'true') throw new Error('DB_SYNCHRONIZE est interdit en production : utiliser les migrations');
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: required(env, 'DATABASE_URL', isProd ? undefined : 'postgres://postgres:postgres@localhost:5432/covoiturage'),
    dbSynchronize: env.DB_SYNCHRONIZE === 'true',
    dbRunMigrations: env.DB_RUN_MIGRATIONS !== 'false',
    jwtAccessSecret: required(env, 'JWT_ACCESS_SECRET', isProd ? undefined : 'dev-access-secret'),
    jwtAccessTtlSeconds: Number(env.JWT_ACCESS_TTL_SECONDS ?? 900),
    jwtRefreshTtlSeconds: Number(env.JWT_REFRESH_TTL_SECONDS ?? 30 * 24 * 3600),
    smsProviders,
    publicTrackingUrl: required(env, 'PUBLIC_TRACKING_URL', isProd ? undefined : 'http://localhost:3000/api/v1/public/tracking').replace(/\/$/, ''),
  };
}
