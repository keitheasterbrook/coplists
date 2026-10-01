import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// CloudFront only accepts ACM certificates from us-east-1. The only region name allowed in the repo.
export const CLOUDFRONT_CERT_REGION = 'us-east-1';

export const HOSTED_ZONE_ID_PARAMETER = '/coplist/dns/hosted-zone-id';
export const PIPELINE_CONNECTION_ARN_PARAMETER = '/coplist/pipeline/connection-arn';
export const ALERTS_EMAIL_PARAMETER = '/coplist/alerts/email';

export const API_SCOPE = 'coplist/api';
export const RESOURCE_SERVER_ID = 'coplist';
export const RESOURCE_SERVER_SCOPE = 'api';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const HANDLERS_DIR = path.join(REPO_ROOT, 'services/api/src/handlers');
export const LOCK_FILE = path.join(REPO_ROOT, 'package-lock.json');
export const WEB_DIST_DIR = path.join(REPO_ROOT, 'apps/web/dist');
export const PLACEHOLDER_SITE_DIR = path.join(REPO_ROOT, 'infra/assets/placeholder-site');
