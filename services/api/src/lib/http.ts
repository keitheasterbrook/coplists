import type { ApiError, ErrorCode } from '@coplist/shared';
import type { APIGatewayProxyHandlerV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

export function json(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'x-server-time': new Date().toISOString(),
    },
    body: JSON.stringify(body),
  };
}

export function error(statusCode: number, code: ErrorCode, message: string): APIGatewayProxyStructuredResultV2 {
  const body: ApiError = { error: { code, message } };
  return json(statusCode, body);
}

/** Placeholder for a route whose story isn't built yet; replaced when the story is implemented. */
export function notImplemented(story: string): APIGatewayProxyHandlerV2 {
  return async () => error(501, 'NOT_IMPLEMENTED', `Not implemented yet (${story})`);
}
