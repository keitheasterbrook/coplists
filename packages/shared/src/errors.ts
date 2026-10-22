import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'LIST_NOT_FOUND',
  'PRIMARY_ADMIN_LOCKED',
  'INVITE_LIMIT_REACHED',
  'NOT_IMPLEMENTED',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Body of every non-2xx response from our own handlers (not API Gateway's own 401s and 429s). */
export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
