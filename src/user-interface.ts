// Note that ES6 modules cannot directly export class objects.
import prompt = require('password-prompt');
import { waitForUser } from './utils';

/**
 * A representation of several parts of the local system that the user interacts with
 * @public
 */
export interface UserInterface {
  /** Get the disk encryption password (windows only) */
  getWindowsEncryptionPassword(): string | Promise<string>;
  /** Deliver a warning to the user without using certutil (linux only) */
  warnChromeOnLinuxWithoutCertutil(): void | Promise<void>;
  /** Close firefox */
  closeFirefoxBeforeContinuing(): void | Promise<void>;
  /** Begin the process of approving a cert through firefix */
  startFirefoxWizard(certificateHost: string): void | Promise<void>;
  /** Load the cert approval page in the user's local firefox */
  firefoxWizardPromptPage(certificateURL: string): string | Promise<string>;
  /** Wait for the user to complete the firefox cert approval wizard */
  waitForFirefoxWizard(): void | Promise<void>;
}

const DefaultUI: UserInterface = {
  async getWindowsEncryptionPassword() {
    return await prompt(
      'devcert password (http://bit.ly/devcert-what-password?):'
    );
  },
  warnChromeOnLinuxWithoutCertutil() {
    console.warn(`
      WARNING: It looks like you have Chrome installed, but you specified
      'skipCertutilInstall: true'. Unfortunately, without installing
      certutil, it's impossible get Chrome to trust devcert's certificates
      The certificates will work, but Chrome will continue to warn you that
      they are untrusted.
    `);
  },
  closeFirefoxBeforeContinuing() {
    console.log('Please close Firefox before continuing');
  },
  async startFirefoxWizard(certificateHost) {
    console.log(`
      devcert was unable to automatically configure Firefox. You'll need to
      complete this process manually. Don't worry though - Firefox will walk
      you through it.

      When you're ready, hit any key to continue. Firefox will launch and
      display a wizard to walk you through how to trust the devcert
      certificate. When you are finished, come back here and we'll finish up.

      (If Firefox doesn't start, go ahead and start it and navigate to
      ${certificateHost} in a new tab.)

      If you are curious about why all this is necessary, check out
      https://github.com/davewasmer/devcert#how-it-works

      <Press any key to launch Firefox wizard>
    `);
    await waitForUser();
  },
  firefoxWizardPromptPage(certificateURL: string) {
    return `
      <html>
        <head>
          <meta http-equiv="refresh" content="0; url=${certificateURL}" />
        </head>
      </html>
    `;
  },
  async waitForFirefoxWizard() {
    console.log(`
      Launching Firefox ...

      Great! Once you've finished the Firefox wizard for adding the devcert
      certificate, just hit any key here again and we'll wrap up.

      <Press any key to continue>
    `);
    await waitForUser();
  }
};

export default DefaultUI;
