# DynamoDB design

One table (`DataStack`), approved before creation (SETUP-02). Changing `PK`/`SK`, a GSI's keys, or the table's logical ID replaces the table and deletes its data: stop and ask first.

## Table

| Setting | Value |
|---|---|
| Keys | `PK` (S), `SK` (S) |
| GSI1 (lookups) | `GSI1PK` (S), `GSI1SK` (S), projection ALL |
| GSI2 (collections) | `GSI2PK` (S), `GSI2SK` (S), projection ALL |
| Billing | on-demand |
| Protection | deletion protection, point-in-time recovery, `RETAIN` |
| Stream | `NEW_IMAGE` (read by the invite-email Lambda, filtered to new `INVITE#` records) |
| TTL | `expiresAt` (epoch seconds) |

Emails in keys are lower-cased. Timestamps in sort keys are ISO 8601 UTC with milliseconds, so they sort as strings.

## Entities

| Entity | PK | SK | GSI1PK / GSI1SK | GSI2PK / GSI2SK | Notes |
|---|---|---|---|---|---|
| User | `USER#<sub>` | `PROFILE` | `EMAIL#<email>` / `USER` | `USERS` / `<email>` | email, `isSystemAdmin` |
| Invite sent | `USER#<sub>` | `INVITESENT#<ts>#<inviteId>` | | | TTL 24 h; the invite limit counts these, so canceling an invite doesn't free a slot |
| List | `LIST#<id>` | `META` | | `LISTS` / `<createdAt>#<id>` | name, `primaryAdminId`, `revision`, `activeUncheckedCount`, per-field timestamps, `version`, `updatedAt`, `updatedBy` |
| Member | `LIST#<id>` | `MEMBER#<sub>` | `USER#<sub>` / `LIST#<id>` | | role, `isPrimaryAdmin` |
| Group | `LIST#<id>` | `GROUP#<id>` | | | name, `position`, per-field timestamps, `version` |
| Group name lock | `LIST#<id>` | `GROUPNAME#<lower name>` | | | written in the same transaction as the group; enforces unique names |
| Item | `LIST#<id>` | `ITEM#<id>` | | | name, quantity, note, `groupId`, active, checked, `position`, per-field timestamps, `version` |
| Tombstone | `LIST#<id>` | `TOMB#<item\|group>#<id>` | | | TTL 30 days |
| Invite | `LIST#<id>` | `INVITE#<id>` | `INVITEE#<email>` / `INVITE#<createdAt>#<id>` | | email, `invitedBy`, `deliveryStatus` |
| Template | `TEMPLATE#<id>` | `META` | | `TEMPLATES` / `<lower name>` | groups and items stored inline |
| Template name lock | `TEMPLATENAME#<lower name>` | `LOCK` | | | enforces unique template names |

## Access patterns

| Pattern | Query | Story |
|---|---|---|
| A list with its groups, items, and tombstones (the 5-second poll) | Query `PK = LIST#<id>` | SYNC-01 |
| "No change" poll answer | GetItem `LIST#<id>` / `META`, compare `revision` with `If-None-Match` | SYNC-01 |
| Lists I'm a member of, with name, count, last-updated | Query GSI1 `USER#<sub>`, then BatchGetItem each `LIST#<id>` / `META`; sort by `updatedAt` in the handler | LIST-02 |
| My role on a list | GetItem `LIST#<id>` / `MEMBER#<sub>` | NFR-05 |
| Whether I'm a system admin | GetItem `USER#<sub>` / `PROFILE` | NFR-05 |
| A list's members | Query `PK = LIST#<id>`, `SK begins_with MEMBER#` | SHARE-03 |
| Lists a user is primary list admin of | Query GSI1 `USER#<sub>`, filter `isPrimaryAdmin` | ADMIN-02 (D6) |
| A user by email | Query GSI1 `EMAIL#<email>` | SHARE-01, ADMIN-02 |
| Pending invites for an email | Query GSI1 `INVITEE#<email>` | SHARE-02 |
| A list's pending invites, with delivery status | Query `PK = LIST#<id>`, `SK begins_with INVITE#` | SHARE-01 |
| Invites a user sent in the last 24 hours | Query `PK = USER#<sub>`, `SK > INVITESENT#<now - 24h>` | SHARE-01 |
| All users (paginated) | Query GSI2 `USERS` | ADMIN-02 |
| All lists (paginated) | Query GSI2 `LISTS` | ADMIN-03 |
| All templates, by name | Query GSI2 `TEMPLATES` | ADMIN-01, GROUP-02 |
| One template | GetItem `TEMPLATE#<id>` / `META` | ADMIN-01 |

No access pattern uses a Scan.

## Writes

- Every change to a list, item, or group is a transaction that also updates the list's `META`: `revision + 1`, `updatedAt`, and `activeUncheckedCount` when it changes. The entity write is conditioned on its `version` and retried if the condition fails (CLAUDE.md, Changes and conflicts).
- Removing an item or group writes its tombstone in the same transaction.
