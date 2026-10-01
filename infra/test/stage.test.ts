import { describe, expect, it } from 'vitest';
import { buildStage, templateOf } from './helpers.js';

describe('AppStage', () => {
  const stage = buildStage();

  it('deploys the CloudFront certificate to us-east-1', () => {
    expect(stage.certStack.region).toBe('us-east-1');
    templateOf(stage.certStack).resourceCountIs('AWS::CertificateManager::Certificate', 1);
  });

  it('never creates a hosted zone', () => {
    for (const stack of [stage.certStack, stage.apiStack, stage.webStack, stage.emailStack]) {
      templateOf(stack).resourceCountIs('AWS::Route53::HostedZone', 0);
    }
  });

  it('SETUP-03 creates the monthly budget with 80% actual and 100% forecast alerts', () => {
    templateOf(stage.monitoringStack).hasResourceProperties('AWS::Budgets::Budget', {
      Budget: { BudgetType: 'COST', TimeUnit: 'MONTHLY', BudgetLimit: { Amount: 10, Unit: 'USD' } },
    });
  });

  it('SHARE-01 verifies <domainName> in SES with DKIM records', () => {
    const template = templateOf(stage.emailStack);
    template.hasResourceProperties('AWS::SES::EmailIdentity', { EmailIdentity: 'test.example.com' });
    template.resourceCountIs('AWS::Route53::RecordSet', 3);
  });
});
