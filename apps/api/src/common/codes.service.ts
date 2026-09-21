import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Generates human-friendly, collision-free codes (REQ-1024, TR-1024) via a
 * single atomic `UPDATE ... RETURNING` against CodeSequence. This is the
 * direct fix for V1's in-memory counter, which two browser tabs could race
 * and collide on — here the row-level lock Postgres takes for the UPDATE
 * duration makes concurrent callers serialize automatically.
 */
@Injectable()
export class CodesService {
  constructor(private prisma: PrismaService) {}

  /** Must be called with an active transaction client if used inside a larger transaction. */
  async next(prefix: 'REQ' | 'TR', tx?: Tx): Promise<string> {
    const client = tx ?? this.prisma;
    const rows = await client.$queryRaw<{ value: number }[]>`
      UPDATE "CodeSequence"
      SET "value" = "value" + 1
      WHERE "prefix" = ${prefix}
      RETURNING "value"
    `;
    if (rows.length === 0) {
      throw new Error(`Unknown code sequence prefix: ${prefix}`);
    }
    return `${prefix}-${rows[0].value}`;
  }
}
