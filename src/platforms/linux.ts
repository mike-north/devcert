import * as path from 'path';
import {
  existsSync as exists,
  readFileSync as read,
  writeFileSync as writeFile,
  existsSync
} from 'fs';
import * as createDebug from 'debug';
import { sync as commandExists } from 'command-exists';
import {
  addCertificateToNSSCertDB,
  assertNotTouchingFiles,
  openCertificateInFirefox,
  closeFirefox,
  removeCertificateFromNSSCertDB,
  HOME
} from './shared';
import { run } from '../utils';
import { Options } from '../index';
import UI from '../user-interface';
import { Platform } from '.';
import * as si from 'systeminformation';
import { UnreachableError } from '../errors';

const debug = createDebug('devcert:platforms:linux');

enum LinuxFlavor {
  Unknown = 0,
  Ubuntu,
  Rhel7,
  Fedora
}

async function determineLinuxFlavor(
  distroPromise: Promise<string> = si.osInfo().then(info => info.distro)
): Promise<{ flav: LinuxFlavor; message?: string }> {
  const distro = await distroPromise;
  switch (distro) {
    case 'Red Hat Enterprise Linux Workstation':
      return { flav: LinuxFlavor.Rhel7 };
    case 'Ubuntu':
      return { flav: LinuxFlavor.Ubuntu };
    case 'Fedora':
      return { flav: LinuxFlavor.Fedora };
    default:
      return {
        flav: LinuxFlavor.Unknown,
        message: `Unknown linux distro: ${distro}`
      };
  }
}

interface Cmd {
  command: string;
  args: string[];
}

interface LinuxFlavorDetails {
  caFolders: string[];
  postCaPlacementCommands: Cmd[];
  postCaRemovalCommands: Cmd[];
}

function linuxFlavorDetails(
  flavor: Exclude<LinuxFlavor, LinuxFlavor.Unknown>
): LinuxFlavorDetails {
  switch (flavor) {
    case LinuxFlavor.Rhel7:
    case LinuxFlavor.Fedora:
      return {
        caFolders: [
          '/etc/pki/ca-trust/source/anchors',
          '/usr/share/pki/ca-trust-source'
        ],
        postCaPlacementCommands: [
          {
            command: 'sudo',
            args: ['update-ca-trust']
          }
        ],
        postCaRemovalCommands: [
          {
            command: 'sudo',
            args: ['update-ca-trust']
          }
        ]
      };
    case LinuxFlavor.Ubuntu:
      return {
        caFolders: [
          '/etc/pki/ca-trust/source/anchors',
          '/usr/local/share/ca-certificates'
        ],
        postCaPlacementCommands: [
          {
            command: 'sudo',
            args: ['update-ca-certificates']
          }
        ],
        postCaRemovalCommands: [
          {
            command: 'sudo',
            args: ['update-ca-certificates']
          }
        ]
      };

    default:
      throw new UnreachableError(flavor, 'Unable to detect linux flavor');
  }
}
async function currentLinuxFlavorDetails(): Promise<LinuxFlavorDetails> {
  const { flav: flavor, message } = await determineLinuxFlavor();
  if (!flavor) throw new Error(message); // TODO better error
  return linuxFlavorDetails(flavor);
}

export default class LinuxPlatform implements Platform {
  private FIREFOX_NSS_DIR = path.join(HOME, '.mozilla/firefox/*');
  private CHROME_NSS_DIR = path.join(HOME, '.pki/nssdb');
  private FIREFOX_BIN_PATH = '/usr/bin/firefox';
  private CHROME_BIN_PATH = '/usr/bin/google-chrome';

  private HOST_FILE_PATH = '/etc/hosts';

  /**
   * Linux is surprisingly difficult. There seems to be multiple system-wide
   * repositories for certs, so we copy ours to each. However, Firefox does it's
   * usual separate trust store. Plus Chrome relies on the NSS tooling (like
   * Firefox), but uses the user's NSS database, unlike Firefox (which uses a
   * separate Mozilla one). And since Chrome doesn't prompt the user with a GUI
   * flow when opening certs, if we can't use certutil to install our certificate
   * into the user's NSS database, we're out of luck.
   */
  async addToTrustStores(
    certificatePath: string,
    options: Options = {}
  ): Promise<void> {
    debug('Adding devcert root CA to Linux system-wide trust stores');
    // run(`sudo cp ${ certificatePath } /etc/ssl/certs/devcert.crt`);
    const linuxInfo = await currentLinuxFlavorDetails();
    const { caFolders, postCaPlacementCommands } = linuxInfo;
    caFolders.forEach(folder => {
      run(`sudo cp "${certificatePath}" ${path.join(folder, 'devcert.crt')}`);
    });
    // run(`sudo bash -c "cat ${ certificatePath } >> /etc/ssl/certs/ca-certificates.crt"`);
    postCaPlacementCommands.forEach(({ command, args }) => {
      run(`${command} ${args.join(' ')}`.trim());
    });

    if (this.isFirefoxInstalled()) {
      // Firefox
      debug(
        'Firefox install detected: adding devcert root CA to Firefox-specific trust stores ...'
      );
      if (!commandExists('certutil')) {
        if (options.skipCertutilInstall) {
          debug(
            'NSS tooling is not already installed, and `skipCertutil` is true, so falling back to manual certificate install for Firefox'
          );
          openCertificateInFirefox(this.FIREFOX_BIN_PATH, certificatePath);
        } else {
          debug(
            'NSS tooling is not already installed. Trying to install NSS tooling now with `apt install`'
          );
          run('sudo apt install libnss3-tools');
          debug(
            'Installing certificate into Firefox trust stores using NSS tooling'
          );
          await closeFirefox();
          addCertificateToNSSCertDB(
            this.FIREFOX_NSS_DIR,
            certificatePath,
            'certutil'
          );
        }
      }
    } else {
      debug(
        'Firefox does not appear to be installed, skipping Firefox-specific steps...'
      );
    }

    if (this.isChromeInstalled()) {
      debug(
        'Chrome install detected: adding devcert root CA to Chrome trust store ...'
      );
      if (!commandExists('certutil')) {
        UI.warnChromeOnLinuxWithoutCertutil();
      } else {
        await closeFirefox();
        addCertificateToNSSCertDB(
          this.CHROME_NSS_DIR,
          certificatePath,
          'certutil'
        );
      }
    } else {
      debug(
        'Chrome does not appear to be installed, skipping Chrome-specific steps...'
      );
    }
  }

  async removeFromTrustStores(certificatePath: string): Promise<void> {
    const linuxInfo = await currentLinuxFlavorDetails();
    const { caFolders, postCaRemovalCommands } = linuxInfo;
    caFolders.forEach(folder => {
      const certPath = path.join(folder, 'devcert.crt');
      try {
        const exists = existsSync(certPath);
        debug({ exists });
        if (!exists) {
          debug(`cert at location ${certPath} was not found. Skipping...`);
          return;
        } else {
          run(`sudo rm "${certificatePath}" ${certPath}`);
          postCaRemovalCommands.forEach(({ command, args }) => {
            run(`${command} ${args.join(' ')}`.trim());
          });
        }
      } catch (e) {
        debug(
          `failed to remove ${certificatePath} from ${certPath}, continuing. ${e.toString()}`
        );
      }
    });
    // run(`sudo bash -c "cat ${ certificatePath } >> /etc/ssl/certs/ca-certificates.crt"`);

    if (commandExists('certutil')) {
      if (this.isFirefoxInstalled()) {
        removeCertificateFromNSSCertDB(
          this.FIREFOX_NSS_DIR,
          certificatePath,
          'certutil'
        );
      }
      if (this.isChromeInstalled()) {
        removeCertificateFromNSSCertDB(
          this.CHROME_NSS_DIR,
          certificatePath,
          'certutil'
        );
      }
    }
  }

  addDomainToHostFileIfMissing(domain: string): void {
    const hostsFileContents = read(this.HOST_FILE_PATH, 'utf8');
    if (!hostsFileContents.includes(domain)) {
      run(
        `echo '127.0.0.1  ${domain}' | sudo tee -a "${this.HOST_FILE_PATH}" > /dev/null`
      );
    }
  }

  deleteProtectedFiles(filepath: string): void {
    assertNotTouchingFiles(filepath, 'delete');
    run(`sudo rm -rf "${filepath}"`);
  }

  readProtectedFile(filepath: string): string {
    assertNotTouchingFiles(filepath, 'read');
    return run(`sudo cat "${filepath}"`)
      .toString()
      .trim();
  }

  writeProtectedFile(filepath: string, contents: string): void {
    assertNotTouchingFiles(filepath, 'write');
    if (exists(filepath)) {
      run(`sudo rm "${filepath}"`);
    }
    writeFile(filepath, contents);
    run(`sudo chown 0 "${filepath}"`);
    run(`sudo chmod 600 "${filepath}"`);
  }

  private isFirefoxInstalled(): boolean {
    return exists(this.FIREFOX_BIN_PATH);
  }

  private isChromeInstalled(): boolean {
    return exists(this.CHROME_BIN_PATH);
  }
}
