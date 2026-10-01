# CLAUDE.md

This file gives Claude Code the context it needs to work effectively in this repository. It covers *how* to build Coplist. *What* to build — user stories, product decisions, and the working agreement for picking up a story — is in `user-stories.md`. Read it and follow it before starting any feature work.

## Project Overview

- **Name:** Coplist
- **One-line description:** Web application that allows a user to maintain multiple lists of items to purchase.
- **Target platforms:** Browser based running on iOS, macOS, Windows, Android
- **Primary web application framework:** React
- **Cloud provider:** AWS
- **Status:** New project; no code exists yet. The repository structure below is the target layout, not a description of existing files. Story SETUP-01 in `user-stories.md` scaffolds it. Until code exists, rules that say "follow the existing pattern" have nothing to follow: ask rather than invent a pattern that later code will copy.
- **DynamoDB design:** Not yet designed. Story SETUP-02 in `user-stories.md` designs it and lists the access patterns it must support (lists are shared between members with per-list roles; decision D2). Ask before creating the table, keys, or GSIs, and don't create them until the design is approved.

## Tech Stack

- **Language:** TypeScript
- **Frontend framework:** React
- **Build tool:** Vite
- **Routing:** React Router
- **Validation:** zod — schemas live in `packages/shared` and are the single source of the request/response types (`z.infer`); don't hand-write a type that duplicates a schema. Length limits in the stories count user-perceived characters (graphemes, via `Intl.Segmenter`), not UTF-16 code units, so an emoji counts as one: check text lengths with the shared helper in `@coplist/shared`, not zod's string `.min`/`.max`.
- **Testing:** Vitest + React Testing Library (unit), Playwright (E2E)
- **Runtime:** Node.js 24 for Lambda and locally (pinned in `.nvmrc`); Lambdas are bundled with CDK `NodejsFunction` (esbuild)
- **Authentication:** Amazon Cognito user pool (Essentials tier, which includes managed login). Email + password with email verification; anyone can sign up. The web app signs in through Cognito managed login (authorization code flow with PKCE) using `oidc-client-ts`, so it never handles passwords.
- **State management:** Zustand
- **Offline (OFF-01):** a service worker from `vite-plugin-pwa` (Workbox) for the app shell; IndexedDB through `idb-keyval` for the cached lists and the outbox of unsent changes, used as the Zustand `persist` storage
- **Styling:** Tailwind
- **Package manager:** NPM, using npm workspaces. The root `package.json` lists `apps/*`, `services/*`, `packages/*`, and `infra` as workspaces, and there is one `package-lock.json` at the root. Versions are whatever `package.json` and the lockfile say.
- **IaC:** AWS CDK v2 (TypeScript). The CDK app runs with `tsx` (a dev dependency of `infra`), not `ts-node`.
- **AWS Services:**
  - **Backend/API:** AWS Lambda
  - **Web Server:** Amazon S3
  - **Database:** Amazon DynamoDB
  - **API Gateway:** Amazon API Gateway HTTP API (v2) with its built-in JWT authorizer — not REST API (v1), and no Lambda authorizer. No WebSocket API: other people's changes arrive by polling (see Architecture, Live updates).
  - **Auth:** Amazon Cognito
  - **Email:** Amazon SES (v2 API, `@aws-sdk/client-sesv2`) for invite emails. Cognito sends its own account emails (verification codes, temporary passwords) with its built-in email, which is limited to about 50 emails a day per account. That's enough for dev, but with open sign-up it isn't for production: before launch, configure the user pool to send through the SES identity from `EmailStack`.
  - **CDN:** Amazon CloudFront
  - **TLS:** AWS Certificate Manager
  - **DNS:** Amazon Route 53
  - **Monitoring:** Amazon CloudWatch (logs, alarms), Amazon SNS (alarm emails), AWS Budgets
  - **DevOps:** AWS CodePipeline, AWS SSM Parameter Store (no Secrets Manager)

## Repository Structure

```
/package.json           - workspace root (workspaces list, root scripts); no app code
/apps
  /web                  - React web app (TypeScript, Tailwind, Zustand)
    /src
      /components       - shared/reusable UI components
      /pages            - route-level views
      /store            - Zustand stores
      /api              - API client(s) calling the Lambda/API Gateway backend
      /styles           - Tailwind config, global/theme styles
      /types            - web-app-local TypeScript types
    /public             - static assets
    /e2e                - Playwright E2E tests
/services
  /api                  - Lambda-backed API source (Node.js/TypeScript)
    /src
      /handlers         - one handler per Lambda function/route, plus the Cognito post-confirmation trigger
      /lib              - shared request/response, validation, error handling, auth (`getUserId`)
      /db               - DynamoDB access layer (repositories/queries)
      /models           - DynamoDB item/entity models and schemas
    /test               - unit tests for handlers and db layer
    /openapi            - openapi documentation for the api
/data
  /seed                 - initial DynamoDB seed data (JSON) + load script
  /migrations           - one-off/backfill scripts for DynamoDB data changes
/packages
  /shared               - `@coplist/shared`: types, constants, zod schemas, and utils shared by /apps/web and /services/api
/infra                  - AWS CDK app (infrastructure as code)
  /bin                  - CDK app entry point
  /lib                  - stack definitions (see "AWS Deployment (CDK)" → Stacks)
  /test                 - CDK snapshot/assertion tests
```

## Architecture

- **Frontend → API:** The web app calls the API at the relative path `/api/...` on its own domain. CloudFront has a `/api/*` behavior that forwards to the HTTP API origin (no caching, all methods, forwards the `Authorization` header); everything else goes to the S3 origin. One domain means no CORS configuration and no per-environment API URL in the frontend build. API routes are defined with the `/api` prefix so no path rewriting is needed. The API has its own custom domain (`api.<domainName>`, SETUP-04), which is CloudFront's `/api/*` origin; its default `execute-api` endpoint is disabled, so the API can't be reached except through its domain.
- **Domains (D7):** the app's domain is `coplists.com`, registered through Route 53 Domains (a manual step), which creates its public hosted zone. Each environment uses its own hostname from `context.environments.<env>.domainName` in `infra/cdk.json`; the site URL is `https://<domainName>`. dev is `dev.coplists.com` (site) and `api.dev.coplists.com` (HTTP API). Browsers only ever use `https://<domainName>`: the API domain is a CloudFront origin. `coplists.com` itself is kept for production.
- **Live updates (SYNC-01):** the web app polls; there is no server push (no WebSockets, no webhooks).
  - **Interval:** every 5 seconds (`POLL_INTERVAL_MS = 5000` in `@coplist/shared`), the app polls what's on screen: `GET /api/lists/{listId}` for an open list, `GET /api/lists` on the lists screen. It polls only while the page is visible and online, and polls at once when the page becomes visible again or the device comes back online (after sending the outbox).
  - **Cheap "no change" answers:** each list has a `revision` number, incremented in the same write as any change to the list, its items, or its groups. `GET /api/lists/{listId}` returns it as an `ETag`; the client sends `If-None-Match`, and the handler answers `304 Not Modified` after reading only the list record. The lists screen's response is small, so it's simply re-fetched. The CloudFront `/api/*` behavior must pass `If-None-Match` through to the API and `ETag` back; SYNC-01's E2E test checks it (without it polling still works, but every poll downloads the whole list).
  - **Access changes:** a poll for a list that was deleted, or that the user no longer has access to, gets 404 like any other request (NFR-05); the app then takes the user back to their lists with a "This list is no longer available" message.
  - **Client merge:** a poll response carries whole entities with their per-field timestamps (and tombstones); the client merges them field by field with the same rule as the server (below), keeping any of its own unsent changes on top, so its own changes aren't applied twice or undone.
  - **Load:** each open screen makes 12 requests a minute. The API throttle (`apiThrottle`) must allow for the number of people expected to have the app open at once: dev's 10 requests/second covers about 50 open screens.
- **Changes and conflicts (D3, D8):** the latest change wins, judged by when it was *made*, field by field. There are no 409 conflicts.
  - Every write request carries `changedAt`: when the change was made on the device, corrected by the offset between the device clock and the server's (the client learns the offset from the server time in each API response). The server clamps a `changedAt` later than its own clock to its own clock, so a device with a wrong clock can't win forever.
  - Lists, items, and groups store a timestamp per editable field (for an item: name, quantity, note, checked, active, group, position; for a list: name; for a group: name, position). The server applies each field of a change only if its `changedAt` is later than that field's stored timestamp, ignores the rest, and returns the resulting entity. It reads and writes with a condition on a version attribute and retries if the condition fails, so two requests for the same entity can't interleave.
  - Manual order (D4) is stored as a fractional-index string `position` on each item (ordered within its group) and each group (ordered within its list), generated with the `fractional-indexing` package in `@coplist/shared`. Moving or adding one entity writes only that entity's `position`, as a key between its new neighbours' keys (after the last one when added at the bottom), so concurrent and offline moves don't rewrite each other. Ties between equal keys are broken by ID.
  - `updatedAt` / `updatedBy` on an entity are the time and author of its latest applied field change (ITEM-10). Only these latest values are kept, with no history.
  - IDs of new lists, items, and groups are UUIDs generated by the client, so a create sent twice (a retry, or an outbox resend) creates one entity. Resending any change is harmless, because an equal `changedAt` never wins.
  - Removing is final: a removed item, group, or list leaves a tombstone record (expiring through TTL after 30 days), and later changes to it are dropped. ITEM-04's Undo is an explicit restore request, not a change to a tombstoned item.
  - Build this into every write from the first story (LIST-01), not only in OFF-01: changing the write contract later means reworking every handler.
- **Offline (OFF-01):** the app keeps working with no connection and syncs when it's back.
  - The service worker caches the app shell and `/config.json`, so the app opens offline. It never caches `/api` responses: data comes from IndexedDB.
  - All of the user's lists, with their items and groups, are cached in IndexedDB. Screens render from the cache and refresh from the API when online.
  - Every change is applied to the cache at once and appended to an outbox in IndexedDB. The outbox is sent in order whenever the app is online; an entry is removed only when the server accepts or rejects it. A rejection (no access, role, `PRIMARY_ADMIN_LOCKED`, validation, tombstoned entity) drops that change, restores the server's state locally, and tells the user what was lost.
  - Offline is detected from failed requests, including the 5-second polls, not from `navigator.onLine` alone.
  - Offline, the last signed-in user stays signed in on the device. Back online, the client refreshes the token; if the refresh token has expired, the user signs in again and the outbox is sent afterwards. The outbox belongs to one user ID and is never sent as anyone else. Signing out warns if there are unsent changes, then clears the cache and the outbox.
  - Actions that need the server's answer are online-only and disabled offline: deleting a list; sending, accepting, or rejecting invites; changing roles; removing members; leaving a list; templates; user management.
- **Email (D5, SHARE-01):** invite emails are sent through Amazon SES by a Lambda triggered by the table's DynamoDB stream, filtered to newly created invite records, so a slow or failed send never fails the invite request. The Lambda records the delivery status on the invite (`sent` or `failed`); a failure is retried by the stream's retry settings, then marked `failed` and alarmed. Emails contain the inviter's email, the list's name, and a link to `https://<domainName>/invites`, but no token or secret: an invite is matched to the invitee's verified Cognito email address. The sender is `context.environments.<env>.emailFromAddress` in `infra/cdk.json` (dev: `invites@dev.coplists.com`). The invite limit (20 per user in any 24 hours) is checked by the invite handler before the invite is created, returning 429 with code `INVITE_LIMIT_REACHED`.
  - New SES accounts are in the sandbox, where email reaches only verified addresses; production access is requested by hand before real users are invited, as a manual step in `README.md`.
- **Frontend runtime config:** the values the web app needs from AWS (Cognito user pool ID, app client ID, managed login domain) are served as `/config.json`, written to the S3 bucket by `WebStack` and fetched at startup, so the same build works in every environment. Never bake them into the build with `VITE_` variables.
- **Local dev:** Vite's dev-server proxy forwards `/api` and `/config.json` to the deployed dev site, whose URL comes from `VITE_API_PROXY_TARGET` in the untracked `apps/web/.env.local`. The dev Cognito app client allows `http://localhost:5173` as a callback URL, so local sign-in uses the dev user pool.
- **Authentication:** The HTTP API has a JWT authorizer (issuer: the Cognito user pool; audience: the web app client ID) on every route except `GET /api/health`, and every such route requires the `coplist/api` scope. API Gateway rejects a missing, expired, or invalid token with 401 before any Lambda runs. The scope is only a coarse "signed in to this app" gate: per-list roles can't be expressed as scopes, so they're checked by `authorizeList` (below). Every handler gets the caller's user ID from one function, `getUserId(event)` in `services/api/src/lib`, which returns the token's `sub` claim — never a user ID or email taken from the request body, path, or query. When someone signs up, a Cognito post-confirmation trigger creates their user record (`sub`, email) in DynamoDB. Cognito doesn't run that trigger for users created with `AdminCreateUser`, so the code that creates them (the ADMIN-02 handler and the E2E test-user script) creates their user record itself.
- **Authorization (NFR-05):** Lists are shared: each member of a list has a per-list role (list admin or list user), and system admins can act on every list (see Roles in `user-stories.md`). Every handler that reads or changes an existing list, its items, groups, members, or invites first calls one function in `services/api/src/lib`, `authorizeList(userId, listId, action)`, which looks up the caller's role on that list, whether they are its primary list admin, and whether they are a system admin, and checks the action against the Roles permission table (e.g. only the primary list admin or a system admin may delete a list). Don't check roles anywhere else. The system admin flag is stored with the user's record in DynamoDB (SETUP-02), not taken from the request. There are two exceptions, because the caller isn't a member yet: creating a list (LIST-01) needs only a signed-in user, and accepting or rejecting an invite (SHARE-02) is allowed only when the invite's email matches the caller's verified email on their user record. Handlers for templates and users (ADMIN stories) require a system admin. A caller with a valid token but no user record (removed by a system admin, ADMIN-02) gets 401 with code `UNAUTHORIZED`, so removal takes effect before the token expires. Outcomes:
  - Caller is neither a member of the list nor a system admin → 404 with the resource's not-found code (e.g. `LIST_NOT_FOUND`), exactly as for a list that doesn't exist, so the response doesn't reveal that it exists.
  - Caller is a member, but their role doesn't allow the action → 403 with code `FORBIDDEN`.
- **Error response shape:** Every non-2xx API response has the body `{ "error": { "code": "LIST_NOT_FOUND", "message": "List not found" } }`. `code` is an UPPER_SNAKE_CASE value from the `ErrorCode` union in `@coplist/shared`, which also defines the `ApiError` type; the web client branches on `code`, never on `message`. Validation failures return 400 with code `VALIDATION_ERROR`; an attempt to demote, remove, or leave as a list's primary list admin returns 400 with code `PRIMARY_ADMIN_LOCKED`; role failures return 403 with code `FORBIDDEN`; unexpected errors return 500 with code `INTERNAL_ERROR` and a generic message (details go to logs, not to the client). The exceptions are the 401 (bad or missing token) and 429 (throttled) responses that API Gateway returns itself before any Lambda runs: they have API Gateway's own body, so the web client handles them by status code (401 → sign in again, 429 → "try again shortly"). The client checks for an `error.code` first: a 429 from our own handler (`INVITE_LIMIT_REACHED`) has the normal error body.

## AWS Deployment (CDK)

- **CDK app entry point:** `infra/bin/app.ts`
- **Stacks:**
  - **DevOpsStack:** the CDK Pipeline. It deploys every other stack below as one Stage per environment; it is the only stack ever deployed by hand.
  - **No DnsStack:** the `coplists.com` hosted zone is created by the domain registration, not by CDK, and must never be created or deleted by CDK. Its zone ID is the SSM parameter `/coplist/dns/hosted-zone-id`, created by hand in both the profile's region and us-east-1 (an SSM parameter is read in the stack's own region). Stacks import the zone with `HostedZone.fromHostedZoneAttributes` (zone ID from that parameter, zone name `coplists.com` from `context.hostedZoneName`), never `fromLookup`, and each stack creates the records for its own resources: `CertStack` its validation records, `WebStack` the site's alias records, `ApiStack` the API's alias and validation records, `EmailStack` the DKIM records. A future environment in another account needs the zone delegated or shared — decide it then.
  - **CertStack:** ACM certificate for CloudFront — always deployed to **us-east-1** (CloudFront only accepts certificates from that region), regardless of the profile's region. The region comes from the `CLOUDFRONT_CERT_REGION = 'us-east-1'` constant in `infra/lib`; the account is the profile's. `WebStack` consumes it via `crossRegionReferences: true`; do not create the CloudFront certificate in `WebStack` or in the primary region.
  - **WebStack:** S3, CloudFront (including the `/api/*` behavior, which takes the HTTP API from `ApiStack` as a prop), and `/config.json` built from `AuthStack`'s outputs. CloudFront's minimum viewer TLS version is 1.2.
  - **ApiStack:** API Gateway + Lambda (kept together to avoid cross-stack coupling on every route change). Also owns:
    - the stream-triggered invite-email Lambda, granted `ses:SendEmail` only on the sender identity and `EmailStack`'s configuration set
    - the JWT authorizer, built from `AuthStack`'s user pool and client
    - throttling: a conservative stage-wide default rate and burst from `context.environments.<env>.apiThrottle`, with lower per-route limits where a route needs them
    - access logs to CloudWatch, and Lambda logs, both with one-week retention
    - CloudWatch alarms, sent to `MonitoringStack`'s SNS topic: API 5xx, API 4xx, Lambda errors, Lambda throttles, and invite emails marked `failed`. HTTP APIs have no separate throttling metric: their 429s count as 4xx.
    - the custom domain `api.<domainName>` (SETUP-04), with a regional ACM certificate in the API's own region (not from `CertStack`, which is only for CloudFront), TLS 1.2 minimum, and `disableExecuteApiEndpoint: true`
  - **AuthStack:** Cognito user pool (Essentials tier, `RemovalPolicy.RETAIN`, deletion protection), the web app client (authorization code + PKCE, no client secret), the `coplist/api` resource-server scope, the managed login domain (a Cognito prefix domain from `context.environments.<env>.authDomainPrefix`; prefixes are unique per region across all AWS accounts), and the post-confirmation trigger. The client's callback and sign-out URLs are built from `context.environments.<env>.domainName` (plus `http://localhost:5173` for dev), never from `WebStack`: `WebStack` and `ApiStack` both need the client ID, so reading the site's domain back from `WebStack` would create a dependency cycle. Managed login uses a Cognito prefix domain, not `auth.<domainName>`: a Cognito custom domain requires its parent domain's DNS record to exist first, and that record is created by `WebStack`, which deploys after `AuthStack`. Replacing the user pool deletes every account: stop and ask before any change that would replace it.
  - **EmailStack:** the SES domain identity for `<domainName>`, with its DKIM records in the hosted zone, and a configuration set that sends bounce and complaint events to CloudWatch, with an alarm on the bounce and complaint rates (SES pauses sending for accounts with high rates).
  - **MonitoringStack:** the SNS topic for alarms, with an email subscription, and an AWS Budgets monthly cost budget of `context.environments.<env>.monthlyBudgetUsd`, alerting at 80% of actual and 100% of forecast spend. The email address comes from the SSM parameter `/coplist/alerts/email` (created by hand), not from the repo. A budget covers the whole account: when a second environment shares the account, only one of them should create it.
  - **DataStack:** DynamoDB. The table uses `RemovalPolicy.RETAIN`, `deletionProtection: true`, point-in-time recovery, on-demand (`PAY_PER_REQUEST`) billing, a stream with new images (for invite emails), and a TTL attribute (for tombstones). Changing the table's partition/sort key, table name, or anything else that makes CloudFormation replace it deletes the data: stop and ask before making such a change.
- **CI/CD:** CDK Pipelines (`pipelines.CodePipeline`, self-mutating) in `DevOpsStack`. Source is the GitHub repo and branch in `infra/cdk.json` (`context.pipeline`), connected via an AWS CodeConnections connection that is created by hand in the console. The connection ARN contains the account ID and region, so it is stored in the SSM parameter `/coplist/pipeline/connection-arn` (also created by hand) and read with `StringParameter.valueForStringParameter`, never in `cdk.json`. **Pushing to `main` deploys to dev.** Changes to the app stacks reach AWS only through the pipeline. After the dev Stage deploys, the pipeline runs the Playwright E2E suite against it as a post step. The pipeline deploys to its own account and region; a future environment in another account needs a way to supply that account at synth time — decide it then, without committing the account ID.
- **Environments:** the account and region come from the AWS profile the command runs with (the CDK CLI exposes them as `CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION`); in the pipeline they are the pipeline's own account and region. They are never written into the repo.
  - **dev:** whichever AWS profile you name for dev
- **CDK context/config:** Non-secret, per-environment values that don't identify the account (domain name, etc.) live in `infra/cdk.json` under `context.environments.<env>`. `infra/bin/app.ts` reads the environment name from `--context env=<env>` and fails the synth if it's missing or unknown. It builds each stack's `env` from `CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION` and fails the synth if they're unset (env-agnostic stacks can't use `crossRegionReferences`); that is the only `process.env` read in `infra`. Stacks receive all values as typed props; they never call `tryGetContext` themselves or read `process.env`. No `.env` files in `infra`.
- **Bootstrap:** once per account, in both the profile's region **and** us-east-1 (for `CertStack`): `cdk bootstrap --profile <profile>`, then `cdk bootstrap aws://<account-id>/us-east-1 --profile <profile>`, with the account ID taken from `aws sts get-caller-identity --profile <profile>` when you run it — never written down. Bootstrapping is a one-time manual step; don't run it unless asked.
- **Secrets/config management:** Everything goes in **SSM Parameter Store**, standard tier (free): secrets (API keys, tokens, test-user passwords) as `SecureString` parameters, non-secret shared config as `String` parameters. Don't use Secrets Manager. CDK refers to a parameter by name (`StringParameter.valueForStringParameter`, `StringParameter.fromSecureStringParameterAttributes`) and grants the Lambda read (and decrypt) access to that one parameter. Lambdas receive a secret parameter's *name* as an environment variable and read the value at runtime; never put a secret value in `cdk.json`, an environment variable, or synthesized template output. CloudFormation can't create `SecureString` parameters, so secrets are created by hand or by a script.

## Build & Run Commands

Run from the repo root unless noted. The root `package.json` defines `lint`, `typecheck`, and `test` scripts that run the same-named script in every workspace (`npm run <script> --workspaces --if-present`); each workspace defines its own.

- **AWS access:** every command that touches AWS (`cdk synth`/`diff`/`deploy`/`bootstrap`, seed and migration scripts, `aws ...`) runs with a named AWS profile: `--profile <profile>` or `AWS_PROFILE=<profile>`. The profile name is not in the repo — ask which one to use, and never fall back to the default profile.
- **Install:** `npm install` (run once from the repo root; never run `npm install` inside a workspace, which creates a second lockfile). Add a dependency to one workspace with `npm install <pkg> -w apps/web`.
- **Dev server (web):** `npm run dev -w apps/web`
- **Build (web):** `npm run build -w apps/web`
- **Lint:** `npm run lint` (all workspaces) or `npm run lint -w <workspace>`
- **Type check:** `npm run typecheck` (all workspaces; each runs `tsc --noEmit`) or `npm run typecheck -w <workspace>`
- **Unit tests:** `npm test` (all workspaces) or `npm test -w <workspace>`
- **E2E tests:** `npm run test:e2e -w apps/web`. Targets `E2E_BASE_URL` if set (e.g. the deployed dev URL, kept in the untracked `apps/web/.env.local`), otherwise starts the Vite dev server, which proxies `/api` and `/config.json` to the deployed dev site (see Local dev).
- **Seed / migrations:** no scripts exist yet. When the first one is written, add its command here; seed and migration scripts take the environment as an explicit argument and never default to one.
- **CDK synth:** `cdk synth --context env=dev --profile <profile>` (run from `infra/`)
- **CDK diff:** `cdk diff '**' --context env=dev --profile <profile>` (run from `infra/`; the `'**'` includes the stacks inside the pipeline's Stage, not just `DevOpsStack`)
- **CDK deploy:** `cdk deploy DevOpsStack --context env=dev --profile <profile>` (run from `infra/`), for the first pipeline setup only. After that the pipeline updates itself and deploys everything else on push to `main`. Never `cdk deploy --all` or deploy an app stack directly: that bypasses the pipeline and drifts from it.

## Coding Conventions

- **Naming:**
  - Files that export a component or hook are named after it: `ListCard.tsx`, `useListStore.ts`.
  - All other files are kebab-case: `format-quantity.ts`, `create-list.ts` (handlers are named after their route's action).
  - camelCase for functions and variables (`formatQuantity`), PascalCase for types, UPPER_SNAKE_CASE for constants and error codes.
- **Components:** Functional components with hooks only — no class components. One component per file; colocate a component's own sub-components only if they're not reused elsewhere.
- **State:** Zustand stores are split by domain (`useListStore`, `useAuthStore`, not one giant store). Components select the narrowest slice they need (`useListStore(s => s.items)`) rather than destructuring the whole store, to avoid unnecessary re-renders.
- **Shared types:** Types, constants, and zod schemas used by both `apps/web` and `services/api` live in `packages/shared` — never redefine or duplicate them locally. Import them by package name (`import { List } from '@coplist/shared'`), declared as a `"@coplist/shared": "*"` dependency in the consuming workspace; never import by relative path across workspaces (`../../packages/shared`).
- **Styling:** Tailwind utility classes in JSX; avoid ad-hoc inline `style=`.
- **Error handling:** Lambda handlers never let exceptions escape unhandled — catch at the handler boundary and return the error shape defined under Architecture. Validate/parse all external input (request bodies, path/query params) with the zod schemas from `@coplist/shared` before it reaches business logic; never assume the frontend already validated it.
- **Comments:** Minimal by default. Only comment the *why* (a non-obvious constraint, a workaround, a tricky invariant) — not what the code already says.

## Testing Requirements

- **Unit tests:** `services/api` and `infra` keep tests in the workspace's `/test` directory, mirroring `src`/`lib` paths. `apps/web` and `packages/shared` colocate tests next to the source (`ListCard.test.tsx`). One test file per handler/module for `services/api`, per component/store for `apps/web`. Name tests with the story ID they cover (e.g. `LIST-01`).
- **E2E tests (Playwright):** in `apps/web/e2e`. Cover the core list/item flows (create/rename/delete a list; add/edit/check/remove an item; activate/inactivate an item; show/hide inactive items; clear checked items; reorder items; invite a second test user, who accepts and then sees the list; a user who isn't a member can't open the list; a change made in one browser appears in a second browser showing the same list; changes made offline, using Playwright's `setOffline`, sync when back online; and an older offline change loses to a newer online change to the same field) through the real API — a deployed environment or the local dev server proxying to the deployed dev site — never against mocked API responses. Run at a 360 px wide mobile viewport (NFR-01) as well as desktop. E2E tests sign in through managed login as dedicated test users (at least two, for sharing and access-check flows), created by a script. Their credentials are `SecureString` parameters under `/coplist/<env>/e2e/` for the pipeline, and in the untracked `apps/web/.env.local` locally. Each test creates its own lists and deletes them afterwards. Test users' email addresses are SES mailbox simulator addresses (e.g. `success+user1@simulator.amazonses.com`), set as verified by the creation script, so invite tests send real SES email even in the sandbox without reaching a real inbox.
- **DB layer:** `services/api` DynamoDB access-layer functions get unit tests against a local DynamoDB (e.g. `dynamodb-local`) or a thin in-memory fake — never assert against a real AWS table.
- **CDK:** stack changes get a snapshot/assertion test in `infra/test` so unintended resource changes (e.g. accidental replacement of a stateful resource like the DynamoDB table) surface in review. Tests build stacks with an obviously fake env (`{ account: '000000000000', region: 'test-region-1' }`), never the profile's, so committed snapshots can't capture a real account or region.
- **API contract:** a change touching the API contract has at least one updated/added test covering the new behavior.

## Things Claude Should Always Do

- Run type check, lint, and the unit test suite before considering a task complete, and report their results rather than assuming success.
- Follow least-privilege IAM in CDK constructs — grant a Lambda only the specific DynamoDB actions/resources it needs, not wildcard access.
- Keep DynamoDB access patterns (partition/sort key design, GSIs) consistent with how they're already modeled in `services/api/src/models` and `services/api/src/db` — check existing access patterns before adding a new one.
- Flag when a change affects a deployed AWS resource (schema change, stack rename, resource replacement) even if not asked to deploy it.

## Things Claude Should Never Do

- Never commit AWS credentials, `.env` files, or other secrets.
- Never run `cdk deploy`, `cdk destroy`, or `cdk bootstrap` against any environment, dev included, without explicit confirmation. Pushing to `main` deploys to dev, so treat a push as a deploy.
- Never hand-edit generated CloudFormation output (`cdk.out/`) — change the CDK source instead.
- Never use `fromLookup` constructs: they need the account at synth time and cache it in `cdk.context.json`, which is gitignored.
- Never introduce a second state-management or styling library (CSS modules, styled-components, etc.) alongside Zustand/Tailwind without discussion.
- Never have the frontend call DynamoDB directly — all data access goes through the API layer (API Gateway + Lambda).
- Never add an API route without the JWT authorizer and the `coplist/api` scope, or remove them from one. The only public route is `GET /api/health`.
- Never write an AWS account ID, an account-specific ARN, or a region name into any tracked file (code, `cdk.json`, docs, tests, snapshots) — take them from the AWS profile at run time. The only exception is the us-east-1 constant for CloudFront certificates.
- Never widen an IAM policy to a wildcard resource/action to unblock a permissions error — fix the specific grant instead.
