import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { DomainError } from '../errors';
import { AccessTokenPayload, StaffRole } from './auth.types';
import { IS_PUBLIC, STAFF_ROLES } from './decorators';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new DomainError('UNAUTHENTICATED', 'Authentification requise', HttpStatus.UNAUTHORIZED);
    }
    let payload: AccessTokenPayload;
    try {
      payload = this.jwt.verify<AccessTokenPayload>(header.slice(7), { secret: this.config.jwtAccessSecret });
    } catch {
      throw new DomainError('INVALID_TOKEN', 'Jeton invalide ou expiré', HttpStatus.UNAUTHORIZED);
    }
    if (payload.typ !== 'access') {
      throw new DomainError('INVALID_TOKEN', 'Jeton invalide ou expiré', HttpStatus.UNAUTHORIZED);
    }
    request.user = { id: payload.sub, staffRoles: payload.staffRoles ?? [] };

    const required = this.reflector.getAllAndOverride<StaffRole[] | undefined>(STAFF_ROLES, targets);
    if (required) {
      const roles: StaffRole[] = request.user.staffRoles;
      const allowed = roles.includes(StaffRole.ADMIN) || required.some((r) => roles.includes(r));
      if (!allowed) throw new DomainError('FORBIDDEN', 'Droits insuffisants', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
