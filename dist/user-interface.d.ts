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
declare const DefaultUI: UserInterface;
export default DefaultUI;
