import type { DynamoDBStreamHandler } from 'aws-lambda';

// SHARE-01 replaces this with sending the invite through SES and recording the delivery
// status. When it gives up on an invite it logs INVITE_EMAIL_FAILED, which ApiStack alarms on.
export const handler: DynamoDBStreamHandler = async () => {};
