# coplists

Web application to manage shopping lists. How the project is built is in `CLAUDE.md`; what to build is in `user-stories.md`.

## Requirements

- Node.js 24 (`.nvmrc`)
- AWS CLI v2 and a named AWS profile for the target account. Every AWS command below takes `--profile <profile>`; never rely on the default profile.

## Local development

```sh
npm install                      # once, from the repo root
npm run dev -w apps/web          # http://localhost:5173
npm run lint && npm run typecheck && npm test
npm run test:e2e -w apps/web     # Playwright, desktop and 360 px wide
```

Create the untracked `apps/web/.env.local`:

```sh
VITE_API_PROXY_TARGET=https://<dev domainName>   # the dev server proxies /api and /config.json here
# E2E_BASE_URL=https://<dev domainName>          # set to run the E2E suite against the deployed site instead
```

## One-time setup for an environment

The values for each environment (domain name, sender address, Cognito prefix, throttle, budget) are in `infra/cdk.json` under `context.environments.<env>`. Run the commands from `infra/` with the environment's profile:

```sh
export PROFILE=<profile>
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --profile $PROFILE)
export CERT_REGION=<CLOUDFRONT_CERT_REGION from infra/lib/constants.ts>
```

1. **Register the domain.** Register `coplists.com` with Route 53 Domains in the console. This creates its public hosted zone. CDK never creates or deletes the zone.
2. **Hosted zone ID parameter**, in the profile's region and in the CloudFront certificate region:
   ```sh
   ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name coplists.com \
     --query 'HostedZones[0].Id' --output text --profile $PROFILE | cut -d/ -f3)
   aws ssm put-parameter --name /coplists/dns/hosted-zone-id --type String --value "$ZONE_ID" --profile $PROFILE
   aws ssm put-parameter --name /coplists/dns/hosted-zone-id --type String --value "$ZONE_ID" --region $CERT_REGION --profile $PROFILE
   ```
3. **Alerts email parameter**, the address that receives alarm and budget emails:
   ```sh
   aws ssm put-parameter --name /coplists/alerts/email --type String --value <email> --profile $PROFILE
   ```
4. **Bootstrap CDK**, in the profile's region and in the CloudFront certificate region:
   ```sh
   npx cdk bootstrap --profile $PROFILE
   npx cdk bootstrap aws://$ACCOUNT_ID/$CERT_REGION --profile $PROFILE
   ```
5. **GitHub connection.** In the CodePipeline console (Settings → Connections, in the profile's region), create a GitHub connection to the repository in `context.pipeline`, and complete the authorization so its status is Available. Store its ARN:
   ```sh
   aws ssm put-parameter --name /coplists/pipeline/connection-arn --type String --value <connection ARN> --profile $PROFILE
   ```
6. **Deploy the pipeline**, the only stack ever deployed by hand:
   ```sh
   npx cdk deploy DevOpsStack --context env=<env> --profile $PROFILE
   ```
   From then on, pushing to the configured branch deploys every stack and runs the E2E suite against the site.
7. **Confirm the alerts subscription.** After `MonitoringStack` deploys, click the confirmation link in the email SNS sends to the alerts address.

Stacks are named `<env>-coplists-<name>` (for example `dev-coplists-CertStack`).

## Before launch

- **SES production access.** New accounts are in the SES sandbox, where email reaches only verified addresses. Request production access in the SES console before inviting real users.
- **Cognito email through SES.** Cognito's built-in email sends about 50 emails a day per account. Configure the user pool to send through the SES identity from `EmailStack`.
