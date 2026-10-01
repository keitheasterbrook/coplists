/**
 * Every HTTP API route, one Lambda each. `handler` is the file name in
 * services/api/src/handlers (the kebab-case of the OpenAPI operationId).
 * Keep in step with services/api/openapi/openapi.yaml.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Least-privilege DynamoDB access for the route's Lambda. */
export type TableAccess = 'read' | 'readWrite';

/** Cognito admin actions a route needs on the user pool (ADMIN-02). */
export type CognitoAdminAction = 'cognito-idp:AdminCreateUser' | 'cognito-idp:AdminDeleteUser';

export interface ApiRoute {
  method: HttpMethod;
  path: string;
  handler: string;
  story: string;
  table?: TableAccess;
  cognito?: CognitoAdminAction[];
  /** Only GET /api/health. Every other route has the JWT authorizer and the coplist/api scope. */
  public?: true;
}

export const API_ROUTES: readonly ApiRoute[] = [
  { method: 'GET', path: '/api/health', handler: 'get-health', story: 'SETUP-01', public: true },
  { method: 'GET', path: '/api/me', handler: 'get-me', story: 'AUTH-01', table: 'read' },

  { method: 'GET', path: '/api/lists', handler: 'list-my-lists', story: 'LIST-02', table: 'read' },
  { method: 'POST', path: '/api/lists', handler: 'create-list', story: 'LIST-01', table: 'readWrite' },
  { method: 'GET', path: '/api/lists/{listId}', handler: 'get-list', story: 'SYNC-01', table: 'read' },
  { method: 'PATCH', path: '/api/lists/{listId}', handler: 'rename-list', story: 'LIST-03', table: 'readWrite' },
  { method: 'DELETE', path: '/api/lists/{listId}', handler: 'delete-list', story: 'LIST-04', table: 'readWrite' },

  { method: 'POST', path: '/api/lists/{listId}/items', handler: 'create-item', story: 'ITEM-01', table: 'readWrite' },
  { method: 'POST', path: '/api/lists/{listId}/items/clear-checked', handler: 'clear-checked-items', story: 'ITEM-05', table: 'readWrite' },
  { method: 'PATCH', path: '/api/lists/{listId}/items/{itemId}', handler: 'update-item', story: 'ITEM-02', table: 'readWrite' },
  { method: 'DELETE', path: '/api/lists/{listId}/items/{itemId}', handler: 'remove-item', story: 'ITEM-04', table: 'readWrite' },
  { method: 'POST', path: '/api/lists/{listId}/items/{itemId}/restore', handler: 'restore-item', story: 'ITEM-04', table: 'readWrite' },

  { method: 'POST', path: '/api/lists/{listId}/groups', handler: 'create-group', story: 'GROUP-01', table: 'readWrite' },
  { method: 'PATCH', path: '/api/lists/{listId}/groups/{groupId}', handler: 'update-group', story: 'GROUP-05', table: 'readWrite' },
  { method: 'DELETE', path: '/api/lists/{listId}/groups/{groupId}', handler: 'delete-group', story: 'GROUP-07', table: 'readWrite' },

  { method: 'GET', path: '/api/lists/{listId}/members', handler: 'list-members', story: 'SHARE-03', table: 'read' },
  { method: 'PATCH', path: '/api/lists/{listId}/members/{userId}', handler: 'change-member-role', story: 'SHARE-03', table: 'readWrite' },
  { method: 'DELETE', path: '/api/lists/{listId}/members/{userId}', handler: 'remove-member', story: 'SHARE-04', table: 'readWrite' },
  { method: 'POST', path: '/api/lists/{listId}/leave', handler: 'leave-list', story: 'SHARE-05', table: 'readWrite' },

  { method: 'GET', path: '/api/lists/{listId}/invites', handler: 'list-list-invites', story: 'SHARE-01', table: 'read' },
  { method: 'POST', path: '/api/lists/{listId}/invites', handler: 'invite-to-list', story: 'SHARE-01', table: 'readWrite' },
  { method: 'DELETE', path: '/api/lists/{listId}/invites/{inviteId}', handler: 'cancel-invite', story: 'SHARE-01', table: 'readWrite' },
  { method: 'GET', path: '/api/invites', handler: 'list-my-invites', story: 'SHARE-02', table: 'read' },
  { method: 'POST', path: '/api/invites/{inviteId}/accept', handler: 'accept-invite', story: 'SHARE-02', table: 'readWrite' },
  { method: 'POST', path: '/api/invites/{inviteId}/reject', handler: 'reject-invite', story: 'SHARE-02', table: 'readWrite' },

  { method: 'GET', path: '/api/templates', handler: 'list-templates', story: 'GROUP-02', table: 'read' },
  { method: 'POST', path: '/api/templates', handler: 'create-template', story: 'ADMIN-01', table: 'readWrite' },
  { method: 'GET', path: '/api/templates/{templateId}', handler: 'get-template', story: 'ADMIN-01', table: 'read' },
  { method: 'PUT', path: '/api/templates/{templateId}', handler: 'replace-template', story: 'ADMIN-01', table: 'readWrite' },
  { method: 'DELETE', path: '/api/templates/{templateId}', handler: 'delete-template', story: 'ADMIN-01', table: 'readWrite' },

  { method: 'GET', path: '/api/admin/users', handler: 'list-users', story: 'ADMIN-02', table: 'read' },
  { method: 'POST', path: '/api/admin/users', handler: 'add-user', story: 'ADMIN-02', table: 'readWrite', cognito: ['cognito-idp:AdminCreateUser'] },
  { method: 'PATCH', path: '/api/admin/users/{userId}', handler: 'set-system-admin', story: 'ADMIN-02', table: 'readWrite' },
  { method: 'DELETE', path: '/api/admin/users/{userId}', handler: 'remove-user', story: 'ADMIN-02', table: 'readWrite', cognito: ['cognito-idp:AdminDeleteUser'] },
  { method: 'GET', path: '/api/admin/users/{userId}/removal-impact', handler: 'get-user-removal-impact', story: 'ADMIN-02', table: 'read' },
  { method: 'GET', path: '/api/admin/lists', handler: 'list-all-lists', story: 'ADMIN-03', table: 'read' },
];
