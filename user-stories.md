# Coplist — User Stories

What to build. CLAUDE.md covers *how* to build it.

## Working agreement (for Claude Code)

- Build only stories marked **Ready**. **Draft** stories are context, not work. Ask before implementing one.
- Work on one story at a time. Put its ID (e.g. `LIST-01`) in the branch name, commit messages, and test descriptions.
- A story is done when every acceptance criterion is covered by a test and lint, type check, and tests all pass. Then set its status to **Done**.
- Don't rewrite acceptance criteria. If one is ambiguous, conflicts with CLAUDE.md, or looks wrong, stop and ask.
- Never settle an open question yourself. If a story raises one, add it under **Decisions** as open and ask.
- A criterion that depends on a story not built yet (e.g. SYNC-01's "removed from the list" needs SHARE-04) is tested as part of that later story. The earlier story can be marked **Done** without it, and the later story isn't **Done** until it's covered.
- Build SETUP-01, SETUP-02, SETUP-03, SETUP-04, and AUTH-01, in that order, before any other story. Every other story needs the scaffold and the data model, no list data is stored until the API is protected by throttling and sign-in, and sign-in and email are set up once, on the final domain.

Status: Draft → Ready → In Progress → Done
Priority: MVP · Later

Character limits in acceptance criteria (e.g. "1–50 characters") count characters as a person sees them: an emoji or an accented letter counts as one.

## Decisions

- **D1 Authentication.** **Decided:** Amazon Cognito user pool with managed login (authorization code + PKCE), email + password with email verification. Anyone can sign up. The HTTP API's built-in JWT authorizer checks every route except `GET /api/health`. Details in CLAUDE.md (Authentication).
- **D2 Shared lists.** **Decided:** a list can belong to more than one person. Each member of a list has a per-list role (list admin or list user); system admins can act on every list. See [Roles](#roles). SETUP-02 designs the DynamoDB model for this.
- **D3 Offline use.** **Decided:** the app keeps working offline, with a simple indicator, and syncs when back online (OFF-01). The latest change wins, judged by when it was made, field by field. Details in CLAUDE.md (Changes and conflicts, Offline).
- **D4 Item order.** **Decided:** users order groups and items by hand (GROUP-05, ITEM-11). A new group goes to the bottom of the list's groups (GROUP-01); a new item goes to the bottom of the group it's added to, or of the list's items when it has no group (ITEM-01).
- **D5 Invite delivery.** **Decided:** the app emails each invite through Amazon SES (SHARE-01). Details in CLAUDE.md (Email).
- **D6 Removing a user.** **Decided:** whoever creates a list is its primary list admin, the only one it has, and that never changes. When a system admin removes a user, every list they're primary list admin of is deleted with it (ADMIN-02). See [Roles](#roles).
- **D7 Domain name.** **Decided:** `coplists.com`, registered through Route 53 Domains. dev uses `dev.coplists.com`; `coplists.com` is kept for production. Details in CLAUDE.md (Domains).
- **D8 Seeing each other's changes.** **Decided:** the app polls the server every 5 seconds for changes to what's on screen, so everyone sees each other's changes within about 5 seconds (SYNC-01). No WebSockets. When two people change the same field of the same thing, the change made latest wins (D3). Each list, item, and group records only who changed it last and when, with no history (ITEM-10). Details in CLAUDE.md (Live updates, Changes and conflicts).

## Roles

Every signed-in person is a **user**. Any user can create a list. A user's role is per list: the same person can be list admin of one list and list user of another. System admin is a role across the whole system.

- **List user**: invited to a list by a list admin or system admin, and accepted the invite. Sees every list they're a member of; adds, edits, removes, checks off, activates, and inactivates items on it.
- **List admin**: everything a list user can do, plus manages the list itself: rename, groups, invites, promoting list users to list admin, and demoting list admins to list user.
- **Primary list admin**: the user who created a list. Each list has exactly one, and it never changes: nobody, including a system admin, can demote them or remove them from that list, and they can't leave it. Only they (or a system admin) can delete the list. If a system admin removes them as a user (ADMIN-02), every list they're primary list admin of is deleted too. Other list admins can be demoted or removed.
- **System admin**: everything a list admin can do, on every list. Also manages list templates and users.

| Action | List user | List admin | System admin |
|---|---|---|---|
| See the list and its items | ✓ | ✓ | ✓ (all lists) |
| Add, edit, remove, check off items | ✓ | ✓ | ✓ |
| Activate / inactivate items | ✓ | ✓ | ✓ |
| Leave the list (never the primary list admin) | ✓ | ✓ | ✓ |
| Rename the list; manage its groups | | ✓ | ✓ |
| Delete the list | | Primary list admin only | ✓ |
| Invite users; promote or demote members; remove members (never the primary list admin) | | ✓ | ✓ |
| Manage list templates | | | ✓ |
| Manage users and system admin rights | | | ✓ |

## Non-functional requirements

- **NFR-01 Mobile first.** Every screen works one-handed at 360 px wide. Larger layouts are an enhancement.
- **NFR-02 Quick to use.** Touch targets are at least 44×44 px. Checking off an item is a single tap.
- **NFR-03 Immediate feedback.** Changes show at once (optimistic update). If the server rejects a change, whether at once or later when an offline change syncs, the change is rolled back and a message says what happened. A change that can't be sent because the device is offline is kept and sent later (OFF-01), not rolled back.
- **NFR-04 Accessible.** Keyboard navigable, semantic HTML, a visible label on every input.
- **NFR-05 Private.** A user can read or change a list only if they are a member of it (list user or list admin) or a system admin, and only in the ways their role allows (see [Roles](#roles)). The API enforces this; hiding things in the UI is not enough. A request without a valid sign-in gets 401. A request for a list the user has no access to returns 404, so it doesn't reveal that the list exists. A member attempting an action their role doesn't allow gets 403.

---

## Epic: Setup

### SETUP-01 Scaffold the project and pipeline
**Status:** Ready · **Priority:** MVP
As the developer, I want the repository, infrastructure, and pipeline in place so that every later story only adds features.
- The repository matches the layout in CLAUDE.md: root `package.json` with npm workspaces, `apps/web`, `services/api`, `packages/shared`, `infra`, one `package-lock.json`, and `.nvmrc` pinning Node.js 24.
- From the repo root, `npm run lint`, `npm run typecheck`, and `npm test` run in every workspace and pass; each workspace has at least one test.
- The API has one route, `GET /api/health`, returning 200 with `{ "status": "ok" }`. The web app shows a placeholder page.
- `cdk synth --context env=dev` succeeds, and fails with a clear message when `env` is missing or unknown or when `CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION` are unset.
- `DevOpsStack` holds the pipeline; its dev Stage deploys `WebStack` and `ApiStack`. `DataStack` comes in SETUP-02, `MonitoringStack` in SETUP-03, `AuthStack` in AUTH-01, `EmailStack` in SHARE-01, `CertStack` in SETUP-04. There is no `DnsStack` (CLAUDE.md, Domains).
- `infra/test` has snapshot tests for every stack, built with the fake env from CLAUDE.md.
- The one-time manual steps (bootstrap in both regions, the CodeConnections connection, the `/coplist/pipeline/connection-arn` parameter, first `cdk deploy DevOpsStack`) are written in `README.md` without account IDs, ARNs, or region names.
- After those steps, pushing to `main` deploys dev: the CloudFront URL serves the placeholder page and `/api/health`, and the pipeline's E2E post step runs a smoke test of both at 360 px and desktop widths.

### SETUP-02 Design the data model
**Status:** Ready · **Priority:** MVP
As the developer, I want the DynamoDB design agreed before any data is stored so that we never have to replace the table and lose data.
- The design (table keys, GSIs, and each entity's item shape) is written up in `services/api/src/models/README.md`, with the query used for each access pattern below. No access pattern uses a Scan, except listing all lists or all users for system admins (paginated).
- Access patterns:
  - a list with all its items and groups
  - all lists a user is a member of, with each list's name, number of active unchecked items, and last-updated time, sorted by last-updated time (LIST-02)
  - a user's role on a list, and whether a user is a system admin (NFR-05)
  - a user by email address (SHARE-01, SHARE-02, ADMIN-02)
  - all members of a list with their roles, and which member is the primary list admin (SHARE-03)
  - all lists a user is primary list admin of (D6)
  - pending invites for an email address, and for a list, with each invite's email delivery status (SHARE-01, SHARE-02)
  - the number of invites a user sent in the last 24 hours (SHARE-01)
  - all users, and all lists (ADMIN-02, ADMIN-03)
  - all templates, and one template with its groups and items (ADMIN-01, GROUP-02)
- Lists, items, and groups have client-generated UUIDs, a timestamp per editable field, a fractional-index `position` (items and groups, D4), a version attribute, and `updatedAt` / `updatedBy` (a user ID) for the latest applied change (ITEM-10, CLAUDE.md Changes and conflicts).
- Removed lists, items, and groups leave tombstone records that expire after 30 days through the table's TTL attribute.
- The table has a stream with new images, read by the invite-email Lambda (SHARE-01).
- Each list has a `revision` number, incremented in the same write as any change to the list, its items, or its groups, so a poll can answer "no change" by reading only the list record (SYNC-01).
- A list's number of active unchecked items is stored on the list and changed in the same write (transaction) as the item change, so LIST-02 doesn't read every item.
- A list's last-updated time follows LIST-02's definition.
- A user record is keyed by the Cognito `sub` and holds the email address and the system admin flag.
- The product owner approves the design before `DataStack` creates the table. Then `DataStack` adds the table as specified in CLAUDE.md, with a snapshot test, and `ApiStack` grants the Lambda only the actions it needs on it.

### SETUP-03 Protect and monitor the API
**Status:** Ready · **Priority:** MVP
As the product owner, I want the API throttled and watched, and a cost alert on the account, so that abuse or a bug can't quietly run up the bill.
- The API stage has a default throttle from `context.environments.<env>.apiThrottle` in `infra/cdk.json` (dev: 10 requests/second, burst 20). Requests over the limit get 429.
- API access logs go to CloudWatch Logs with one-week retention; Lambda logs also have one-week retention.
- `MonitoringStack` creates an SNS topic that emails the address in the SSM parameter `/coplist/alerts/email`, and a monthly AWS Budgets cost budget of `monthlyBudgetUsd` (dev: $10) that emails at 80% of actual and 100% of forecast spend.
- CloudWatch alarms notify the SNS topic when, over 5 minutes: the API returns any 5xx, the API returns 50 or more 4xx (this includes 429s), any Lambda invocation errors, or any Lambda invocation is throttled.
- Creating `/coplist/alerts/email` and confirming the SNS subscription email are added to the manual steps in `README.md`.
- `infra/test` has assertion tests for the throttle settings, log retention, alarms, and budget.

### SETUP-04 Custom domains
**Status:** Ready · **Priority:** MVP
As the product owner, I want the app on its own domain, with the API reachable only at its own domain, so that the app has one public address and the default AWS endpoint can't be used.
- The one-time manual steps in `README.md` cover registering `coplists.com` with Route 53 Domains and creating the `/coplist/dns/hosted-zone-id` parameter in both the profile's region and us-east-1. CDK never creates or deletes the hosted zone.
- `CertStack` issues the certificate for `dev.coplists.com` in us-east-1 (CLAUDE.md). CloudFront serves the site at `https://dev.coplists.com`, with TLS 1.2 minimum, and `WebStack` creates the site's DNS alias records.
- The HTTP API is served at `api.dev.coplists.com`, with a regional ACM certificate and TLS 1.2 minimum. Its default `execute-api` endpoint is disabled, and CloudFront's `/api/*` origin is this custom domain.
- The site's URLs everywhere come from `domainName` in `infra/cdk.json` (CLAUDE.md, Domains).
- `infra/test` has assertion tests showing the hosted zone is imported, not created, and the API's default endpoint is disabled.
- The E2E suite passes against `https://dev.coplists.com`, and a direct request to the `execute-api` URL fails.

## Epic: Lists

### LIST-01 Create a list
**Status:** Ready · **Priority:** MVP
As a user, I want to create a named list so that I can keep separate lists for different stores or trips.
- When I enter a name of 1–50 characters (after trimming) and save, the list is created and opens.
- An empty or whitespace-only name is rejected with a message, and nothing is saved.
- Two lists may have the same name.
- I am the list's primary list admin. That can't be changed (see [Roles](#roles)).

### LIST-02 See all my lists
**Status:** Ready · **Priority:** MVP
As a list user, I want to see all my lists so that I can pick the one I need.
- I see every list I'm a member of (list user or list admin), including lists shared with me.
- Lists are shown most recently updated first. A list counts as updated when it is renamed or when any of its items or groups is added, changed, or removed, by any member.
- Each list shows its name and its number of active, unchecked items.
- With no lists, I see an empty state with a button to create one.

### LIST-03 Rename a list
**Status:** Ready · **Priority:** MVP
As a list admin, I want to rename a list so that its name stays meaningful.
- The name rules from LIST-01 apply.
- The new name shows everywhere the list appears, for every member, including after reload.
- A list user can't rename the list: the UI offers no rename, and the API rejects it (NFR-05).

### LIST-04 Delete a list
**Status:** Ready · **Priority:** MVP
As the primary list admin, I want to delete a list I no longer need so that my lists stay tidy.
- I must confirm before the list is deleted. Deleting needs a connection: it's disabled while offline (OFF-01).
- Deleting a list deletes all of its items, groups, memberships, and pending invites.
- The list no longer appears anywhere, for any member, including after reload.
- Only the list's primary list admin or a system admin can delete it. Other list admins and list users see no delete, and the API rejects it with 403 `FORBIDDEN` (NFR-05).

## Epic: Items

Every item is **active** or **inactive**. Active items are the ones that need to be bought: they make up the shopping list. Inactive items are known items that aren't needed right now, kept so they can be activated again without retyping. Inactive items are hidden by default.

An active item can also be **checked** (it's in the cart). Clearing checked items (ITEM-05) makes them inactive, ready for next time. Removing an item (ITEM-04) deletes it for good.

All stories in this epic are available to list users, list admins, and system admins.

**Item row.** Tapping an item's row checks or unchecks it (ITEM-02); that's the row's only tap action. Every other action is in the item's "⋯" menu, a button at the end of the row that meets NFR-02's 44×44 px target and works from the keyboard (NFR-04): Move up, Move down (ITEM-11), Inactivate or Activate (ITEM-08), Edit (ITEM-03), Remove (ITEM-04), and Details (ITEM-10). Actions that don't apply are left out (e.g. no Move up for the first item in its group).

### ITEM-01 Add an item
**Status:** Ready · **Priority:** MVP
As a list user, I want to add items quickly so that I can build a list in a few seconds.
- I type a name and press Enter or tap Add. The input clears and keeps focus for the next item.
- Name is 1–100 characters after trimming. Quantity (free text, e.g. "2", "1 lb") and note are optional.
- A new item is active and unchecked.
- The new item appears at the bottom of the unchecked items: of its group's, when it's added to a group (GROUP-03), otherwise of the ungrouped items.

### ITEM-02 Check off an item
**Status:** Ready · **Priority:** MVP
As a list user, I want to check off items as they go in my cart so that I can see what's left.
- Tapping an active item's row (anywhere except its "⋯" menu button) toggles it between checked and unchecked. Tapping an inactive item's row does nothing; it's activated from the menu (ITEM-08).
- Checked items move to a Checked section below the unchecked items and are visually de-emphasized.
- Checked state persists across reloads and devices, and every member of the list sees it.
- Only active items can be checked. Inactive items are never checked.

### ITEM-03 Edit an item
**Status:** Ready · **Priority:** MVP
As a list user, I want to change an item's name, quantity, or note so that I can fix mistakes.
- I open the editor with Edit in the item's "⋯" menu.
- The validation rules from ITEM-01 apply.
- Canceling an edit leaves the item unchanged.
- Editing an item doesn't change whether it's active, inactive, or checked.

### ITEM-04 Remove an item
**Status:** Ready · **Priority:** MVP
As a list user, I want to remove an item I don't need so that the list stays accurate.
- Removing an item takes one action, Remove in its "⋯" menu, with no confirmation, and shows an Undo option for 5 seconds.
- After Undo, the item is back in its original position with its original details, including whether it was active, inactive, or checked.
- Removing deletes the item for good; it doesn't become inactive. Active and inactive items can both be removed.

### ITEM-05 Clear checked items
**Status:** Ready · **Priority:** MVP
As a list user, I want to clear everything I bought so that the list is ready for next time.
- One action makes all checked items inactive and unchecked, after confirmation. They keep their details and group.
- Cleared items disappear from the default view and appear with the other inactive items (ITEM-09).
- Unchecked active items are not affected.

### ITEM-08 Activate or inactivate an item
**Status:** Ready · **Priority:** MVP
As a list user, I want to switch an item between active and inactive so that the shopping list holds only what we need now.
- An inactive item can be made active with Activate in its "⋯" menu. It becomes active and unchecked and appears with the unchecked items.
- An active item (checked or unchecked) can be made inactive with Inactivate in its "⋯" menu, without checking and clearing it. It becomes unchecked and disappears from the default view.
- The change persists across reloads and devices, and every member of the list sees it.
- The item keeps its name, quantity, note, and group.

### ITEM-09 Show inactive items
**Status:** Ready · **Priority:** MVP
As a list user, I want inactive items hidden unless I ask for them so that the list shows only what I need to buy, but known items are easy to bring back.
- When I open a list, inactive items are hidden.
- A control shows or hides the inactive items. When shown, they appear in an Inactive section below the Checked section, visually distinct from active items.
- Activating an item from the Inactive section (ITEM-08) moves it to the unchecked items.
- A list with no inactive items shows no Inactive control or section.

### ITEM-10 See who last changed an item
**Status:** Ready · **Priority:** MVP
As a list user, I want to see who last changed an item and when so that I can check with them if something looks wrong.
- Every change to an item records who made it and when: adding, editing, checking or unchecking, activating or inactivating, moving it to another group or another position (ITEM-11), clearing it (ITEM-05), and restoring it with Undo (ITEM-04). Only the latest change is kept; there is no history.
- This information is hidden in the list. I see it only when I choose Details in the item's "⋯" menu, as "Last changed by <email> on <date and time>", in my local time zone.
- If the person who made the last change has been removed as a user (ADMIN-02), it says "Last changed by a removed user".
- Every member of the list sees the same information, and it updates within about 5 seconds (SYNC-01).

### ITEM-11 Reorder items
**Status:** Ready · **Priority:** MVP
As a list user, I want to put items in the order I pick them up so that I can work down the list without jumping around.
- I can move an item up or down one place at a time within its group (or within the ungrouped items) with Move up and Move down in its "⋯" menu. The menu stays open after a move, so I can move an item several places without reopening it.
- An item keeps its position when it's checked, unchecked, made inactive, or made active again: unchecking or activating puts it back where it was. The Checked and Inactive sections show items in the same manual order.
- The new order shows at once and persists across reloads and devices, for every member, and works offline (OFF-01).
- Moving an item changes only that item's position. When two people move items at nearly the same time, both moves apply; if they move the same item, the move made latest wins (D3).

## Epic: Sync and offline

### SYNC-01 See other people's changes
**Status:** Ready · **Priority:** MVP
As a list user, I want changes made by others, or by me on another device, to show up on my screen without reloading so that we don't buy the same thing twice.
- While I have a list open, the app checks the server every 5 seconds, and any change to the list by anyone (items, groups, the list's name) appears on my screen, without reloading. This is what other stories mean by "every member sees it".
- On my lists screen, the lists, their names, and their item counts are refreshed the same way.
- The app checks only while it's on screen and online. When I come back to it (switching tabs or apps, waking the phone) or the device comes back online, it sends my unsent changes and checks at once.
- When two people change the same field of the same thing, the change made latest wins, and every open screen ends up showing it. Changes to different fields both survive (e.g. one checks off Milk while another changes its quantity).
- My own changes still show at once (NFR-03), aren't applied twice, and aren't undone by a check that happens before the server has them.
- If the list I have open is deleted, or I'm removed from it or leave it on another device, the next check takes me back to my lists with a "This list is no longer available" message.
- Checking uses the same API and access rules as everything else (NFR-05): only members and system admins get a list's changes.
- The E2E suite covers a change made in one browser appearing in a second browser that has the same list open, and a poll with no changes getting `304 Not Modified` through CloudFront.

### OFF-01 Keep using the app offline
**Status:** Ready · **Priority:** MVP
As a list user, I want to keep using my lists when I have no signal in the store so that a dead zone doesn't stop me.
- When the device is offline, the app shows a simple, always-visible "Offline" indicator. It disappears when the device is back online and my changes have been sent.
- Offline, I can still open the app (if I've used it on this device before), see all my lists, and do everything to lists, items, and groups that my role allows: add, edit, check, activate or inactivate, remove, undo, clear checked items, create and rename lists, and manage groups.
- Actions that need the server (deleting a list, invites, roles, removing members, leaving a list, templates, user management) are disabled while offline, with a note saying they need a connection.
- My offline changes show at once and are kept on the device, even if I close the app or restart the phone.
- When the device is back online, my changes are sent automatically, in the order I made them, and the app then shows the latest state from the server.
- If someone else changed the same field later than I did while I was offline, their change wins and mine is dropped for that field. If mine was made later, mine wins. Other fields I changed still apply.
- If a change can't be applied (the item or list was removed, or I lost access or the role for it while offline), it's dropped and a message tells me which change was lost.
- If my sign-in has expired by the time I'm back online, I'm asked to sign in again, and my changes are sent afterwards. They're never sent as a different user. Signing out with unsent changes warns me first.
- The E2E suite covers making changes offline and seeing them sync, and an older offline change losing to a newer online change to the same field.

## Epic: Groups

Groups split a list into store sections (Produce, Meat, Seafood, Dairy…) so a shopper can walk the store once. Each list has its own groups, in its own order, because stores lay out their aisles differently. Using groups is optional: a list with no groups works exactly as described in the Items epic. Replaces the earlier ITEM-06 placeholder.

Only list admins (and system admins) add, reorder, rename, and delete a list's groups. Any member can put an item in a group (GROUP-03).

### GROUP-01 Add a group to a list
**Status:** Draft · **Priority:** Later
As a list admin, I want to add groups to a list so that it can be organized by store section.
- I enter a name of 1–30 characters (after trimming) and save; the group is added at the end of the list's group order.
- An empty or whitespace-only name is rejected with a message, and nothing is saved.
- Group names are unique within a list, ignoring case: adding "dairy" to a list that already has "Dairy" is rejected with a message.
- Different lists may have groups with the same name.

### GROUP-02 Start a list from a template
**Status:** Draft · **Priority:** Later
As a user, I want to start a new list from a template so that I don't have to type the usual groups and items every time.
- When creating a list (LIST-01), I can choose one of the templates managed by system admins (ADMIN-01), or start blank.
- A list created from a template gets a copy of the template's groups, in the template's order, and of its initial items, each with its details, group, and active or inactive state. All items start unchecked.
- The copied groups and items are ordinary groups and items afterwards: they can be renamed, reordered, or deleted.
- Later changes to the template, or deleting it, don't change lists already created from it.
- Starting blank gives a list with no groups and no items.

### GROUP-03 Put an item in a group
**Status:** Draft · **Priority:** Later
As a list user, I want to choose an item's group when I add or edit it so that it shows up in the right section.
- When the list has groups, adding (ITEM-01) or editing (ITEM-03) an item lets me pick one of the list's groups or none.
- When adding several items in a row, the group I picked stays selected for the next item.
- An item belongs to at most one group. An item with no group is "Ungrouped".
- Moving an existing item to another group puts it at the bottom of that group's items.

### GROUP-04 See a list by group
**Status:** Draft · **Priority:** Later
As a list user, I want the list shown group by group in store order so that I can shop in one pass.
- Active, unchecked items are shown under a heading for each group, in the list's group order. Ungrouped items come last, under an "Other" heading.
- A group with no active, unchecked items has no heading in this part of the list.
- Checked items still move to the single Checked section below everything else (ITEM-02), and go back under their group heading when unchecked.
- When inactive items are shown (ITEM-09), the Inactive section is split under the same group headings, in the same order.
- Within each heading, items are in their manual order (ITEM-11). A new item appears at the bottom of its group's items (ITEM-01).
- When the list has no groups, it looks exactly as it does without this epic: no headings.

### GROUP-05 Reorder groups
**Status:** Draft · **Priority:** Later
As a list admin, I want to put a list's groups in the order the store is walked so that nobody doubles back.
- I can move a group up or down one place at a time; each move is a single tap and the control meets NFR-02's 44×44 px target.
- The new order shows at once and persists across reloads and devices, for every member.
- Reordering groups doesn't change the order of items within a group.

### GROUP-06 Rename a group
**Status:** Draft · **Priority:** Later
As a list admin, I want to rename a group so that it matches the store's signs.
- The name rules from GROUP-01 apply.
- The group keeps its position and its items.

### GROUP-07 Delete a group
**Status:** Draft · **Priority:** Later
As a list admin, I want to delete a group that isn't used so that the list stays tidy.
- I must confirm before the group is deleted.
- Deleting a group never deletes its items: they become Ungrouped and keep their details and their active, inactive, and checked state.
- The group no longer appears anywhere, including after reload.

### GROUP-08 Suggest a group for an item
**Status:** Draft · **Priority:** Later
As a list user, I want the app to pick the group I used last time for an item so that I don't have to pick it again.
- Criteria to be written. Overlaps with ITEM-07 (suggest items I've added before); decide the two together.

## Epic: Account

### AUTH-01 Sign up, sign in, sign out
**Status:** Ready · **Priority:** MVP
As a user, I want my own account so that my lists are private and available on all my devices.
- Anyone can create an account with an email address and password through Cognito managed login. The account can't be used until the email address is verified with the code Cognito sends.
- I can sign in and sign out. I stay signed in on a device, including after closing the browser, until I sign out or my session expires.
- Signed-out visitors see a sign-in screen and cannot reach any list data through the UI or the API.
- Every API route except `GET /api/health` has the JWT authorizer and requires the `coplist/api` scope: a request with no token, or an expired or invalid one, gets 401 from API Gateway, and the web app sends me to sign in.
- `getUserId` returns the token's `sub` claim. Verifying an account creates its user record (post-confirmation trigger), with no system admin rights and no lists.
- `AuthStack` is added as described in CLAUDE.md. Its callback URLs use `https://dev.coplists.com` (from `domainName`, SETUP-04); the dev app client also allows `http://localhost:5173`.
- The web app reads the Cognito settings from `/config.json` (CLAUDE.md), not from its build.
- A script creates the E2E test users, with their user records (the post-confirmation trigger doesn't run for admin-created users), and stores their credentials as `SecureString` parameters under `/coplist/<env>/e2e/`; it's added to the manual steps in `README.md`. The E2E suite signs in as one of them, and includes a signed-in `GET` request through CloudFront to confirm the `Authorization` header reaches the API.

## Epic: Sharing

A list admin (or system admin) shares a list by inviting people to it. An invitee becomes a list user only after accepting. Replaces the earlier SHARE-01 placeholder.

### SHARE-01 Invite someone to a list
**Status:** Ready · **Priority:** MVP
As a list admin, I want to invite people to a list so that we can build and shop from it together.
- I invite someone by email address. The invite is pending until they accept or reject it.
- The app emails them an invite: who invited them, the list's name, and a link to the app's invites screen. The email contains no secret; the invite is matched to their verified email address when they sign in.
- The person doesn't need an account yet. If they don't have one, the link lets them sign up, and they must sign up with that email address before they can see and respond to the invite.
- If the email can't be sent, the invite still exists, and it's shown as "email not delivered" in the pending invites so I can tell the person another way.
- To prevent spam, each user can send at most 20 invites in any 24 hours; more are rejected with a message.
- The manual steps in `README.md` cover, before real users are invited, requesting SES production access (in the SES sandbox, email only reaches verified addresses).
- Inviting someone who is already a member of the list, or who already has a pending invite to it, is rejected with a message.
- I can see the list's pending invites and cancel one. A canceled invite can no longer be accepted.
- A list user can't invite anyone: the UI offers no invite, and the API rejects it (NFR-05).

### SHARE-02 Accept or reject an invite
**Status:** Ready · **Priority:** MVP
As an invited user, I want to accept or reject an invite so that I only see lists I want to use.
- When signed in, I see my pending invites, each with the list's name and who invited me.
- Accepting makes me a list user of the list; it then appears in my lists (LIST-02).
- Rejecting removes the invite; I don't become a member and the list stays hidden from me.
- Until I accept, I can't see the list's items or reach them through the API.

### SHARE-03 Promote or demote a member
**Status:** Ready · **Priority:** MVP
As a list admin, I want to change who else can manage the list so that the right people can manage it with me.
- I can see the list's members and each one's role. The primary list admin is marked as such.
- I can promote a list user to list admin, and demote a list admin to list user, including myself. It affects only this list.
- The primary list admin can't be demoted: the UI offers no control for them, and the API rejects it with 400 `PRIMARY_ADMIN_LOCKED`.
- A list user can't change anyone's role: the UI offers no control, and the API rejects it (NFR-05).

### SHARE-04 Remove someone from a list
**Status:** Draft · **Priority:** Later
As a list admin, I want to remove a member from a list so that only the right people can use it.
- I can remove a list user or list admin from the list, after confirmation. They no longer see the list or reach it through the API.
- The primary list admin can't be removed: the UI offers no control for them, and the API rejects it with 400 `PRIMARY_ADMIN_LOCKED`. Because the primary list admin always stays, every list always has a list admin.
- Items the removed member added stay on the list.

### SHARE-05 Leave a list
**Status:** Draft · **Priority:** Later
As a list user or list admin, I want to leave a list I no longer use so that it stops appearing in my lists.
- I can leave a list I'm a list user or list admin of, after confirmation. It no longer appears in my lists (LIST-02), and I can't reach it through the API.
- The primary list admin can't leave: the UI offers no Leave control for them, and the API rejects it with 400 `PRIMARY_ADMIN_LOCKED`. They can delete the list instead (LIST-04).
- Items I added stay on the list.
- To rejoin, I need a new invite (SHARE-01).

## Epic: Administration

For system admins only. Every story here is rejected by the API for anyone who isn't a system admin (NFR-05).

### ADMIN-01 Manage list templates
**Status:** Draft · **Priority:** Later
As a system admin, I want to manage list templates so that users can start lists with the right groups and items (GROUP-02).
- I can create, rename, and delete a template. Template names follow the list name rules from LIST-01, except that they must be unique, ignoring case: a duplicate is rejected with a message.
- A template has an ordered set of groups (names follow GROUP-01's rules) and a set of initial items (details follow ITEM-01's rules). Each initial item has an optional group from the template and is either active or inactive.
- I can add, edit, reorder, and remove a template's groups and items.
- The suggested grocery groups (Produce, Bakery, Meat, Seafood, Deli, Dairy, Frozen, Pantry, Beverages, Household, Personal Care) are seeded as a starting template.

### ADMIN-02 Manage users
**Status:** Draft · **Priority:** Later
As a system admin, I want to manage users and their access so that the right people can use the right lists.
- I can see all users, with whether each is a system admin.
- I can add a user by email address. Cognito emails them a temporary password, and they choose their own at first sign-in. Their user record is created when I add them, because Cognito's post-confirmation trigger doesn't run for admin-created users. (Anyone can also sign up on their own, AUTH-01.)
- I can remove a user. They can no longer sign in, the API rejects their requests at once even if their token hasn't expired (401), and their memberships and pending invites are removed.
- Removing a user also deletes every list they're primary list admin of, with its items, groups, memberships, and pending invites (as in LIST-04). Before I confirm, I'm told how many lists will be deleted and how many other members they have. Members who have one of those lists open are taken back to their lists with a message (SYNC-01).
- I can make a user a system admin or take system admin rights away. I can't take away my own rights or remove myself as a user, so there is always at least one system admin.
- The first system admin is assigned by a script run against a named environment, not through the UI.

### ADMIN-03 Manage any list
**Status:** Draft · **Priority:** Later
As a system admin, I want to act as list admin on any list so that I can help users and fix problems.
- I can see every list in the system, including lists I'm not a member of, in an admin view separate from my own lists (LIST-02).
- On any list I can do everything a list admin can, and also delete the list: rename, delete, manage groups, invite, promote and demote members, and remove members.
- The primary list admin rule applies to me too: I can't demote or remove a list's primary list admin.

## Later

### ITEM-07 Suggest items I've added before
**Status:** Draft · **Priority:** Later
As a list user, I want suggestions based on items I've added before so that I type less.
- Criteria to be written. Consider suggesting the list's inactive items first, and activating a matching inactive item instead of adding a duplicate.
