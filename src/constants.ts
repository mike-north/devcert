import * as path from 'path';
import {
  writeFileSync as writeFile,
  readFileSync as readFile,
  unlinkSync
} from 'fs';
import { sync as mkdirp } from 'mkdirp';
import { template as makeTemplate } from 'lodash';
import * as eol from 'eol';
import { tmpDir, pathForDomain } from './utils';
import applicationConfigPath = require('application-config-path');
import * as _createDebug from 'debug';

const debug = _createDebug('devcert:constants');

// Platform shortcuts
export const IS_MAC = process.platform === 'darwin';
export const IS_LINUX = process.platform === 'linux';
export const IS_WINDOWS = process.platform === 'win32';

// Common paths
export const CONFIG_DIR = applicationConfigPath('devcert');

export const makeConfigPath: (
  ...pathSegments: string[]
) => string = path.join.bind(path, CONFIG_DIR);

export const DEFAULT_REMOTE_PORT = 2702;

export const DOMAINS_DIR = makeConfigPath('domains');

export const CA_VERSION_FILE_PATH = makeConfigPath('devcert-ca-version');
export const OPENSSL_SERIAL_FILE_PATH = makeConfigPath(
  'certificate-authority',
  'serial'
);
export const OPENSSL_DB_PATH = makeConfigPath(
  'certificate-authority',
  'index.txt'
);
export const OPENSSL_CONFIG_DIR = path.join(
  __dirname,
  '../../openssl-configurations/'
);
export const CA_SELF_SIGN_CONFIG_PATH = path.join(
  OPENSSL_CONFIG_DIR,
  'certificate-authority-self-signing.conf'
);

function includeWildcards(list: string[]): string[] {
  return list.reduce((outlist, item) => {
    outlist.push(item, `*.${item}`);
    return outlist;
  }, [] as string[]);
}

export async function withDomainSigningRequestConfig(
  commonName: string,
  { alternativeNames }: { alternativeNames: string[] },
  cb: (filepath: string) => Promise<void> | void
): Promise<void> {
  const tmp = tmpDir();
  const tmpFile = path.join(
    tmp.name,
    'domain-certificate-signing-requests.conf'
  );
  const source = readFile(
    path.join(OPENSSL_CONFIG_DIR, 'domain-certificate-signing-requests.conf'),
    'utf-8'
  );
  const template = makeTemplate(source);
  const result = template({
    commonName,
    altNames: includeWildcards([commonName, ...alternativeNames])
  });
  writeFile(tmpFile, eol.auto(result));
  await cb(tmpFile);
  unlinkSync(tmpFile);
  tmp.removeCallback();
}

export async function withDomainCertificateConfig(
  commonName: string,
  alternativeNames: string[],
  cb: (filepath: string) => Promise<void> | void
): Promise<void> {
  const tmp = tmpDir();
  const tmpFile = path.join(tmp.name, 'ca.cfg');
  const source = readFile(
    path.join(OPENSSL_CONFIG_DIR, 'domain-certificates.conf'),
    'utf-8'
  );
  const template = makeTemplate(source);
  const result = template({
    commonName,
    altNames: includeWildcards([commonName, ...alternativeNames]),
    serialFile: OPENSSL_SERIAL_FILE_PATH,
    databaseFile: OPENSSL_DB_PATH,
    domainDir: pathForDomain(commonName)
  });
  writeFile(tmpFile, eol.auto(result));
  await cb(tmpFile);
  unlinkSync(tmpFile);
  tmp.removeCallback();
}

// confTemplate = confTemplate.replace(/DATABASE_PATH/, configPath('index.txt').replace(/\\/g, '\\\\'));
// confTemplate = confTemplate.replace(/SERIAL_PATH/, configPath('serial').replace(/\\/g, '\\\\'));
// confTemplate = eol.auto(confTemplate);

export const ROOT_CA_DIR = makeConfigPath('certificate-authority');
export const ROOT_CA_KEY_PATH = path.join(ROOT_CA_DIR, 'private-key.key');
export const ROOT_CA_CERT_PATH = path.join(ROOT_CA_DIR, 'certificate.cert');

debug('rootCACertPath', ROOT_CA_CERT_PATH);
debug('rootCAKeyPath', ROOT_CA_KEY_PATH);
debug('rootCADir', ROOT_CA_DIR);

// Exposed for uninstallation purposes.
export function getLegacyConfigDir(): string {
  if (IS_WINDOWS && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'devcert', 'config');
  } else {
    const uid = process.getuid && process.getuid();
    const userHome =
      IS_LINUX && uid === 0
        ? path.resolve('/usr/local/share')
        : require('os').homedir();
    return path.join(userHome, '.config', 'devcert');
  }
}

export function ensureConfigDirs(): void {
  mkdirp(CONFIG_DIR);
  mkdirp(DOMAINS_DIR);
  mkdirp(ROOT_CA_DIR);
}

ensureConfigDirs();
