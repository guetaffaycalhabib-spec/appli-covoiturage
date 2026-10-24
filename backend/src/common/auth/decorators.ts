import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthUser, StaffRole } from './auth.types';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const STAFF_ROLES = 'staffRoles';
/** Restreint une route au personnel ayant au moins un des rôles indiqués (l'administrateur a tous les droits). */
export const StaffOnly = (...roles: StaffRole[]) => SetMetadata(STAFF_ROLES, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
