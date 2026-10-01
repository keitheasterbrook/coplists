import { Stack, type StackProps } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { ALERTS_EMAIL_PARAMETER } from './constants.js';

export interface MonitoringStackProps extends StackProps {
  monthlyBudgetUsd: number;
}

/** Alarm topic and the account's cost budget (SETUP-03). */
export class MonitoringStack extends Stack {
  readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // Created by hand, so no personal address is in the repo.
    const alertsEmail = ssm.StringParameter.valueForStringParameter(this, ALERTS_EMAIL_PARAMETER);

    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', { enforceSSL: true });
    this.alarmTopic.addSubscription(new subscriptions.EmailSubscription(alertsEmail));

    const subscribers = [{ subscriptionType: 'EMAIL', address: alertsEmail }];

    // A budget covers the whole account: with a second environment in this account, create it only once.
    new budgets.CfnBudget(this, 'MonthlyCostBudget', {
      budget: {
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: props.monthlyBudgetUsd, unit: 'USD' },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers,
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers,
        },
      ],
    });
  }
}
