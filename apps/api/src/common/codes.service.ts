import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export type CodePrefix = 'REQ' | 'TR' | 'OC' | 'DC' | 'INV';

// REQ/TR are internal/API identifiers that predate this padding scheme —
// left unpadded so existing codes (REQ-1024) don't change shape. OC/DC/INV
// are the new customer-facing document numbers and use the zero-padded
// "-000001" format from the spec.
const PAD: Partial<Record<CodePrefix, number>> = { OC: 6, DC: 6, INV: 6 };

/**
 * Generates human-friendly, collision-free codes (REQ-1024, TR-1024,
 * OC-000001, DC-000001) via a single atomic `UPDATE ... RETURNING` against
 * CodeSequence. This is the direct fix for V1's in-memory counter, which two
 * browser tabs could race and collide on — here the row-level lock Postgres
 * takes for the UPDATE duration makes concurrent callers serialize
 * automatically.
 */
@Injectable()
export class CodesService {
  constructor(private prisma: PrismaService) {}

  /** Must be called with an active transaction client if used inside a larger transaction. */
  async next(prefix: CodePrefix, tx?: Tx): Promise<string> {
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
    const pad = PAD[prefix];
    const value = pad ? String(rows[0].value).padStart(pad, '0') : String(rows[0].value);
    return `${prefix}-${value}`;
  }
}
