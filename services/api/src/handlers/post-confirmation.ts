import type { PostConfirmationTriggerHandler } from 'aws-lambda';

// AUTH-01 replaces this with creating the user record. It must return the event: throwing
// here would fail the user's sign-up.
export const handler: PostConfirmationTriggerHandler = async (event) => event;
