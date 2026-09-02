import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";

import type { AuthenticatedRequest } from "../interfaces/request-context.interface.js";

/**
 * The body parser rejects an oversized request before any handler runs, so without this
 * an attachment that is too big surfaces as a bare "Internal server error".
 */
function describeOversizedBody(exception: unknown) {
  if (typeof exception !== "object" || exception === null) {
    return null;
  }

  const candidate = exception as { type?: unknown };
  return candidate.type === "entity.too.large"
    ? "Attachment is too large to save. Use an image under 2 MB and a document under 5 MB."
    : null;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<{ status: (code: number) => { json: (body: unknown) => void } }>();
    const request = context.getRequest<AuthenticatedRequest>();

    const oversizedBodyMessage = describeOversizedBody(exception);
    const httpStatus = exception instanceof HttpException
      ? exception.getStatus()
      : oversizedBodyMessage
        ? HttpStatus.PAYLOAD_TOO_LARGE
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorResponse = exception instanceof HttpException
      ? exception.getResponse()
      : oversizedBodyMessage ?? "Internal server error";

    this.logger.error({
      requestId: request.requestId,
      path: (request as { url?: string }).url,
      method: (request as { method?: string }).method,
      error: errorResponse,
      message: exception instanceof Error ? exception.message : "Unknown error",
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    response.status(httpStatus).json({
      success: false,
      requestId: request.requestId,
      error: typeof errorResponse === "string" ? { message: errorResponse } : errorResponse,
      timestamp: new Date().toISOString(),
    });
  }
}
