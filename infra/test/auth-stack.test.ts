import { Match } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
import { buildStage, templateOf } from './helpers.js';

describe('AUTH-01 AuthStack', () => {
  it('keeps the user pool and allows email sign-up with verification', () => {
    const template = templateOf(buildStage().authStack);
    template.hasResource('AWS::Cognito::UserPool', {
      DeletionPolicy: 'Retain',
      Properties: Match.objectLike({
        DeletionProtection: 'ACTIVE',
        UsernameAttributes: ['email'],
        AutoVerifiedAttributes: ['email'],
        AdminCreateUserConfig: Match.objectLike({ AllowAdminCreateUserOnly: false }),
        LambdaConfig: Match.objectLike({ PostConfirmation: Match.anyValue() }),
      }),
    });
  });

  it('issues the coplist/api scope to a code-flow client with no secret', () => {
    const template = templateOf(buildStage().authStack);
    template.hasResourceProperties('AWS::Cognito::UserPoolResourceServer', {
      Identifier: 'coplist',
      Scopes: [Match.objectLike({ ScopeName: 'api' })],
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      AllowedOAuthFlows: ['code'],
      // The resource server's scope is a Fn::Join on its identifier, which also orders the deploy.
      AllowedOAuthScopes: ['openid', 'email', { 'Fn::Join': ['', [Match.anyValue(), '/api']] }],
      CallbackURLs: ['https://test.example.com/auth/callback', 'http://localhost:5173/auth/callback'],
    });
  });

  it('allows localhost callbacks only when configured (dev)', () => {
    const template = templateOf(buildStage({ allowLocalhostCallback: false }).authStack);
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      CallbackURLs: ['https://test.example.com/auth/callback'],
    });
  });
});
