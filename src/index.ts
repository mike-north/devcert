/**
 * @packageDocumentation
 * Utilities for safely generating locally-trusted and machine-specific X.509 certificates for local development
 */

import {
  readFileSync as readFile,
  readdirSync as readdir,
  existsSync as exists,
  existsSync,
  writeFileSync,
  statSync,
  readFileSync
} from 'fs';
import * as execa from 'execa';
import * as createDebug from 'debug';
import { sync as commandExists } from 'command-exists';
import * as rimraf from 'rimraf';
import { version } from '../package.json';
import {
  isMac,
  isLinux,
  isWindows,
  domainsDir,
  rootCAKeyPath,
  rootCACertPath,
  DEFAULT_REMOTE_PORT
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
import { getRemoteCertificate, closeRemoteServer } from './remote-utils';
import { pki } from 'node-forge';
import { subBusinessDays } from 'date-fns';
import { pathForDomain, keyPathForDomain, certPathForDomain } from './utils';
import { Logger } from './logger';
import { Deferred } from '@mike-north/types';
import { join } from 'path';
export {
  uninstall,
  UserInterface,
  Logger,
  closeRemoteServer,
  getRemoteCertificate
};
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
  /** Number of business days before domain cert expiry before automatic revoke and renew */
  renewalBufferInBusinessDays?: number;
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

let devcertDevEnvPath: string | null = null;

// if the dotenv library (a devdep of this one) is present
if (require.resolve('dotenv')) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dotenv = require('dotenv');
  // set it up
  dotenv.config();
  const envPath = join(process.cwd(), '.env');

  // Only parse for the .env file if it exists
  if (existsSync(envPath)) {
    const parsedEnvConfig = dotenv.parse(
      readFileSync(envPath, { encoding: 'utf8' })
    );
    devcertDevEnvPath = parsedEnvConfig['___DEVCERT_DEV_PATH'];
  }
}

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
  crt: string,
  renewalBufferInBusinessDays: number
): { expireAt: Date; renewBy: Date } {
  const expireAt = _getExpireDate(crt);
  const renewBy = subBusinessDays(expireAt, renewalBufferInBusinessDays);
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

function shouldRenew(
  crt: string,
  renewalBufferInBusinessDays: number
): boolean {
  const now = new Date();
  const { expireAt, renewBy } = getExpireAndRenewalDates(
    crt,
    renewalBufferInBusinessDays
  );
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
  const { expireAt, renewBy } = getExpireAndRenewalDates(
    crt,
    renewalBufferInBusinessDays
  );
  const mustRenew = shouldRenew(crt, renewalBufferInBusinessDays);
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
    if (
      shouldRenew(
        certContents,
        options.renewalBufferInBusinessDays ??
          REMAINING_BUSINESS_DAYS_VALIDITY_BEFORE_RENEW
      )
    ) {
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
  if (options.getCaBuffer)
    ((ret as unknown) as CaBuffer).ca = readFile(rootCACertPath);
  if (options.getCaPath) ((ret as unknown) as CaPath).caPath = rootCACertPath;

  return ret;
}

function _logOrDebug(
  logger: Logger | undefined,
  type: 'log' | 'warn' | 'error',
  message: string
): void {
  if (logger && type) {
    logger[type](message);
  } else {
    debug(message);
  }
}
/**
 * Remote certificate trust options
 *
 * @public
 */
export interface TrustRemoteOptions {
  /**
   * port number for the remote server.
   */
  port: number;
  /**
   * remaining business days validity.
   */
  renewalBufferInBusinessDays: number;
  /**
   * Logger interface to suppport logging mechanism on the onsumer side.
   */
  logger?: Logger;
  /**
   * function to close the remote server.
   */
  closeRemoteFunc: typeof closeRemoteServer;
}

/**
 * Trust the certificate for a given hostname and port and add
 * the returned cert to the local trust store.
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 * @param certPath - file path to store the cert
 *
 * @internal
 */
export async function _trustCertsOnRemote(
  machineDetails: {
    hostname: string;
    port: number;
    certPath: string;
  },
  certDetails: {
    renewalBufferInBusinessDays: number;
  },
  injections = {
    getRemoteCertsFunc: getRemoteCertificate
  }
): Promise<{ mustRenew: boolean }> {
  // Get the remote certificate from the server
  debug('getting cert from remote machine');
  const certData = await injections.getRemoteCertsFunc(
    machineDetails.hostname,
    machineDetails.port
  );
  const mustRenew = shouldRenew(
    certData,
    certDetails.renewalBufferInBusinessDays
  );
  debug(
    `writing the certificate data onto local file path: ${machineDetails.certPath}`
  );

  // Write the certificate data on this file.
  writeFileSync(machineDetails.certPath, certData);

  // Trust the remote cert on your local box
  await currentPlatform.addToTrustStores(machineDetails.certPath);
  debug('Certificate trusted successfully');
  return { mustRenew };
}
/**
 * Trust the remote hosts's certificate on local machine.
 * This function would ssh into the remote host, get the certificate
 * and trust the local machine from where this function is getting called from.
 * @public
 * @param hostname - hostname of the remote machine
 * @param certPath - file path to store the cert
 * @param TrustRemoteOptions - TrustRemoteOptions options
 */
export async function trustRemoteMachine(
  hostname: string,
  certPath: string,
  {
    port = DEFAULT_REMOTE_PORT,
    renewalBufferInBusinessDays = REMAINING_BUSINESS_DAYS_VALIDITY_BEFORE_RENEW,
    logger
  }: Partial<TrustRemoteOptions> = {}
): Promise<{ mustRenew: boolean }> {
  debug('fetching/generating domain cert data for connecting to remote');
  const returnInfo = new Deferred<{ mustRenew: boolean }>();
  const { cert, key } = await certificateFor(
    'devcert-domain-cert',
    [hostname],
    {
      skipHostsFile: true
    }
  );
  const certData = cert.toString();
  const keyData = key.toString();
  let devcertCLICommand = `npx @mike-north/devcert-patched@${version}`;
  if (devcertDevEnvPath) {
    debug(
      `Found ___DEVCERT_DEV_PATH as an environment variable, running in dev mode with ${devcertDevEnvPath} as the location of devcert on the remote machine`
    );
    devcertCLICommand = `DEBUG=* node ${join(
      devcertDevEnvPath,
      'bin',
      'devcert.js'
    )}`;
  }

  _logOrDebug(logger, 'log', `Connecting to remote host ${hostname} via ssh`);

  const command = [
    hostname,
    devcertCLICommand,
    'remote',
    '--remote',
    '--port',
    `'${port}'`,
    '--cert',
    `'${JSON.stringify(certData)}'`,
    '--key',
    `'${JSON.stringify(keyData)}'`
  ];

  const child = execa(`ssh`, command, {
    detached: false
  });
  // Error handling for missing handles on child process.
  if (!child.stderr) {
    throw new Error('Missing stderr on child process');
  }
  if (!child.stdout) {
    throw new Error('Missing stdout on child process');
  }

  // Throw any error that might have occurred on the remote side.
  child.stderr.on('data', (data: execa.StdIOOption) => {
    if (data) {
      const stdErrData = data.toString().trim();
      debug(stdErrData);
      if (stdErrData.toLowerCase().includes('error')) {
        closeRemoteServer(hostname, port);
        throw new Error(
          `Problem while attempting to setup devcert remotely.\n${stdErrData}`
        );
      }
    } else {
      debug('Stderr: {}');
    }
  });

  // Listen to the stdout stream and determine the appropriate steps.
  _logOrDebug(
    logger,
    'log',
    `Attempting to start the server at port ${port}. This may take a while...`
  );
  child.stdout.on('data', (data: execa.StdIOOption) => {
    if (data) {
      const stdoutData = data.toString().trim();
      if (stdoutData.includes(`STATE: READY_FOR_CONNECTION`)) {
        _logOrDebug(
          logger,
          'log',
          `Connected to remote host ${hostname} via ssh successfully`
        );
        // Once certs are trusted, close the remote server and cleanup.
        _trustRemoteMachine(hostname, certPath, {
          port,
          renewalBufferInBusinessDays,
          logger
        })
          .then(mustRenew => {
            debug(
              `Certs trusted successfully, the value of mustRenew is ${mustRenew}`
            );
            // return the certificate renewal state to the consumer to handle the
            // renewal usecase.
            return { mustRenew };
          })
          .catch(err => {
            child.kill();
            throw new Error(err);
          })
          .then(returnInfo.resolve)
          .catch(returnInfo.reject);
      } else if (stdoutData.includes('REMOTE_CONNECTION_CLOSED')) {
        _logOrDebug(logger, 'log', 'Remote server closed successfully');
      }
    } else {
      debug('stdout: {}');
    }
  });

  return await returnInfo.promise;
}

/**
 * For a given hostname and certpath,gets the certificate from the remote server,
 * stores it at the provided certPath,
 * trusts certificate from remote machine and closes the remote server.
 *
 * @param hostname - hostname of the remote machine
 * @param certPath - file path to store the cert
 * @param TrustRemoteOptions - TrustRemoteOptions options
 *
 * @internal
 */
export async function _trustRemoteMachine(
  hostname: string,
  certPath: string,
  {
    port = DEFAULT_REMOTE_PORT,
    renewalBufferInBusinessDays = REMAINING_BUSINESS_DAYS_VALIDITY_BEFORE_RENEW,
    logger,
    closeRemoteFunc = closeRemoteServer
  }: Partial<TrustRemoteOptions> = {},
  trustCertsOnRemoteFunc = _trustCertsOnRemote
): Promise<boolean> {
  try {
    _logOrDebug(
      logger,
      'log',
      'Attempting to trust the remote certificate on this machine'
    );
    // Trust the certs
    const { mustRenew } = await trustCertsOnRemoteFunc(
      { hostname, port, certPath },
      {
        renewalBufferInBusinessDays
      }
    );
    _logOrDebug(logger, 'log', 'Certificate trusted successfully');
    // return the certificate renewal state to the consumer to handle the
    // renewal usecase.
    return mustRenew;
  } finally {
    _logOrDebug(logger, 'log', 'Attempting to close the remote server');
    // Close the remote server and cleanup always.
    const remoteServerResponse = await closeRemoteFunc(hostname, port);
    debug(remoteServerResponse);
  }
}
/**
 * Untrust the certificate for a given file path.
 * @public
 * @param filePath - file path of the cert
 */
export function untrustMachineByCertificate(certPath: string): void {
  currentPlatform.removeFromTrustStores(certPath);
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
