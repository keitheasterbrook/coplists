import type { App } from 'aws-cdk-lib';

export interface ApiThrottle {
  rateLimit: number;
  burstLimit: number;
}

export interface EnvironmentConfig {
  envName: string;
  domainName: string;
  emailFromAddress: string;
  authDomainPrefix: string;
  apiThrottle: ApiThrottle;
  monthlyBudgetUsd: number;
  /** dev only: lets local `vite` sign in against the deployed user pool. */
  allowLocalhostCallback: boolean;
}

export interface PipelineConfig {
  repo: string;
  branch: string;
}

export interface AppConfig {
  hostedZoneName: string;
  pipeline: PipelineConfig;
  environment: EnvironmentConfig;
}

function fail(message: string): never {
  throw new Error(`infra config: ${message}`);
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${name} must be a non-empty string`);
  return value;
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) fail(`${name} must be a positive number`);
  return value;
}

export function loadConfig(app: App): AppConfig {
  const envName = app.node.tryGetContext('env');
  if (typeof envName !== 'string' || envName.length === 0) {
    fail('missing --context env=<env>');
  }

  const environments = app.node.tryGetContext('environments') as Record<string, Record<string, unknown>> | undefined;
  const raw = environments?.[envName];
  if (!raw) {
    fail(`unknown env "${envName}"; expected one of: ${Object.keys(environments ?? {}).join(', ')}`);
  }

  const throttle = raw.apiThrottle as Record<string, unknown> | undefined;
  const pipeline = app.node.tryGetContext('pipeline') as Record<string, unknown> | undefined;

  return {
    hostedZoneName: requireString(app.node.tryGetContext('hostedZoneName'), 'hostedZoneName'),
    pipeline: {
      repo: requireString(pipeline?.repo, 'pipeline.repo'),
      branch: requireString(pipeline?.branch, 'pipeline.branch'),
    },
    environment: {
      envName,
      domainName: requireString(raw.domainName, `environments.${envName}.domainName`),
      emailFromAddress: requireString(raw.emailFromAddress, `environments.${envName}.emailFromAddress`),
      authDomainPrefix: requireString(raw.authDomainPrefix, `environments.${envName}.authDomainPrefix`),
      apiThrottle: {
        rateLimit: requireNumber(throttle?.rateLimit, `environments.${envName}.apiThrottle.rateLimit`),
        burstLimit: requireNumber(throttle?.burstLimit, `environments.${envName}.apiThrottle.burstLimit`),
      },
      monthlyBudgetUsd: requireNumber(raw.monthlyBudgetUsd, `environments.${envName}.monthlyBudgetUsd`),
      allowLocalhostCallback: envName === 'dev',
    },
  };
}
