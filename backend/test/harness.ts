import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { StaffRole } from '../src/common/auth/auth.types';
import { loadConfig } from '../src/config/app-config';
import { SMS_PROVIDERS, SmsProvider } from '../src/modules/notifications/sms.provider';
import { User } from '../src/modules/users/user.entities';

export class FakeSms implements SmsProvider {
  readonly name = 'fake';
  readonly sent: { to: string; text: string }[] = [];

  async send(to: string, text: string) {
    this.sent.push({ to, text });
  }

  lastCodeFor(phone: string): string {
    const msg = [...this.sent].reverse().find((m) => m.to === phone && /code/.test(m.text));
    if (!msg) throw new Error(`Aucun OTP envoyé à ${phone}`);
    return /(\d{6})/.exec(msg.text)![1];
  }
}

export const ALGER = { label: 'Alger, gare routière du Caroubier', lat: 36.7372, lng: 3.0865, wilaya: 16 };
export const ORAN = { label: 'Oran, gare routière', lat: 35.6971, lng: -0.6308, wilaya: 31 };
export const CHLEF = { label: 'Chlef centre', lat: 36.1652, lng: 1.3345, wilaya: 2 };
export const CONSTANTINE = { label: 'Constantine', lat: 36.365, lng: 6.6147, wilaya: 25 };

let phoneSeq = 0;
/** Numéro unique par exécution, pour isoler les scénarios. */
export const nextPhone = () => `+21355${String(Date.now()).slice(-4)}${String(phoneSeq++).padStart(3, '0')}`;

export const inDays = (days: number, hour = 8) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hour - 1, 0, 0, 0);
  return d;
};
export const dzDay = (d: Date) => new Date(d.getTime() + 3_600_000).toISOString().slice(0, 10);

export interface Session {
  id: string;
  token: string;
  phone: string;
}

export class Harness {
  app: INestApplication;
  sms = new FakeSms();
  ds: DataSource;
  private staffCache?: Session;

  async start() {
    const config = loadConfig({
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/covoiturage_test',
      // Schéma créé par les migrations, comme en production.
      DB_SYNCHRONIZE: 'false',
      DB_RUN_MIGRATIONS: 'true',
    });
    await resetDatabase(config.databaseUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot({ config, disableScheduler: true, disableThrottling: true })] })
      .overrideProvider(SMS_PROVIDERS)
      .useValue([this.sms])
      .compile();
    this.app = configureApp(moduleRef.createNestApplication());
    await this.app.init();
    this.ds = this.app.get(DataSource);
    return this;
  }

  async stop() {
    await this.app?.close();
  }

  http() {
    return request(this.app.getHttpServer());
  }

  get(path: string, s?: Session) {
    const r = this.http().get(`/api/v1${path}`);
    return s ? r.set('Authorization', `Bearer ${s.token}`) : r;
  }

  post(path: string, s?: Session, body: object = {}) {
    const r = this.http().post(`/api/v1${path}`).send(body);
    return s ? r.set('Authorization', `Bearer ${s.token}`) : r;
  }

  patch(path: string, s: Session, body: object = {}) {
    return this.http().patch(`/api/v1${path}`).send(body).set('Authorization', `Bearer ${s.token}`);
  }

  put(path: string, s: Session, body: object = {}) {
    return this.http().put(`/api/v1${path}`).send(body).set('Authorization', `Bearer ${s.token}`);
  }

  async login(phone = nextPhone()): Promise<Session> {
    const req = await this.post('/auth/otp/request', undefined, { phone }).expect(201);
    const res = await this.post('/auth/otp/verify', undefined, {
      challengeId: req.body.challengeId,
      code: this.sms.lastCodeFor(phone),
    }).expect(201);
    return { id: res.body.userId, token: res.body.accessToken, phone };
  }

  /** Compte avec profil complet, sans vérification d'identité. */
  async user(profile: { firstName?: string; gender?: 'female' | 'male' } = {}): Promise<Session> {
    const s = await this.login();
    await this.patch('/me', s, { firstName: profile.firstName ?? 'Amine', lastName: 'Test', birthDate: '1995-04-12', ...(profile.gender ? { gender: profile.gender } : {}) }).expect(200);
    return s;
  }

  async staff(): Promise<Session> {
    if (this.staffCache) return this.staffCache;
    const s = await this.login();
    await this.ds.getRepository(User).update({ id: s.id }, { staffRoles: [StaffRole.ADMIN] });
    // Les rôles du personnel sont portés par le jeton : reconnexion pour en obtenir un nouveau.
    this.staffCache = { ...(await this.login(s.phone)) };
    return this.staffCache;
  }

  /** Dépôt d'un document puis validation par un vérificateur. */
  async approveDoc(s: Session, type: string, extra: object = {}, approval: object = {}) {
    const doc = await this.post('/kyc/documents', s, { type, fileRef: `kyc/${s.id}/${type}.jpg`, ...extra }).expect(201);
    await this.post(`/admin/kyc/documents/${doc.body.id}/approve`, await this.staff(), approval).expect(201);
    return doc.body.id as string;
  }

  /** Identité validée (niveau 1) avec le genre indiqué. */
  async verifiedUser(gender: 'female' | 'male', firstName = gender === 'female' ? 'Samira' : 'Karim'): Promise<Session> {
    const s = await this.user({ firstName });
    const nextYear = `${new Date().getFullYear() + 3}-01-01`;
    await this.approveDoc(s, 'national_id', {}, { expiresAt: nextYear, gender });
    await this.approveDoc(s, 'selfie');
    return s;
  }

  /** Conducteur prêt à publier (niveau 2) avec un véhicule validé de 5 places. */
  async driver(gender: 'female' | 'male' = 'male'): Promise<Session & { vehicleId: string }> {
    const s = await this.verifiedUser(gender, gender === 'female' ? 'Nadia' : 'Yacine');
    const nextYear = `${new Date().getFullYear() + 3}-01-01`;
    await this.approveDoc(s, 'driving_license', {}, { expiresAt: nextYear });
    await this.approveDoc(s, 'insurance', {}, { expiresAt: nextYear });
    const vehicle = await this.post('/vehicles', s, { make: 'Renault', model: 'Symbol', year: 2019, color: 'Blanc', plate: '12345 119 16', seats: 5 }).expect(201);
    await this.approveDoc(s, 'vehicle_registration', { vehicleId: vehicle.body.id });
    await this.post('/me/driver-charter', s).expect(201);
    return { ...s, vehicleId: vehicle.body.id };
  }

  async quote(seats = 3, from = ALGER, to = ORAN) {
    const res = await this.post('/trips/quote', await this.staff(), { origin: from, destination: to, seats }).expect(201);
    return res.body as { priceCap: number; suggestedPrice: number };
  }

  async publish(driver: Session & { vehicleId: string }, overrides: object = {}) {
    const { suggestedPrice } = await this.quote((overrides as { seats?: number }).seats ?? 3);
    const res = await this.post('/trips', driver, {
      vehicleId: driver.vehicleId,
      origin: ALGER,
      destination: ORAN,
      departureAt: inDays(2).toISOString(),
      seats: 3,
      pricePerSeat: suggestedPrice,
      ...overrides,
    });
    if (res.status !== 201) throw new Error(`Publication refusée : ${JSON.stringify(res.body)}`);
    return res.body as { id: string; pricePerSeat: number; priceCap: number; departureAt: string };
  }

  async setSetting(key: string, value: unknown) {
    await this.put(`/admin/settings/${key}`, await this.staff(), { value }).expect(200);
  }
}

async function resetDatabase(url: string) {
  const ds = new DataSource({ type: 'postgres', url });
  await ds.initialize();
  await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await ds.destroy();
}
