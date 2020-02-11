import passwordPrompt from 'password-prompt';
import { waitForUser } from './utils';

export interface UserInterface {
  getWindowsEncryptionPassword(): string | Promise<string>;
  warnChromeOnLinuxWithoutCertutil(): void | Promise<void>;
  closeFirefoxBeforeContinuing(): void | Promise<void>;
  startFirefoxWizard(certificateHost: string): void | Promise<void>;
  firefoxWizardPromptPage(certificateURL: string): string | Promise<string>;
  waitForFirefoxWizard(): void | Promise<void>;
}

const DefaultUI: UserInterface = {
  async getWindowsEncryptionPassword() {
    return await passwordPrompt(
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
