import * as assert from 'assert';
import * as createDebug from 'debug';
import { chmodSync as chmod, existsSync, statSync, readFileSync } from 'fs';
import { sync as mkdirp } from 'mkdirp';
import { withCertificateAuthorityCredentials } from './certificate-authority';
import {
  withDomainCertificateConfig,
  withDomainSigningRequestConfig
} from './constants';
import { CertOptions } from './index';
import { openssl, pathForDomain, certPathForDomain } from './utils';

const debug = createDebug('devcert:certificates');

/**
 * Generate a domain certificate signed by the devcert root CA. Domain
 * certificates are cached in their own directories under
 * CONFIG_ROOT/domains/<domain>, and reused on subsequent requests. Because the
 * individual domain certificates are signed by the devcert root CA (which was
 * added to the OS/browser trust stores), they are trusted.
 */
export async function generateDomainCertificate(
  commonName: string,
  alternativeNames: string[],
  certOptions: CertOptions
): Promise<void> {
  mkdirp(pathForDomain(commonName));

  debug(`Generating private key for ${commonName}`);
  const domainKeyPath = pathForDomain(commonName, 'private-key.key');
  generateKey(domainKeyPath);

  debug(`Generating certificate signing request for ${commonName}`);
  const csrFile = pathForDomain(commonName, `certificate-signing-request.csr`);
  await withDomainSigningRequestConfig(
    commonName,
    { alternativeNames },
    configpath => {
      openssl(
        `req -new -config "${configpath}" -key "${domainKeyPath}" -out "${csrFile}" -days ${certOptions.domainCertExpiry}`,
        `generating CSR for ${commonName}`
      );
    }
  );

  debug(
    `Generating certificate for ${commonName} from signing request and signing with root CA`
  );
  const domainCertPath = pathForDomain(commonName, `certificate.crt`);

  await withCertificateAuthorityCredentials(
    async ({ caKeyPath, caCertPath }) => {
      await withDomainCertificateConfig(
        commonName,
        alternativeNames,
        domainCertConfigPath => {
          openssl(
            `ca -config "${domainCertConfigPath}" -in "${csrFile}" -out "${domainCertPath}" -keyfile "${caKeyPath}" -cert "${caCertPath}" -days ${certOptions.domainCertExpiry} -batch`,
            `signing cert for ${commonName} with root ca`
          );
        }
      );
    }
  );
}

function isFile(pth: string): boolean {
  return statSync(pth).isFile();
}

/**
 * Revokes a domain certificate signed by the devcert root CA and deletes it.
 */
export async function revokeDomainCertificate(
  commonName: string
): Promise<void> {
  debug(`Revoking certificate for ${commonName}`);
  const domainCertPath = certPathForDomain(commonName);
  assert(existsSync(domainCertPath), 'domainCertPath must exist');
  assert(isFile(domainCertPath), 'domainCertPath must be a file');
  debug('domainCertPath', domainCertPath);

  assert(
    readFileSync(domainCertPath).toString().length > 0,
    'domainCert must be non-empty'
  );
  await withCertificateAuthorityCredentials(
    async ({ caKeyPath, caCertPath }) => {
      debug('caKeyPath', caKeyPath);
      debug('caCertPath', caCertPath);
      assert(existsSync(caCertPath), 'ca cert must exist');
      assert(isFile(caCertPath), 'ca cert must be a file');
      assert(existsSync(caKeyPath), 'ca key must exist');
      assert(isFile(caKeyPath), 'ca key must be a file');
      await withDomainCertificateConfig(
        commonName,
        [],
        domainCertConfigPath => {
          assert(
            existsSync(domainCertConfigPath),
            'domainCertConfigPath must exist'
          );
          assert(
            isFile(domainCertConfigPath),
            'domainCertConfigPath must be a file'
          );

          openssl(
            `ca -config "${domainCertConfigPath}" -revoke "${domainCertPath}" -keyfile "${caKeyPath}" -cert "${caCertPath}"`,
            `revoking domain certificate for ${commonName}`
          );
        }
      );
    }
  ).catch(err => {
    throw new Error(`Problem revoking certificate\n${err}`);
  });
}

// Generate a cryptographic key, used to sign certificates or certificate signing requests.
export function generateKey(filename: string): void {
  debug(`generateKey: ${filename}`);
  openssl(`genrsa -out "${filename}" 2048`, 'generating RSA key');
  chmod(filename, 400);
}
