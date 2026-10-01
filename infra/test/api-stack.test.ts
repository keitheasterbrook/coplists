import { Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { API_ROUTES } from '../lib/api-routes.js';
import { buildStage, templateOf } from './helpers.js';

describe('ApiStack', () => {
  const template = templateOf(buildStage().apiStack);
  const routes = template.findResources('AWS::ApiGatewayV2::Route');
  const routeByKey = new Map(
    Object.values(routes).map((r) => [r.Properties.RouteKey as string, r.Properties as Record<string, unknown>]),
  );

  it('has one route and one handler Lambda per entry in the route table', () => {
    expect(routeByKey.size).toBe(API_ROUTES.length);
    for (const route of API_ROUTES) {
      expect(routeByKey.has(`${route.method} ${route.path}`), `${route.method} ${route.path}`).toBe(true);
    }
  });

  it('AUTH-01 puts the JWT authorizer and coplist/api scope on every route except GET /api/health', () => {
    for (const [key, props] of routeByKey) {
      if (key === 'GET /api/health') {
        expect(props.AuthorizationType ?? 'NONE').toBe('NONE');
      } else {
        expect(props.AuthorizationType, key).toBe('JWT');
        expect(props.AuthorizationScopes, key).toEqual(['coplist/api']);
      }
    }
  });

  it('SETUP-04 disables the default execute-api endpoint and serves api.<domain> with TLS 1.2', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', { DisableExecuteApiEndpoint: true });
    template.hasResourceProperties('AWS::ApiGatewayV2::DomainName', {
      DomainName: 'api.test.example.com',
      DomainNameConfigurations: [Match.objectLike({ SecurityPolicy: 'TLS_1_2' })],
    });
  });

  it('SETUP-03 throttles the stage and logs access for a week', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: Match.objectLike({ ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 }),
      AccessLogSettings: Match.objectLike({ DestinationArn: Match.anyValue() }),
    });
    const retentions = Object.values(template.findResources('AWS::Logs::LogGroup')).map(
      (g) => g.Properties.RetentionInDays,
    );
    expect(retentions.length).toBeGreaterThan(0);
    expect(new Set(retentions)).toEqual(new Set([7]));
  });

  it('SETUP-03 alarms on API 5xx and 4xx, Lambda errors and throttles, and failed invite emails', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 5);
  });

  it('grants read-only routes no write actions on the table', () => {
    const policies = Object.values(template.findResources('AWS::IAM::Policy'));
    const getListPolicy = policies.find((p) => JSON.stringify(p).includes('GetList'));
    expect(getListPolicy).toBeDefined();
    expect(JSON.stringify(getListPolicy)).not.toContain('dynamodb:PutItem');
  });

  it('SHARE-01 triggers the invite-email Lambda only for new invite records', () => {
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      FilterCriteria: {
        Filters: [
          {
            Pattern: JSON.stringify({
              eventName: ['INSERT'],
              dynamodb: { NewImage: { SK: { S: [{ prefix: 'INVITE#' }] } } },
            }),
          },
        ],
      },
    });
  });

  it('uses Node.js 24 on arm64 for every Lambda', () => {
    const fns = Object.values(template.findResources('AWS::Lambda::Function'));
    expect(fns.length).toBe(API_ROUTES.length + 1);
    for (const fn of fns) {
      expect(fn.Properties.Runtime).toBe('nodejs24.x');
      expect(fn.Properties.Architectures).toEqual(['arm64']);
    }
  });
});
