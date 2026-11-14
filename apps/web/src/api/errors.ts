/** A failed API call. Mirrors the C3 error envelope; also used by the fixture backend. */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | null;
  readonly details: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status: number,
    requestId: string | null = null,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export function errorCode(error: unknown): string | null {
  return error instanceof ApiRequestError ? error.code : null;
}
