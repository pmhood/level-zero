import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@level-zero/domain';
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

/**
 * Translates domain failures into HTTP responses.
 *
 * The domain layer throws framework-free errors; this is the only place that
 * knows what they mean over HTTP, so services never import status codes.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter<DomainError> {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = statusFor(error);

    if (status >= 500) {
      this.logger.error(`Unmapped domain error: ${error.name}`, error.stack);
    }

    response.status(status).json({
      statusCode: status,
      error: error.code,
      message: error.message,
      details: error.details,
    });
  }
}

function statusFor(error: DomainError): number {
  if (error instanceof NotFoundError) return HttpStatus.NOT_FOUND;
  if (error instanceof ValidationError) return HttpStatus.BAD_REQUEST;
  if (error instanceof ConflictError) return HttpStatus.CONFLICT;
  if (error instanceof ForbiddenError) return HttpStatus.FORBIDDEN;
  return HttpStatus.INTERNAL_SERVER_ERROR;
}
