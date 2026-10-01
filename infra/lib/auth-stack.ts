import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';
import { RESOURCE_SERVER_ID, RESOURCE_SERVER_SCOPE } from './constants.js';
import { handlerFunction } from './lambda.js';

export interface AuthStackProps extends StackProps {
  table: dynamodb.ITable;
  domainName: string;
  authDomainPrefix: string;
  allowLocalhostCallback: boolean;
}

/**
 * Cognito user pool, web app client, and managed login (AUTH-01).
 * Replacing the user pool deletes every account: stop and ask before any change that would.
 */
export class AuthStack extends Stack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly authDomainUrl: string;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const postConfirmation = handlerFunction(this, 'PostConfirmation', {
      handler: 'post-confirmation',
      environment: { TABLE_NAME: props.table.tableName },
    });
    props.table.grantWriteData(postConfirmation);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lambdaTriggers: { postConfirmation },
    });

    const apiScope = new cognito.ResourceServerScope({
      scopeName: RESOURCE_SERVER_SCOPE,
      scopeDescription: 'Use the Coplist API',
    });
    const resourceServer = this.userPool.addResourceServer('ResourceServer', {
      identifier: RESOURCE_SERVER_ID,
      scopes: [apiScope],
    });

    const siteUrl = `https://${props.domainName}`;
    const localUrl = 'http://localhost:5173';
    const origins = props.allowLocalhostCallback ? [siteUrl, localUrl] : [siteUrl];

    this.userPoolClient = this.userPool.addClient('WebClient', {
      generateSecret: false,
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.resourceServer(resourceServer, apiScope),
        ],
        callbackUrls: origins.map((origin) => `${origin}/auth/callback`),
        logoutUrls: origins.map((origin) => `${origin}/`),
      },
    });

    // A prefix domain, not auth.<domainName>: a custom domain needs the site's DNS record to
    // exist first, and WebStack (which creates it) deploys after this stack.
    const domain = this.userPool.addDomain('ManagedLoginDomain', {
      cognitoDomain: { domainPrefix: props.authDomainPrefix },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    // Managed login shows an error page for a client without a branding style.
    new cognito.CfnManagedLoginBranding(this, 'ManagedLoginBranding', {
      userPoolId: this.userPool.userPoolId,
      clientId: this.userPoolClient.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    this.authDomainUrl = domain.baseUrl();
  }
}
