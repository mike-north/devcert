import { execSync, ExecSyncOptions } from 'child_process';
import * as tmp from 'tmp';
import * as createDebug from 'debug';
import * as path from 'path';
import sudoPrompt from 'sudo-prompt';

import { configPath } from './constants';

const debug = createDebug('devcert:util');

export function openssl(cmd: string): string {
  return run(`openssl ${cmd}`, {
    stdio: 'pipe',
    env: Object.assign(
      {
        RANDFILE: path.join(configPath('.rnd'))
      },
      process.env
    )
  }).toString();
}

export function run(cmd: string, options: ExecSyncOptions = {}): string {
  debug(`exec: \`${cmd}\``);
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

export function mktmp(): string {
  // discardDescriptor because windows complains the file is in use if we create a tmp file
  // and then shell out to a process that tries to use it
  return tmp.fileSync({ discardDescriptor: true }).name;
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
