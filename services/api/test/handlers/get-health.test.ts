import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { handler } from '../../src/handlers/get-health.js';

describe('SETUP-01 GET /api/health', () => {
  it('returns 200 with status ok and the server time', async () => {
    const result = (await handler({} as APIGatewayProxyEventV2, {} as Context, () => {})) as APIGatewayProxyStructuredResultV2;

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body ?? '')).toEqual({ status: 'ok' });
    expect(result.headers?.['x-server-time']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
