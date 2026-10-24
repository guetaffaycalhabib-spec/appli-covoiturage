import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { DomainError } from './errors';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toBody(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : exception);
    res.status(status).json({ error: body });
  }

  private toBody(exception: unknown): { status: number; body: Record<string, unknown> } {
    if (exception instanceof DomainError) {
      return {
        status: exception.status,
        body: { code: exception.code, message: exception.message, details: exception.details },
      };
    }
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message = typeof response === 'string' ? response : (response as { message?: unknown }).message;
      const status = exception.getStatus();
      const code = status === HttpStatus.BAD_REQUEST ? 'VALIDATION_FAILED' : HttpStatus[status] ?? 'HTTP_ERROR';
      return { status, body: { code, message } };
    }
    if (exception instanceof QueryFailedError) {
      const driverError = (exception as QueryFailedError & { driverError?: { code?: string; constraint?: string } })
        .driverError;
      // Violation d'une contrainte CHECK : dernier rempart (ex. prix au-dessus du plafond).
      if (driverError?.code === '23514') {
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          body: { code: 'CONSTRAINT_VIOLATION', message: 'Contrainte métier violée', details: { constraint: driverError.constraint } },
        };
      }
      if (driverError?.code === '23505') {
        return {
          status: HttpStatus.CONFLICT,
          body: { code: 'DUPLICATE', message: 'Ressource déjà existante', details: { constraint: driverError.constraint } },
        };
      }
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: { code: 'INTERNAL_ERROR', message: 'Erreur interne' } };
  }
}
