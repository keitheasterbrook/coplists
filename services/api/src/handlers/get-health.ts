import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { json } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async () => json(200, { status: 'ok' });
