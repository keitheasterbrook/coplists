import { Stack, type StackProps } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { AppStage } from './app-stage.js';
import type { AppConfig } from './config.js';
import { PIPELINE_CONNECTION_ARN_PARAMETER } from './constants.js';

export interface DevOpsStackProps extends StackProps {
  config: AppConfig;
  webAssetPath: string;
}

/**
 * The self-mutating CDK pipeline. The only stack ever deployed by hand; it deploys the app
 * stacks for its environment on every push to the configured branch.
 */
export class DevOpsStack extends Stack {
  constructor(scope: Construct, id: string, props: DevOpsStackProps) {
    super(scope, id, props);

    const { config } = props;
    const envName = config.environment.envName;

    // Created by hand: the ARN contains the account ID and region.
    const connectionArn = ssm.StringParameter.valueForStringParameter(this, PIPELINE_CONNECTION_ARN_PARAMETER);

    const pipeline = new pipelines.CodePipeline(this, 'Pipeline', {
      crossAccountKeys: false,
      selfMutation: true,
      synth: new pipelines.ShellStep('Synth', {
        // CodeBuild images ship `n`; pin Node to .nvmrc's major version.
        installCommands: ['n $(cat .nvmrc)'],
        input: pipelines.CodePipelineSource.connection(config.pipeline.repo, config.pipeline.branch, {
          connectionArn,
        }),
        commands: [
          'npm ci',
          'npm run build',
          `cd infra && npx cdk synth --context env=${envName}`,
        ],
        primaryOutputDirectory: 'infra/cdk.out',
      }),
      codeBuildDefaults: {
        buildEnvironment: { buildImage: codebuild.LinuxBuildImage.STANDARD_7_0 },
      },
    });

    const stage = new AppStage(this, envName, {
      env: { account: this.account, region: this.region },
      config: config.environment,
      hostedZoneName: config.hostedZoneName,
      webAssetPath: props.webAssetPath,
    });

    const siteUrl = `https://${config.environment.domainName}`;
    pipeline.addStage(stage, {
      post: [
        // Replace with the Playwright suite once apps/web exists (needs the E2E test users, AUTH-01).
        new pipelines.ShellStep('SmokeTest', {
          commands: [
            `curl -fsS ${siteUrl}/ > /dev/null`,
            `curl -fsS ${siteUrl}/api/health`,
          ],
        }),
      ],
    });
  }
}
