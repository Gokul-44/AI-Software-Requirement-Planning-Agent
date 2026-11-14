import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { API_ERROR_HTTP_STATUS, makeApiError } from '@spm/shared';
import type { ApiErrorCode } from '@spm/shared';

/** An error that maps to a C3 error response. */
export class AppError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', `No route for ${req.method} ${req.path}.`));
};

export function zodDetails(err: ZodError): Record<string, unknown> {
  return {
    issues: err.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}

/** Last middleware: every non-2xx response uses the C3 envelope. */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const requestId = String(req.id ?? '');
  let code: ApiErrorCode = 'INTERNAL';
  let message = 'Internal server error.';
  let details: Record<string, unknown> = {};

  if (err instanceof AppError) {
    ({ code, message, details } = err);
  } else if (err instanceof ZodError) {
    code = 'VALIDATION_FAILED';
    message = 'Request validation failed.';
    details = zodDetails(err);
  } else if (isBodyParserError(err)) {
    code = 'VALIDATION_FAILED';
    message =
      err.type === 'entity.too.large'
        ? 'Request body is too large (limit 50 kb).'
        : 'Request body is not valid JSON.';
  } else {
    req.log.error({ err }, 'unhandled error');
  }

  if (res.headersSent) return;
  res.status(API_ERROR_HTTP_STATUS[code]).json(makeApiError(code, message, requestId, details));
};

function isBodyParserError(err: unknown): err is { type: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    typeof (err as { type: unknown }).type === 'string' &&
    [
      'entity.too.large',
      'entity.parse.failed',
      'encoding.unsupported',
      'charset.unsupported',
    ].includes((err as { type: string }).type)
  );
}
