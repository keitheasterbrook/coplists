import { Stage, type StageProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { ApiStack } from './api-stack.js';
import { AuthStack } from './auth-stack.js';
import { CertStack } from './cert-stack.js';
import type { EnvironmentConfig } from './config.js';
import { CLOUDFRONT_CERT_REGION } from './constants.js';
import { DataStack } from './data-stack.js';
import { EmailStack } from './email-stack.js';
import { MonitoringStack } from './monitoring-stack.js';
import { WebStack } from './web-stack.js';

export interface AppStageProps extends StageProps {
  config: EnvironmentConfig;
  hostedZoneName: string;
  webAssetPath: string;
}

/** One environment's stacks. The pipeline deploys one of these per environment. */
export class AppStage extends Stage {
  readonly apiStack: ApiStack;
  readonly authStack: AuthStack;
  readonly certStack: CertStack;
  readonly dataStack: DataStack;
  readonly emailStack: EmailStack;
  readonly monitoringStack: MonitoringStack;
  readonly webStack: WebStack;

  constructor(scope: Construct, id: string, props: AppStageProps) {
    super(scope, id, props);

    const { config, hostedZoneName } = props;
    const env = { account: this.account, region: this.region };

    this.certStack = new CertStack(this, 'CertStack', {
      env: { account: this.account, region: CLOUDFRONT_CERT_REGION },
      domainName: config.domainName,
      hostedZoneName,
    });

    this.dataStack = new DataStack(this, 'DataStack', { env });

    this.monitoringStack = new MonitoringStack(this, 'MonitoringStack', {
      env,
      monthlyBudgetUsd: config.monthlyBudgetUsd,
    });

    this.authStack = new AuthStack(this, 'AuthStack', {
      env,
      table: this.dataStack.table,
      domainName: config.domainName,
      authDomainPrefix: config.authDomainPrefix,
      allowLocalhostCallback: config.allowLocalhostCallback,
    });

    this.emailStack = new EmailStack(this, 'EmailStack', {
      env,
      domainName: config.domainName,
      hostedZoneName,
      alarmTopic: this.monitoringStack.alarmTopic,
    });

    this.apiStack = new ApiStack(this, 'ApiStack', {
      env,
      domainName: config.domainName,
      hostedZoneName,
      apiThrottle: config.apiThrottle,
      table: this.dataStack.table,
      userPool: this.authStack.userPool,
      userPoolClient: this.authStack.userPoolClient,
      alarmTopic: this.monitoringStack.alarmTopic,
      emailFromAddress: config.emailFromAddress,
      emailIdentityArn: this.emailStack.identityArn,
      emailConfigurationSetName: this.emailStack.configurationSet.configurationSetName,
      emailConfigurationSetArn: this.emailStack.configurationSetArn,
    });

    this.webStack = new WebStack(this, 'WebStack', {
      env,
      domainName: config.domainName,
      hostedZoneName,
      certificate: this.certStack.certificate,
      apiDomainName: this.apiStack.apiDomainName,
      webAssetPath: props.webAssetPath,
      userPoolId: this.authStack.userPool.userPoolId,
      userPoolClientId: this.authStack.userPoolClient.userPoolClientId,
      authDomainUrl: this.authStack.authDomainUrl,
    });
    // apiDomainName is a plain string, so the /api/* origin needs an explicit ordering.
    this.webStack.addStackDependency(this.apiStack, 'CloudFront /api/* origin is the API custom domain');
  }
}
