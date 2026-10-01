import * as path from 'node:path';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { HANDLERS_DIR, LOCK_FILE, REPO_ROOT } from './constants.js';

export interface HandlerFunctionProps {
  handler: string;
  environment?: Record<string, string>;
  timeout?: Duration;
}

/** A Lambda built from services/api/src/handlers/<handler>.ts, with a one-week log group. */
export function handlerFunction(scope: Construct, id: string, props: HandlerFunctionProps): nodejs.NodejsFunction {
  const logGroup = new logs.LogGroup(scope, `${id}Logs`, {
    retention: logs.RetentionDays.ONE_WEEK,
    removalPolicy: RemovalPolicy.DESTROY,
  });

  return new nodejs.NodejsFunction(scope, id, {
    entry: path.join(HANDLERS_DIR, `${props.handler}.ts`),
    handler: 'handler',
    runtime: lambda.Runtime.NODEJS_24_X,
    architecture: lambda.Architecture.ARM_64,
    memorySize: 256,
    timeout: props.timeout ?? Duration.seconds(10),
    projectRoot: REPO_ROOT,
    depsLockFilePath: LOCK_FILE,
    logGroup,
    environment: props.environment,
    bundling: {
      format: nodejs.OutputFormat.ESM,
      minify: true,
      sourceMap: true,
      // The AWS SDK v3 is in the Lambda runtime; don't bundle it.
      externalModules: ['@aws-sdk/*'],
    },
  });
}
