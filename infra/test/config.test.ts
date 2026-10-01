import { App } from 'aws-cdk-lib';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../lib/config.js';

const context = {
  hostedZoneName: 'example.com',
  pipeline: { repo: 'owner/repo', branch: 'main' },
  environments: {
    dev: {
      domainName: 'dev.example.com',
      emailFromAddress: 'invites@dev.example.com',
      authDomainPrefix: 'coplist-dev',
      apiThrottle: { rateLimit: 10, burstLimit: 20 },
      monthlyBudgetUsd: 10,
    },
  },
};

describe('SETUP-01 loadConfig', () => {
  it('fails without --context env', () => {
    expect(() => loadConfig(new App({ context }))).toThrow(/missing --context env/);
  });

  it('fails for an unknown env', () => {
    expect(() => loadConfig(new App({ context: { ...context, env: 'prod' } }))).toThrow(/unknown env "prod"/);
  });

  it('loads the named environment', () => {
    const config = loadConfig(new App({ context: { ...context, env: 'dev' } }));
    expect(config.environment.domainName).toBe('dev.example.com');
    expect(config.environment.allowLocalhostCallback).toBe(true);
  });
});
