import { ArgumentsHost, BadRequestException, Catch, ConflictException, ExceptionFilter, NotFoundException } from '@nestjs/common';
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
 * P2003 ("foreign key constraint failed") means the request referenced a record that does not exist (a made-up productId,
 * locationId, ...): that is the caller's mistake, so it is a clear 400 naming what is missing rather than a 500.
 * Endpoints with a more specific check (e.g. POST /requests) give a friendlier message before ever reaching here.
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

    if (exception.code === 'P2003') {
      const raw = String(exception.meta?.field_name ?? exception.meta?.constraint ?? '');
      const what = /product/i.test(raw) ? 'product' : /location|branch|warehouse/i.test(raw) ? 'location' : /user|driver|createdBy|uploadedBy/i.test(raw) ? 'user' : /request/i.test(raw) ? 'request' : /category/i.test(raw) ? 'category' : 'record';
      const bad = new BadRequestException(`The referenced ${what} does not exist.`);
      response.status(bad.getStatus()).json(bad.getResponse());
      return;
    }

    throw exception;
  }
}
