/** CloudFormation stack name: `<env>-coplists-<name>`, e.g. `dev-coplists-CertStack`. */
export function stackName(envName: string, name: string): string {
  return `${envName}-coplists-${name}`;
}
