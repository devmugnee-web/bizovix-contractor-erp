export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors?: Record<string, string[]>,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
