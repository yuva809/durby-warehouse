import { ArgumentsHost, Catch, ConflictException, ExceptionFilter, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Many service methods look a record up with `findUniqueOrThrow`/`update`/
 * `delete` by an id that came straight from the URL, without a manual
 * existence check first — a nonexistent/malformed id throws Prisma's
 * P2025 ("record not found"), which is not a NestJS HttpException and so
 * would otherwise fall through to the framework's generic 500 handler.
 * This maps that to a proper 404, and P2002 ("unique constraint failed" —
 * e.g. a duplicate sku/barcode on product create/update) to a proper 409
 * naming the conflicting field, so a predictable, expected user input error
 * (a manager typing a barcode that's already on another product) reads as
 * a clean validation message instead of a raw 500 with a stack trace.
 * Everything else re-throws completely unchanged.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaNotFoundFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception.code === 'P2025') {
      const notFound = new NotFoundException('Resource not found');
      response.status(notFound.getStatus()).json(notFound.getResponse());
      return;
    }

    if (exception.code === 'P2002') {
      const target = exception.meta?.target;
      const fields = Array.isArray(target) ? target.join(', ') : String(target ?? 'field');
      const conflict = new ConflictException(`A record with this ${fields} already exists.`);
      response.status(conflict.getStatus()).json(conflict.getResponse());
      return;
    }

    throw exception;
  }
}
