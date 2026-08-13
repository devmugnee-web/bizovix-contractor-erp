import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === "object" && body !== null && "errors" in body) {
        response.status(status).json({
          success: false,
          message: (body as { message?: string }).message ?? "Validation failed",
          errors: (body as { errors: Record<string, string[]> }).errors,
        });
        return;
      }

      const message =
        typeof body === "string" ? body : (body as { message?: string | string[] }).message;

      response.status(status).json({
        success: false,
        message: Array.isArray(message) ? message.join(", ") : message ?? exception.message,
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
    });
  }
}
