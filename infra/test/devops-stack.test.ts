import { App } from 'aws-cdk-lib';
import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_SITE_DIR } from '../lib/constants.js';
import { DevOpsStack } from '../lib/devops-stack.js';
import { TEST_CONFIG, TEST_ENV, templateOf } from './helpers.js';

describe('SETUP-01 DevOpsStack', () => {
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new DevOpsStack(app, 'DevOpsStack', {
    env: TEST_ENV,
    config: {
      hostedZoneName: 'example.com',
      pipeline: { repo: 'owner/repo', branch: 'main' },
      environment: TEST_CONFIG,
    },
    webAssetPath: PLACEHOLDER_SITE_DIR,
  });
  const projects = Object.values(templateOf(stack).findResources('AWS::CodeBuild::Project')).map((project) =>
    JSON.stringify(project.Properties),
  );

  it('builds every workspace before synth', () => {
    expect(projects.some((project) => project.includes('npm run build') && project.includes('cdk synth --context env=test'))).toBe(true);
  });

  it('runs the Playwright E2E suite against the deployed site after the stage deploys', () => {
    const e2e = projects.find((project) => project.includes('npm run test:e2e -w apps/web'));
    expect(e2e).toBeDefined();
    expect(e2e).toContain('playwright install --with-deps chromium');
    expect(e2e).toContain('https://test.example.com');
  });
});
