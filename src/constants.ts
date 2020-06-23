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
export const isMac = process.platform === 'darwin';
export const isLinux = process.platform === 'linux';
export const isWindows = process.platform === 'win32';

// Common paths
export const configDir = applicationConfigPath('devcert');
export const configPath: (...pathSegments: string[]) => string = path.join.bind(
  path,
  configDir
);

export const DEFAULT_REMOTE_PORT = 2702;

export const domainsDir = configPath('domains');

export const caVersionFile = configPath('devcert-ca-version');
export const opensslSerialFilePath = configPath(
  'certificate-authority',
  'serial'
);
export const opensslDatabaseFilePath = configPath(
  'certificate-authority',
  'index.txt'
);
export const caSelfSignConfig = path.join(
  __dirname,
  '../openssl-configurations/certificate-authority-self-signing.conf'
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
    path.join(
      __dirname,
      '../openssl-configurations/domain-certificate-signing-requests.conf'
    ),
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
    path.join(__dirname, '../openssl-configurations/domain-certificates.conf'),
    'utf-8'
  );
  const template = makeTemplate(source);
  const result = template({
    commonName,
    altNames: includeWildcards([commonName, ...alternativeNames]),
    serialFile: opensslSerialFilePath,
    databaseFile: opensslDatabaseFilePath,
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

export const rootCADir = configPath('certificate-authority');
export const rootCAKeyPath = path.join(rootCADir, 'private-key.key');
export const rootCACertPath = path.join(rootCADir, 'certificate.cert');

debug('rootCACertPath', rootCACertPath);
debug('rootCAKeyPath', rootCAKeyPath);
debug('rootCADir', rootCADir);

// Exposed for uninstallation purposes.
export function getLegacyConfigDir(): string {
  if (isWindows && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'devcert', 'config');
  } else {
    const uid = process.getuid && process.getuid();
    const userHome =
      isLinux && uid === 0
        ? path.resolve('/usr/local/share')
        : require('os').homedir();
    return path.join(userHome, '.config', 'devcert');
  }
}

export function ensureConfigDirs(): void {
  mkdirp(configDir);
  mkdirp(domainsDir);
  mkdirp(rootCADir);
}

ensureConfigDirs();
