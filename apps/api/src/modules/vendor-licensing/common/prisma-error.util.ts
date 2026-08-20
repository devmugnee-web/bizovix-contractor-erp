import { ConflictException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";

/** Prisma's unique-constraint violation code. https://www.prisma.io/docs/orm/reference/error-reference#p2002 */
const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

/**
 * Converts a Prisma unique-constraint violation into a clean 409, matching this API's shared
 * error envelope, instead of letting it fall through to the generic 500 handler. Rethrows
 * anything else unchanged. Always throws — never returns.
 */
export function rethrowAsConflictIfUniqueViolation(error: unknown, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
    throw new ConflictException(message);
  }
  throw error;
}
