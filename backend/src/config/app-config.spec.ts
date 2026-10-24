import { loadConfig } from './app-config';

describe('loadConfig', () => {
  const prod = { NODE_ENV: 'production', DATABASE_URL: 'postgres://db', JWT_ACCESS_SECRET: 's' };

  it('exige les secrets en production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', SMS_PROVIDERS: 'x' })).toThrow(/DATABASE_URL/);
  });

  it('interdit le fournisseur SMS de développement et la synchronisation du schéma en production', () => {
    expect(() => loadConfig(prod)).toThrow(/console/);
    expect(() => loadConfig({ ...prod, SMS_PROVIDERS: 'x', DB_SYNCHRONIZE: 'true' })).toThrow(/migrations/);
    expect(() => loadConfig({ ...prod, SMS_PROVIDERS: 'x' })).toThrow(/PUBLIC_TRACKING_URL/);
  });

  it('fournit des valeurs de développement par défaut', () => {
    expect(loadConfig({}).smsProviders).toEqual(['console']);
  });
});
