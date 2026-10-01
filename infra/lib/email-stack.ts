import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ses from 'aws-cdk-lib/aws-ses';
import type * as sns from 'aws-cdk-lib/aws-sns';
import type { Construct } from 'constructs';
import { importHostedZone } from './hosted-zone.js';

export interface EmailStackProps extends StackProps {
  domainName: string;
  hostedZoneName: string;
  alarmTopic: sns.ITopic;
}

/** SES domain identity for invite emails (SHARE-01). */
export class EmailStack extends Stack {
  readonly identityArn: string;
  readonly configurationSet: ses.ConfigurationSet;
  readonly configurationSetArn: string;

  constructor(scope: Construct, id: string, props: EmailStackProps) {
    super(scope, id, props);

    const zone = importHostedZone(this, props.hostedZoneName);

    this.configurationSet = new ses.ConfigurationSet(this, 'ConfigurationSet', {
      reputationMetrics: true,
      sendingEnabled: true,
    });

    // Identity.publicHostedZone would verify the zone apex; the sender is on <domainName>.
    const identity = new ses.EmailIdentity(this, 'Identity', {
      identity: ses.Identity.domain(props.domainName),
      configurationSet: this.configurationSet,
      dkimSigning: true,
    });

    identity.dkimRecords.forEach((record, index) => {
      new route53.CnameRecord(this, `DkimRecord${index + 1}`, {
        zone,
        recordName: record.name,
        domainName: record.value,
        ttl: Duration.hours(1),
      });
    });

    this.identityArn = identity.emailIdentityArn;
    this.configurationSetArn = this.formatArn({
      service: 'ses',
      resource: 'configuration-set',
      resourceName: this.configurationSet.configurationSetName,
    });

    // SES pauses sending for accounts with high bounce or complaint rates.
    const alarmAction = new actions.SnsAction(props.alarmTopic);
    const reputationAlarm = (id: string, metricName: string, threshold: number) => {
      const alarm = new cloudwatch.Alarm(this, id, {
        metric: new cloudwatch.Metric({
          namespace: 'AWS/SES',
          metricName,
          statistic: 'Maximum',
          period: Duration.hours(1),
        }),
        threshold,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(alarmAction);
    };
    reputationAlarm('BounceRateAlarm', 'Reputation.BounceRate', 0.05);
    reputationAlarm('ComplaintRateAlarm', 'Reputation.ComplaintRate', 0.001);
  }
}
