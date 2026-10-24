import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { AccessTokenPayload } from '../../common/auth/auth.types';
import { DomainError } from '../../common/errors';
import { numericCode, safeEqual, sha256 } from '../../common/utils/codes';
import { normalizeAlgerianMobile } from '../../common/utils/phone';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { SmsService } from '../notifications/sms.provider';
import { SettingsService } from '../settings/settings.service';
import { User, UserStatus } from '../users/user.entities';
import { OtpChallenge, RefreshToken } from './auth.entities';

const invalidToken = () => new DomainError('INVALID_TOKEN', 'Jeton invalide ou expiré', HttpStatus.UNAUTHORIZED);

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(OtpChallenge) private readonly challenges: Repository<OtpChallenge>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly sms: SmsService,
    private readonly settings: SettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** P-01 : OTP à 6 chiffres, durée de validité limitée, limite de renvois par fenêtre glissante. */
  async requestOtp(rawPhone: string): Promise<{ challengeId: string; expiresAt: Date }> {
    const phone = normalizeAlgerianMobile(rawPhone);
    if (!phone) throw new DomainError('INVALID_PHONE', 'Numéro de mobile algérien invalide', HttpStatus.BAD_REQUEST);

    const [ttl, maxSends, windowSeconds] = await Promise.all([
      this.settings.get('otp.ttlSeconds'),
      this.settings.get('otp.maxSendsPerWindow'),
      this.settings.get('otp.sendWindowSeconds'),
    ]);
    const recent = await this.challenges.count({
      where: { phone, createdAt: MoreThan(new Date(Date.now() - windowSeconds * 1000)) },
    });
    if (recent >= maxSends) {
      throw new DomainError('OTP_RATE_LIMITED', 'Trop de demandes de code, réessayez plus tard', HttpStatus.TOO_MANY_REQUESTS, {
        retryAfterSeconds: windowSeconds,
      });
    }

    const code = numericCode(6);
    const challenge = await this.challenges.save(
      this.challenges.create({ phone, codeHash: sha256(code), expiresAt: new Date(Date.now() + ttl * 1000) }),
    );
    await this.sms.send(phone, `Votre code de vérification : ${code}. Ne le partagez avec personne.`);
    return { challengeId: challenge.id, expiresAt: challenge.expiresAt };
  }

  async verifyOtp(challengeId: string, code: string, deviceId?: string) {
    const challenge = await this.challenges.findOneBy({ id: challengeId });
    if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date()) {
      throw new DomainError('OTP_EXPIRED', 'Code expiré, demandez-en un nouveau', HttpStatus.UNAUTHORIZED);
    }
    const maxAttempts = await this.settings.get('otp.maxAttempts');
    if (challenge.attempts >= maxAttempts) {
      throw new DomainError('OTP_LOCKED', 'Trop de tentatives, demandez un nouveau code', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!safeEqual(sha256(code), challenge.codeHash)) {
      await this.challenges.increment({ id: challenge.id }, 'attempts', 1);
      throw new DomainError('OTP_INVALID', 'Code incorrect', HttpStatus.UNAUTHORIZED, {
        remainingAttempts: Math.max(0, maxAttempts - challenge.attempts - 1),
      });
    }
    // Consommation atomique : un même code ne peut ouvrir qu'une session.
    const consumed = await this.challenges.update({ id: challenge.id, consumedAt: IsNull() }, { consumedAt: new Date() });
    if (!consumed.affected) throw new DomainError('OTP_EXPIRED', 'Code expiré, demandez-en un nouveau', HttpStatus.UNAUTHORIZED);

    let user = await this.users.findOneBy({ phone: challenge.phone });
    const isNewUser = !user;
    if (!user) {
      await this.users.createQueryBuilder().insert().values({ phone: challenge.phone }).orIgnore().execute();
      user = await this.users.findOneByOrFail({ phone: challenge.phone });
    }
    if (user.status === UserStatus.DELETED) {
      throw new DomainError('ACCOUNT_DELETED', 'Ce compte a été supprimé', HttpStatus.FORBIDDEN);
    }
    return { ...(await this.issueTokens(user, deviceId ?? null)), isNewUser, userId: user.id };
  }

  async refresh(refreshToken: string) {
    const [id, secret] = refreshToken.split('.');
    if (!id || !secret || !/^[0-9a-f-]{36}$/.test(id)) throw invalidToken();
    const stored = await this.refreshTokens.findOneBy({ id });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !safeEqual(sha256(secret), stored.tokenHash)) {
      throw invalidToken();
    }
    // Rotation : l'ancien jeton est révoqué à chaque renouvellement.
    const revoked = await this.refreshTokens.update({ id, revokedAt: IsNull() }, { revokedAt: new Date() });
    if (!revoked.affected) throw invalidToken();
    const user = await this.users.findOneByOrFail({ id: stored.userId });
    if (user.status === UserStatus.DELETED) throw invalidToken();
    return this.issueTokens(user, stored.deviceId);
  }

  async logout(refreshToken: string): Promise<void> {
    const [id] = refreshToken.split('.');
    if (id && /^[0-9a-f-]{36}$/.test(id)) await this.refreshTokens.update({ id }, { revokedAt: new Date() });
  }

  /** Déconnexion à distance de tous les appareils. */
  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async issueTokens(user: User, deviceId: string | null) {
    const payload: AccessTokenPayload = { sub: user.id, staffRoles: user.staffRoles ?? [], typ: 'access' };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.jwtAccessSecret,
      expiresIn: this.config.jwtAccessTtlSeconds,
    });
    const secret = randomBytes(32).toString('base64url');
    const stored = await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: sha256(secret),
        deviceId,
        expiresAt: new Date(Date.now() + this.config.jwtRefreshTtlSeconds * 1000),
      }),
    );
    return { accessToken, refreshToken: `${stored.id}.${secret}`, expiresIn: this.config.jwtAccessTtlSeconds };
  }
}
