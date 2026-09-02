import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

import type { AuthenticatedRequest } from "../interfaces/request-context.interface.js";

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<{ setHeader: (name: string, value: string) => void }>();
    const requestId = (request.headers["x-request-id"] as string | undefined) ?? randomUUID();

    request.requestId = requestId;
    response.setHeader("x-request-id", requestId);

    return next.handle().pipe(
      tap(() => {
        response.setHeader("x-request-id", requestId);
      }),
    );
  }
}
