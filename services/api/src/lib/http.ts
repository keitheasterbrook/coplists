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

/** Placeholder for a route whose story isn't built yet; replaced when the story is implemented. */
export function notImplemented(story: string): APIGatewayProxyHandlerV2 {
  return async () => json(501, { error: { code: 'NOT_IMPLEMENTED', message: `Not implemented yet (${story})` } });
}
