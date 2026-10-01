import { Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildStage, templateOf } from './helpers.js';

describe('WebStack', () => {
  const template = templateOf(buildStage().webStack);

  it('SETUP-04 serves the domain over TLS 1.2+', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['test.example.com'],
        ViewerCertificate: Match.objectLike({ MinimumProtocolVersion: 'TLSv1.2_2021' }),
      }),
    });
  });

  it('forwards /api/* to api.<domain> without caching', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: [
          Match.objectLike({
            PathPattern: '/api/*',
            CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad', // CachingDisabled
            OriginRequestPolicyId: 'b689b0a8-53d0-40ab-baf2-68738e2966ac', // AllViewerExceptHostHeader
          }),
        ],
        Origins: Match.arrayWith([Match.objectLike({ DomainName: 'api.test.example.com' })]),
      }),
    });
  });

  it('has no distribution-wide error responses, which would rewrite API 404s', () => {
    const [dist] = Object.values(template.findResources('AWS::CloudFront::Distribution'));
    expect(dist?.Properties.DistributionConfig.CustomErrorResponses).toBeUndefined();
  });

  it('SETUP-04 imports the hosted zone rather than creating one', () => {
    template.resourceCountIs('AWS::Route53::HostedZone', 0);
  });
});
