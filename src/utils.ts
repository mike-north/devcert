import { execSync, ExecSyncOptions } from 'child_process';
import * as tmp from 'tmp';
import * as createDebug from 'debug';
import * as path from 'path';
import sudoPrompt from 'sudo-prompt';
import * as execa from 'execa';
import * as assert from 'assert';
import * as chalk from 'chalk';

import { makeConfigPath, DOMAINS_DIR } from './constants';
import { existsSync } from 'fs';

const debug = createDebug('devcert:util');

export function openssl(cmd: string, description: string): string {
  try {
    return run(`openssl ${cmd}`, {
      stdio: 'pipe',
      env: Object.assign(
        {
          RANDFILE: path.join(makeConfigPath('.rnd'))
        },
        process.env
      )
    }).toString();
  } catch (err) {
    throw new Error(`OpenSSL errored while performing: ${description}\n${err}`);
  }
}

export function run(cmd: string, options: ExecSyncOptions = {}): string {
  debug(`exec: ${chalk.yellowBright(cmd)}`);
  return execSync(cmd, options).toString();
}

export function waitForUser(): Promise<void> {
  return new Promise(resolve => {
    process.stdin.resume();
    process.stdin.on('data', resolve);
  });
}

export function reportableError(message: string): Error {
  return new Error(
    `${message} | This is a bug in devcert, please report the issue at https://github.com/davewasmer/devcert/issues`
  );
}

export function tmpDir(): tmp.SynchrounousResult {
  // discardDescriptor because windows complains the file is in use if we create a tmp file
  // and then shell out to a process that tries to use it
  return tmp.dirSync({ discardDescriptor: true });
}

export function sudo(cmd: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    sudoPrompt.exec(
      cmd,
      { name: 'devcert' },
      (err: Error | null, stdout: string | null, stderr: string | null) => {
        const error =
          err ||
          (typeof stderr === 'string' &&
            stderr.trim().length > 0 &&
            new Error(stderr));
        error ? reject(error) : resolve(stdout);
      }
    );
  });
}

export function hasSudo(): boolean {
  try {
    execa.commandSync('sudo -n true');
    return true;
  } catch (e) {
    if (!(e && e.stderr.trim() === 'sudo: a password is required'))
      throw new Error(
        `Unexpected error while trying to detect sudo elevation: ${e}`
      );
    return false;
  }
}
export function pathForDomain(
  domain: string,
  ...pathSegments: string[]
): string {
  assert(typeof DOMAINS_DIR === 'string', 'domainsDir must be a string');
  assert(DOMAINS_DIR.length > 0, 'domainsDir must be > 0 length');
  return path.join(DOMAINS_DIR, domain, ...pathSegments);
}

export function certPathForDomain(commonName: string): string {
  assert(typeof commonName === 'string', 'commonName must be a string');
  assert(commonName.length > 0, 'commonName must be > 0 length');
  return pathForDomain(commonName, `certificate.crt`);
}

export function keyPathForDomain(commonName: string): string {
  assert(typeof commonName === 'string', 'commonName must be a string');
  assert(commonName.length > 0, 'commonName must be > 0 length');
  return pathForDomain(commonName, `private-key.key`);
}

export function hasCertificateFor(commonName: string): boolean {
  assert(typeof commonName === 'string', 'commonName must be a string');
  assert(commonName.length > 0, 'commonName must be > 0 length');
  return existsSync(certPathForDomain(commonName));
}
