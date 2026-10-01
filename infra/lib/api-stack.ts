import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import type * as sns from 'aws-cdk-lib/aws-sns';
import type { Construct } from 'constructs';
import { API_ROUTES, type ApiRoute } from './api-routes.js';
import type { ApiThrottle } from './config.js';
import { API_SCOPE } from './constants.js';
import { importHostedZone } from './hosted-zone.js';
import { handlerFunction } from './lambda.js';

export interface ApiStackProps extends StackProps {
  domainName: string;
  hostedZoneName: string;
  apiThrottle: ApiThrottle;
  table: dynamodb.ITable;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  alarmTopic: sns.ITopic;
  emailFromAddress: string;
  emailIdentityArn: string;
  emailConfigurationSetName: string;
  emailConfigurationSetArn: string;
}

/** HTTP API, its Lambdas, and the invite-email Lambda (SETUP-01, SETUP-03, SETUP-04, AUTH-01, SHARE-01). */
export class ApiStack extends Stack {
  /** api.<domainName>: CloudFront's /api/* origin. */
  readonly apiDomainName: string;
  readonly httpApi: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const zone = importHostedZone(this, props.hostedZoneName);
    this.apiDomainName = `api.${props.domainName}`;

    const certificate = new acm.Certificate(this, 'ApiCertificate', {
      domainName: this.apiDomainName,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const customDomain = new apigwv2.DomainName(this, 'ApiDomain', {
      domainName: this.apiDomainName,
      certificate,
      securityPolicy: apigwv2.SecurityPolicy.TLS_1_2,
    });

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      // Only reachable through api.<domainName>, which is CloudFront's origin.
      disableExecuteApiEndpoint: true,
      defaultDomainMapping: { domainName: customDomain },
    });

    new route53.ARecord(this, 'ApiAliasRecord', {
      zone,
      recordName: this.apiDomainName,
      target: route53.RecordTarget.fromAlias(
        new targets.ApiGatewayv2DomainProperties(customDomain.regionalDomainName, customDomain.regionalHostedZoneId),
      ),
    });

    this.configureStage(props.apiThrottle);

    const authorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`,
      { jwtAudience: [props.userPoolClient.userPoolClientId] },
    );

    for (const route of API_ROUTES) this.addRoute(route, props, authorizer);

    const inviteEmail = this.addInviteEmailFunction(props);

    this.addAlarms(props.alarmTopic, inviteEmail);
  }

  private configureStage(throttle: ApiThrottle): void {
    const accessLogs = new logs.LogGroup(this, 'AccessLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // The L2 default stage doesn't expose throttling or access logs yet.
    const stage = this.httpApi.defaultStage?.node.defaultChild as apigwv2.CfnStage;
    stage.defaultRouteSettings = {
      throttlingRateLimit: throttle.rateLimit,
      throttlingBurstLimit: throttle.burstLimit,
      detailedMetricsEnabled: false,
    };
    stage.accessLogSettings = {
      destinationArn: accessLogs.logGroupArn,
      format: JSON.stringify({
        requestId: '$context.requestId',
        requestTime: '$context.requestTime',
        httpMethod: '$context.httpMethod',
        routeKey: '$context.routeKey',
        status: '$context.status',
        responseLatency: '$context.responseLatency',
        integrationError: '$context.integrationErrorMessage',
        authorizerError: '$context.authorizer.error',
        userId: '$context.authorizer.claims.sub',
      }),
    };
  }

  private addRoute(route: ApiRoute, props: ApiStackProps, authorizer: HttpJwtAuthorizer): void {
    const fn = handlerFunction(this, functionId(route.handler), {
      handler: route.handler,
      environment: {
        TABLE_NAME: props.table.tableName,
        USER_POOL_ID: props.userPool.userPoolId,
      },
    });

    if (route.table === 'read') props.table.grantReadData(fn);
    if (route.table === 'readWrite') props.table.grantReadWriteData(fn);
    if (route.cognito?.length) {
      fn.addToRolePolicy(
        new iam.PolicyStatement({ actions: route.cognito, resources: [props.userPool.userPoolArn] }),
      );
    }

    this.httpApi.addRoutes({
      path: route.path,
      methods: [apigwv2.HttpMethod[route.method]],
      integration: new HttpLambdaIntegration(`${functionId(route.handler)}Integration`, fn),
      ...(route.public ? {} : { authorizer, authorizationScopes: [API_SCOPE] }),
    });
  }

  private addInviteEmailFunction(props: ApiStackProps): lambda.Function {
    const fn = handlerFunction(this, 'SendInviteEmail', {
      handler: 'send-invite-email',
      timeout: Duration.seconds(30),
      environment: {
        TABLE_NAME: props.table.tableName,
        SITE_URL: `https://${props.domainName}`,
        EMAIL_FROM_ADDRESS: props.emailFromAddress,
        EMAIL_CONFIGURATION_SET: props.emailConfigurationSetName,
      },
    });

    props.table.grantReadWriteData(fn);
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: [props.emailIdentityArn, props.emailConfigurationSetArn],
      }),
    );

    // Only newly created invite records trigger an email.
    fn.addEventSource(
      new DynamoEventSource(props.table, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 10,
        retryAttempts: 3,
        bisectBatchOnError: true,
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('INSERT'),
            dynamodb: { NewImage: { SK: { S: lambda.FilterRule.beginsWith('INVITE#') } } },
          }),
        ],
      }),
    );

    return fn;
  }

  private addAlarms(topic: sns.ITopic, inviteEmail: lambda.Function): void {
    const action = new actions.SnsAction(topic);
    const period = Duration.minutes(5);
    const alarm = (id: string, metric: cloudwatch.IMetric, threshold: number) => {
      new cloudwatch.Alarm(this, id, {
        metric,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(action);
    };

    alarm('Api5xxAlarm', this.httpApi.metricServerError({ period, statistic: 'Sum' }), 1);
    // Includes throttled 429s: HTTP APIs have no separate throttle metric.
    alarm('Api4xxAlarm', this.httpApi.metricClientError({ period, statistic: 'Sum' }), 50);

    // Account-wide Lambda metrics: one alarm each instead of one per function (38 functions,
    // and metric-math alarms take at most 10 metrics). Assumes this account runs only Coplist.
    alarm('LambdaErrorsAlarm', lambda.Function.metricAllErrors({ period, statistic: 'Sum' }), 1);
    alarm('LambdaThrottlesAlarm', lambda.Function.metricAllThrottles({ period, statistic: 'Sum' }), 1);

    // The invite-email Lambda logs this marker when it gives up and marks an invite `failed`.
    const inviteFailures = new logs.MetricFilter(this, 'InviteEmailFailedFilter', {
      logGroup: inviteEmail.logGroup,
      filterPattern: logs.FilterPattern.literal('INVITE_EMAIL_FAILED'),
      metricNamespace: 'Coplist',
      metricName: 'InviteEmailFailed',
      metricValue: '1',
      defaultValue: 0,
    });
    alarm('InviteEmailFailedAlarm', inviteFailures.metric({ period, statistic: 'Sum' }), 1);
  }
}

function functionId(handler: string): string {
  return handler
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
