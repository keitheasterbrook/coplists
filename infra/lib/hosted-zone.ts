import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { HOSTED_ZONE_ID_PARAMETER } from './constants.js';

/**
 * The coplists.com zone, created by the domain registration, never by CDK. Its ID is read from
 * SSM in the stack's own region (the parameter exists in the primary region and us-east-1).
 */
export function importHostedZone(scope: Construct, zoneName: string): route53.IHostedZone {
  return route53.HostedZone.fromHostedZoneAttributes(scope, 'HostedZone', {
    hostedZoneId: ssm.StringParameter.valueForStringParameter(scope, HOSTED_ZONE_ID_PARAMETER),
    zoneName,
  });
}
