/**
 * @packageDocumentation
 * Utilities for safely generating locally-trusted and machine-specific X.509 certificates for local development
 */

import {
  readFileSync as readFile,
  readdirSync as readdir,
  existsSync as exists,
  existsSync,
  statSync
} from 'fs';
import * as createDebug from 'debug';
import { sync as commandExists } from 'command-exists';
import * as rimraf from 'rimraf';
import {
  isMac,
  isLinux,
  isWindows,
  domainsDir,
  rootCAKeyPath,
  rootCACertPath
} from './constants';
import currentPlatform from './platforms';
import installCertificateAuthority, {
  ensureCACertReadable,
  uninstall
} from './certificate-authority';
import {
  generateDomainCertificate,
  revokeDomainCertificate
} from './certificates';
import UI, { UserInterface } from './user-interface';
import { pki } from 'node-forge';
import { subBusinessDays } from 'date-fns';
import { pathForDomain, keyPathForDomain, certPathForDomain } from './utils';
export { uninstall, UserInterface };

const debug = createDebug('devcert');

const REMAINING_BUSINESS_DAYS_VALIDITY_BEFORE_RENEW = 5;

/**
 * Certificate options
 * @public
 */
export interface CertOptions {
  /** Number of days before the CA expires */
  caCertExpiry: number;
  /** Number of days before the domain certificate expires */
  domainCertExpiry: number;
}
/**
 * Cert generation options
 *
 * @public
 */
export interface Options /* extends Partial<ICaBufferOpts & ICaPathOpts>  */ {
  /** Return the CA certificate data? */
  getCaBuffer?: boolean;
  /** Return the path to the CA certificate? */
  getCaPath?: boolean;
  /** If `certutil` is not installed already (for updating nss databases; e.g. firefox), do not attempt to install it */
  skipCertutilInstall?: boolean;
  /** Do not update your systems host file with the domain name of the certificate */
  skipHostsFile?: boolean;
  /** User interface hooks */
  ui?: UserInterface;
}
/**
 * The CA public key as a buffer
 * @public
 */
export interface CaBuffer {
  /** CA public key */
  ca: Buffer;
}
/**
 * The cert authority's path on disk
 * @public
 */
export interface CaPath {
  /** CA cert path on disk */
  caPath: string;
}
/**
 * Domain cert public and private keys as buffers
 * @public
 */
export interface DomainData {
  /** private key */
  key: Buffer;
  /** public key (cert) */
  cert: Buffer;
}
/**
 * A return value containing the CA public key
 * @public
 */
export type IReturnCa<O extends Options> = O['getCaBuffer'] extends true
  ? CaBuffer
  : false;
/**
 * A return value containing the CA path on disk
 * @public
 */
export type IReturnCaPath<O extends Options> = O['getCaPath'] extends true
  ? CaPath
  : false;
/**
 * A return value containing the CA public key, CA path on disk, and domain cert info
 * @public
 */
export type IReturnData<O extends Options = {}> = DomainData &
  IReturnCa<O> &
  IReturnCaPath<O>;

const DEFAULT_CERT_OPTIONS: CertOptions = {
  caCertExpiry: 180,
  domainCertExpiry: 30
};

/**
 * Request an SSL certificate for the given app name signed by the devcert root
 * certificate authority. If devcert has previously generated a certificate for
 * that app name on this machine, it will reuse that certificate.
 *
 * If this is the first time devcert is being run on this machine, it will
 * generate and attempt to install a root certificate authority.
 *
 * If `options.getCaBuffer` is true, return value will include the ca certificate data
 * as \{ ca: Buffer \}
 *
 * If `options.getCaPath` is true, return value will include the ca certificate path
 * as \{ caPath: string \}
 *
 * @public
 * @param commonName - common name for certificate
 * @param alternativeNames - alternate names for the certificate
 * @param options - cert generation options
 * @param partialCertOptions - certificate options
 */
export async function certificateFor<
  O extends Options,
  CO extends Partial<CertOptions>
>(
  commonName: string,
  alternativeNames: string[],
  options?: O,
  partialCertOptions?: CO
): Promise<IReturnData<O>>;

/**
 * {@inheritdoc (certificateFor:1)}
 * @public
 */
export async function certificateFor<
  O extends Options,
  CO extends Partial<CertOptions>
>(
  commonName: string,
  options?: O,
  partialCertOptions?: CO
): Promise<IReturnData<O>>;
export async function certificateFor<
  O extends Options,
  CO extends Partial<CertOptions>
>(
  commonName: string,
  optionsOrAlternativeNames: string[] | O,
  options?: O,
  partialCertOptions?: CO
): Promise<IReturnData<O>> {
  if (Array.isArray(optionsOrAlternativeNames)) {
    return certificateForImpl(
      commonName,
      optionsOrAlternativeNames,
      options,
      partialCertOptions
    );
  } else {
    return certificateForImpl(commonName, [], options, partialCertOptions);
  }
}

function getExpireAndRenewalDates(
  crt: string
): { expireAt: Date; renewBy: Date } {
  const expireAt = _getExpireDate(crt);
  const renewBy = subBusinessDays(
    expireAt,
    REMAINING_BUSINESS_DAYS_VALIDITY_BEFORE_RENEW
  );
  return { expireAt, renewBy };
}

function getCertPortionOfPemString(crt: string): string {
  const beginStr = '-----BEGIN CERTIFICATE-----';
  const endStr = '-----END CERTIFICATE-----';
  const begin = crt.indexOf(beginStr);
  const end = crt.indexOf(endStr);
  if (begin < 0 || end < 0)
    throw new Error(
      `Improperly formatted PEM file. Expected to find ${beginStr} and ${endStr}
"${crt}"`
    );

  const certContent = crt.substr(begin, end - begin + endStr.length);
  return certContent;
}

function _getExpireDate(crt: string): Date {
  const certInfo = pki.certificateFromPem(crt);
  const { notAfter } = certInfo.validity;
  return notAfter;
}

function shouldRenew(crt: string): boolean {
  const now = new Date();
  const { expireAt, renewBy } = getExpireAndRenewalDates(crt);
  debug(
    `evaluating cert renewal\n- now:\t${now.toDateString()}\n- renew at:\t${renewBy.toDateString()}\n- expire at:\t${expireAt.toDateString()}`
  );
  return now.valueOf() >= renewBy.valueOf();
}

/**
 * Get the expiration and recommended renewal dates, for the latest issued
 * cert for a given common_name
 *
 * @alpha
 * @param commonName - common_name of cert whose expiration info is desired
 * @param renewalBufferInBusinessDays - number of business days before cert expiration, to start indicating that it should be renewed
 */
export function getCertExpirationInfo(
  commonName: string,
  renewalBufferInBusinessDays = REMAINING_BUSINESS_DAYS_VALIDITY_BEFORE_RENEW
): { mustRenew: boolean; renewBy: Date; expireAt: Date } {
  const domainCertPath = pathForDomain(commonName, `certificate.crt`);
  if (!exists(domainCertPath))
    throw new Error(`cert for ${commonName} was not found`);
  const domainCert = readFile(domainCertPath).toString();
  if (!domainCert) {
    throw new Error(`No certificate for ${commonName} exists`);
  }
  const crt = getCertPortionOfPemString(domainCert);
  const { expireAt, renewBy } = getExpireAndRenewalDates(crt);
  const mustRenew = shouldRenew(crt);
  return { mustRenew, expireAt, renewBy };
}

async function certificateForImpl<
  O extends Options,
  CO extends Partial<CertOptions>
>(
  commonName: string,
  alternativeNames: string[],
  options: O = {} as O,
  partialCertOptions: CO = {} as CO
): Promise<IReturnData<O>> {
  debug(
    `Certificate requested for ${commonName}. Skipping certutil install: ${Boolean(
      options.skipCertutilInstall
    )}. Skipping hosts file: ${Boolean(options.skipHostsFile)}`
  );
  const certOptions: CertOptions = {
    ...DEFAULT_CERT_OPTIONS,
    ...partialCertOptions
  };
  if (options.ui) {
    Object.assign(UI, options.ui);
  }

  if (!isMac && !isLinux && !isWindows) {
    throw new Error(`Platform not supported: "${process.platform}"`);
  }

  if (!commandExists('openssl')) {
    throw new Error(
      'OpenSSL not found: OpenSSL is required to generate SSL certificates - make sure it is installed and available in your PATH'
    );
  }

  const domainKeyPath = keyPathForDomain(commonName);
  const domainCertPath = certPathForDomain(commonName);

  if (!exists(rootCAKeyPath)) {
    debug(
      'Root CA is not installed yet, so it must be our first run. Installing root CA ...'
    );
    await installCertificateAuthority(options, certOptions);
  } else if (options.getCaBuffer || options.getCaPath) {
    debug(
      'Root CA is not readable, but it probably is because an earlier version of devcert locked it. Trying to fix...'
    );
    await ensureCACertReadable(options, certOptions);
  }

  if (!exists(domainCertPath)) {
    debug(
      `Can't find certificate file for ${commonName}, so it must be the first request for ${commonName}. Generating and caching ...`
    );
    await generateDomainCertificate(commonName, alternativeNames, certOptions);
  } else {
    const certContents = getCertPortionOfPemString(
      readFile(domainCertPath).toString()
    );
    const expireDate = _getExpireDate(certContents);
    if (shouldRenew(certContents)) {
      debug(
        `Certificate for ${commonName} was close to expiring (on ${expireDate.toDateString()}). A fresh certificate will be generated for you`
      );
      await removeAndRevokeDomainCert(commonName);
      await generateDomainCertificate(
        commonName,
        alternativeNames,
        certOptions
      );
    } else {
      debug(
        `Certificate for ${commonName} was not close to expiring (on ${expireDate.toDateString()}).`
      );
    }
  }

  if (!options.skipHostsFile) {
    await currentPlatform.addDomainToHostFileIfMissing(commonName);
  }

  debug(`Returning domain certificate`);

  const ret = {
    key: readFile(domainKeyPath),
    cert: readFile(domainCertPath)
  } as IReturnData<O>;
  if (options.getCaBuffer) (ret as CaBuffer).ca = readFile(rootCACertPath);
  if (options.getCaPath) (ret as CaPath).caPath = rootCACertPath;

  return ret;
}

/**
 * Check whether a certificate with a given common_name has been installed
 *
 * @public
 * @param commonName - commonName of certificate whose existence is being checked
 */
export function hasCertificateFor(commonName: string): boolean {
  return exists(pathForDomain(commonName, `certificate.crt`));
}

/**
 * Get a list of domains that certifiates have been generated for
 * @alpha
 */
export function configuredDomains(): string[] {
  return readdir(domainsDir);
}

/**
 * Remove a certificate
 * @public
 * @param commonName - commonName of cert to remove
 * @deprecated please use {@link removeAndRevokeDomainCert | removeAndRevokeDomainCert} to ensure that the OpenSSL cert removal is handled properly
 */
export function removeDomain(commonName: string): void {
  rimraf.sync(pathForDomain(commonName));
}

/**
 * Remove a certificate and revoke it from the OpenSSL cert database
 * @public
 * @param commonName - commonName of cert to remove
 */
export async function removeAndRevokeDomainCert(
  commonName: string
): Promise<void> {
  debug(`removing domain certificate for ${commonName}`);
  const certFolderPath = pathForDomain(commonName);
  const domainCertPath = certPathForDomain(commonName);
  if (existsSync(certFolderPath)) {
    debug(`cert found on disk for ${commonName}`);
    // revoke the cert
    debug(`revoking cert ${commonName}`);
    await revokeDomainCertificate(commonName);
    // delete the cert file
    debug(
      `deleting cert on disk for ${commonName} - ${
        statSync(domainCertPath).size
      }`
    );
    removeDomain(commonName);
    debug(
      `deleted cert on disk for ${commonName} - ${existsSync(domainCertPath)}`
    );
  } else debug(`cert not found on disk ${commonName}`);
  debug(`completed removing domain certificate for ${commonName}`);
}
