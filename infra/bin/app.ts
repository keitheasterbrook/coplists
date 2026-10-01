import { existsSync } from 'node:fs';
import { App } from 'aws-cdk-lib';
import { loadConfig } from '../lib/config.js';
import { PLACEHOLDER_SITE_DIR, WEB_DIST_DIR } from '../lib/constants.js';
import { DevOpsStack } from '../lib/devops-stack.js';

const app = new App();
const config = loadConfig(app);

// The only process.env read in infra: account and region come from the AWS profile.
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION;
if (!account || !region) {
  throw new Error('infra: CDK_DEFAULT_ACCOUNT and CDK_DEFAULT_REGION are unset; run cdk with --profile <profile>');
}

new DevOpsStack(app, 'DevOpsStack', {
  env: { account, region },
  config,
  webAssetPath: existsSync(WEB_DIST_DIR) ? WEB_DIST_DIR : PLACEHOLDER_SITE_DIR,
});
