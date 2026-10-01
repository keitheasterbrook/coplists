import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AppStage } from '../lib/app-stage.js';
import type { EnvironmentConfig } from '../lib/config.js';
import { PLACEHOLDER_SITE_DIR } from '../lib/constants.js';

// Obviously fake, so no committed snapshot or assertion can capture a real account or region.
export const TEST_ENV = { account: '000000000000', region: 'test-region-1' };

export const TEST_CONFIG: EnvironmentConfig = {
  envName: 'test',
  domainName: 'test.example.com',
  emailFromAddress: 'invites@test.example.com',
  authDomainPrefix: 'coplist-test',
  apiThrottle: { rateLimit: 10, burstLimit: 20 },
  monthlyBudgetUsd: 10,
  allowLocalhostCallback: true,
};

/** Builds the whole stage once, with Lambda bundling skipped for speed. */
export function buildStage(overrides: Partial<EnvironmentConfig> = {}): AppStage {
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  return new AppStage(app, 'test', {
    env: TEST_ENV,
    config: { ...TEST_CONFIG, ...overrides },
    hostedZoneName: 'example.com',
    webAssetPath: PLACEHOLDER_SITE_DIR,
  });
}

export const templateOf = Template.fromStack;
