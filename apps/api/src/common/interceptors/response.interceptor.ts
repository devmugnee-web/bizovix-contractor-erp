import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { RESPONSE_MESSAGE_KEY } from "../decorators/response-message.decorator";

interface PaginatedShape {
  items: unknown[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  summary?: unknown;
}

function isPaginatedShape(value: unknown): value is PaginatedShape {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as PaginatedShape).items) &&
    typeof (value as PaginatedShape).meta === "object"
  );
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const message = this.reflector.get<string | undefined>(
      RESPONSE_MESSAGE_KEY,
      context.getHandler(),
    );

    return next.handle().pipe(
      map((result) => {
        if (isPaginatedShape(result)) {
          return { success: true, data: result.items, meta: result.meta, ...(result.summary !== undefined ? { summary: result.summary } : {}) };
        }
        return {
          success: true,
          ...(message ? { message } : {}),
          data: result ?? null,
        };
      }),
    );
  }
}
