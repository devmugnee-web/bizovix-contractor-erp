import { BadRequestException } from "@nestjs/common";
import type { ValidationError } from "class-validator";

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const grouped: Record<string, string[]> = {};

  for (const error of errors) {
    grouped[error.property] = Object.values(error.constraints ?? {});
  }

  return new BadRequestException({
    message: "Validation failed",
    errors: grouped,
  });
}
