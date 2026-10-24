import { HttpStatus } from '@nestjs/common';

/**
 * Erreur métier normalisée. Le `code` est stable et sert de clé de traduction côté clients
 * (cahier des charges 14.3 : codes d'erreur normalisés et messages traduisibles).
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what: string) =>
  new DomainError(`${what.toUpperCase()}_NOT_FOUND`, `${what} introuvable`, HttpStatus.NOT_FOUND);

export const forbidden = (code: string, message: string) => new DomainError(code, message, HttpStatus.FORBIDDEN);

export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new DomainError(code, message, HttpStatus.CONFLICT, details);
