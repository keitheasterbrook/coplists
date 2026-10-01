import { Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import type { Construct } from 'constructs';
import { importHostedZone } from './hosted-zone.js';

export interface CertStackProps extends StackProps {
  domainName: string;
  hostedZoneName: string;
}

/** The CloudFront certificate. Always deployed to us-east-1 (CLOUDFRONT_CERT_REGION). */
export class CertStack extends Stack {
  readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: CertStackProps) {
    super(scope, id, { ...props, crossRegionReferences: true });

    const zone = importHostedZone(this, props.hostedZoneName);
    this.certificate = new acm.Certificate(this, 'SiteCertificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(zone),
    });
  }
}
