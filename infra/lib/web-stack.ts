import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import type * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import { importHostedZone } from './hosted-zone.js';

export interface WebStackProps extends StackProps {
  domainName: string;
  hostedZoneName: string;
  certificate: acm.ICertificate;
  apiDomainName: string;
  /** Built web app (apps/web/dist), or the placeholder page until the app exists. */
  webAssetPath: string;
  userPoolId: string;
  userPoolClientId: string;
  authDomainUrl: string;
}

// Client-side routes (e.g. /lists/123) load index.html. Done per behavior rather than with
// distribution-wide error responses, which would also rewrite the API's JSON 404s.
const SPA_REWRITE = `
function handler(event) {
  var request = event.request;
  if (request.uri.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
`;

/** S3 + CloudFront for the site, /api/* to the HTTP API, and /config.json (SETUP-01, SETUP-04). */
export class WebStack extends Stack {
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, { ...props, crossRegionReferences: true });

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Rebuilt from source on every deploy.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      code: cloudfront.FunctionCode.fromInline(SPA_REWRITE),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: [props.domainName],
      certificate: props.certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(props.apiDomainName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // Forwards Authorization and If-None-Match; Host must be the API's own domain.
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    const zone = importHostedZone(this, props.hostedZoneName);
    const aliasTarget = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution));
    new route53.ARecord(this, 'SiteARecord', { zone, recordName: props.domainName, target: aliasTarget });
    new route53.AaaaRecord(this, 'SiteAaaaRecord', { zone, recordName: props.domainName, target: aliasTarget });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      destinationBucket: bucket,
      sources: [
        s3deploy.Source.asset(props.webAssetPath),
        s3deploy.Source.jsonData('config.json', {
          region: this.region,
          userPoolId: props.userPoolId,
          userPoolClientId: props.userPoolClientId,
          authDomainUrl: props.authDomainUrl,
        }),
      ],
      // Everything revalidates; switch hashed assets to long-lived caching once apps/web exists.
      cacheControl: [s3deploy.CacheControl.noCache()],
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });
  }
}
