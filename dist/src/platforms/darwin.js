"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs_1 = require("fs");
const createDebug = require("debug");
const command_exists_1 = require("command-exists");
const utils_1 = require("../utils");
const shared_1 = require("./shared");
const debug = createDebug('devcert:platforms:macos');
const getCertUtilPath = () => path.join(utils_1.run('brew --prefix nss')
    .toString()
    .trim(), 'bin', 'certutil');
class MacOSPlatform {
    constructor() {
        this.FIREFOX_BUNDLE_PATH = '/Applications/Firefox.app';
        this.FIREFOX_BIN_PATH = path.join(this.FIREFOX_BUNDLE_PATH, 'Contents/MacOS/firefox');
        this.FIREFOX_NSS_DIR = path.join(shared_1.HOME, 'Library/Application Support/Firefox/Profiles/*');
        this.HOST_FILE_PATH = '/etc/hosts';
    }
    /**
     * macOS is pretty simple - just add the certificate to the system keychain,
     * and most applications will delegate to that for determining trusted
     * certificates. Firefox, of course, does it's own thing. We can try to
     * automatically install the cert with Firefox if we can use certutil via the
     * `nss` Homebrew package, otherwise we go manual with user-facing prompts.
     */
    async addToTrustStores(certificatePath, options = {}) {
        // Chrome, Safari, system utils
        debug('Adding devcert root CA to macOS system keychain');
        utils_1.run(`sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain -p ssl -p basic "${certificatePath}"`);
        if (this.isFirefoxInstalled()) {
            // Try to use certutil to install the cert automatically
            debug('Firefox install detected. Adding devcert root CA to Firefox trust store');
            if (!this.isNSSInstalled()) {
                if (!options.skipCertutilInstall) {
                    if (command_exists_1.sync('brew')) {
                        debug(`certutil is not already installed, but Homebrew is detected. Trying to install certutil via Homebrew...`);
                        utils_1.run('brew install nss');
                    }
                    else {
                        debug(`Homebrew isn't installed, so we can't try to install certutil. Falling back to manual certificate install`);
                        return await shared_1.openCertificateInFirefox(this.FIREFOX_BIN_PATH, certificatePath);
                    }
                }
                else {
                    debug(`certutil is not already installed, and skipCertutilInstall is true, so we have to fall back to a manual install`);
                    return await shared_1.openCertificateInFirefox(this.FIREFOX_BIN_PATH, certificatePath);
                }
            }
            await shared_1.closeFirefox();
            shared_1.addCertificateToNSSCertDB(this.FIREFOX_NSS_DIR, certificatePath, getCertUtilPath());
        }
        else {
            debug('Firefox does not appear to be installed, skipping Firefox-specific steps...');
        }
    }
    removeFromTrustStores(certificatePath) {
        debug('Removing devcert root CA from macOS system keychain');
        try {
            if (fs_1.existsSync(certificatePath)) {
                utils_1.run(`sudo security remove-trusted-cert -d "${certificatePath}"`);
            }
        }
        catch (e) {
            debug(`failed to remove ${certificatePath} from macOS cert store, continuing. ${e.toString()}`);
        }
        if (this.isFirefoxInstalled() && this.isNSSInstalled()) {
            debug('Firefox install and certutil install detected. Trying to remove root CA from Firefox NSS databases');
            shared_1.removeCertificateFromNSSCertDB(this.FIREFOX_NSS_DIR, certificatePath, getCertUtilPath());
        }
    }
    addDomainToHostFileIfMissing(domain) {
        const hostsFileContents = fs_1.readFileSync(this.HOST_FILE_PATH, 'utf8');
        if (!hostsFileContents.includes(domain)) {
            utils_1.run(`echo '\n127.0.0.1 ${domain}' | sudo tee -a "${this.HOST_FILE_PATH}" > /dev/null`);
        }
    }
    deleteProtectedFiles(filepath) {
        shared_1.assertNotTouchingFiles(filepath, 'delete');
        utils_1.run(`sudo rm -rf "${filepath}"`);
    }
    readProtectedFile(filepath) {
        shared_1.assertNotTouchingFiles(filepath, 'read');
        return utils_1.run(`sudo cat "${filepath}"`)
            .toString()
            .trim();
    }
    writeProtectedFile(filepath, contents) {
        shared_1.assertNotTouchingFiles(filepath, 'write');
        if (fs_1.existsSync(filepath)) {
            utils_1.run(`sudo rm "${filepath}"`);
        }
        fs_1.writeFileSync(filepath, contents);
        utils_1.run(`sudo chown 0 "${filepath}"`);
        utils_1.run(`sudo chmod 600 "${filepath}"`);
    }
    isFirefoxInstalled() {
        return fs_1.existsSync(this.FIREFOX_BUNDLE_PATH);
    }
    isNSSInstalled() {
        try {
            return utils_1.run('brew list -1')
                .toString()
                .includes('\nnss\n');
        }
        catch (e) {
            return false;
        }
    }
}
exports.default = MacOSPlatform;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGFyd2luLmpzIiwic291cmNlUm9vdCI6Ii4vIiwic291cmNlcyI6WyJzcmMvcGxhdGZvcm1zL2Rhcndpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDZCQUE2QjtBQUM3QiwyQkFLWTtBQUNaLHFDQUFxQztBQUNyQyxtREFBdUQ7QUFDdkQsb0NBQStCO0FBRS9CLHFDQU9rQjtBQUdsQixNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMseUJBQXlCLENBQUMsQ0FBQztBQUVyRCxNQUFNLGVBQWUsR0FBRyxHQUFXLEVBQUUsQ0FDbkMsSUFBSSxDQUFDLElBQUksQ0FDUCxXQUFHLENBQUMsbUJBQW1CLENBQUM7S0FDckIsUUFBUSxFQUFFO0tBQ1YsSUFBSSxFQUFFLEVBQ1QsS0FBSyxFQUNMLFVBQVUsQ0FDWCxDQUFDO0FBRUosTUFBcUIsYUFBYTtJQUFsQztRQUNVLHdCQUFtQixHQUFHLDJCQUEyQixDQUFDO1FBQ2xELHFCQUFnQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQ2xDLElBQUksQ0FBQyxtQkFBbUIsRUFDeEIsd0JBQXdCLENBQ3pCLENBQUM7UUFDTSxvQkFBZSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQ2pDLGFBQUksRUFDSixnREFBZ0QsQ0FDakQsQ0FBQztRQUVNLG1CQUFjLEdBQUcsWUFBWSxDQUFDO0lBa0l4QyxDQUFDO0lBaElDOzs7Ozs7T0FNRztJQUNILEtBQUssQ0FBQyxnQkFBZ0IsQ0FDcEIsZUFBdUIsRUFDdkIsVUFBbUIsRUFBRTtRQUVyQiwrQkFBK0I7UUFDL0IsS0FBSyxDQUFDLGlEQUFpRCxDQUFDLENBQUM7UUFDekQsV0FBRyxDQUNELHlHQUF5RyxlQUFlLEdBQUcsQ0FDNUgsQ0FBQztRQUVGLElBQUksSUFBSSxDQUFDLGtCQUFrQixFQUFFLEVBQUU7WUFDN0Isd0RBQXdEO1lBQ3hELEtBQUssQ0FDSCx5RUFBeUUsQ0FDMUUsQ0FBQztZQUNGLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLEVBQUU7Z0JBQzFCLElB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QUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztJQUMxQyxDQUFDO0lBRU8sY0FBYztRQUNwQixJQUFJO1lBQ0YsT0FBTyxXQUFHLENBQUMsY0FBYyxDQUFDO2lCQUN2QixRQUFRLEVBQUU7aUJBQ1YsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1NBQ3hCO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDVixPQUFPLEtBQUssQ0FBQztTQUNkO0lBQ0gsQ0FBQztDQUNGO0FBN0lELGdDQTZJQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQge1xuICB3cml0ZUZpbGVTeW5jIGFzIHdyaXRlRmlsZSxcbiAgZXhpc3RzU3luYyBhcyBleGlzdHMsXG4gIHJlYWRGaWxlU3luYyBhcyByZWFkLFxuICBleGlzdHNTeW5jXG59IGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIGNyZWF0ZURlYnVnIGZyb20gJ2RlYnVnJztcbmltcG9ydCB7IHN5bmMgYXMgY29tbWFuZEV4aXN0cyB9IGZyb20gJ2NvbW1hbmQtZXhpc3RzJztcbmltcG9ydCB7IHJ1biB9IGZyb20gJy4uL3V0aWxzJztcbmltcG9ydCB7IE9wdGlvbnMgfSBmcm9tICcuLi9pbmRleCc7XG5pbXBvcnQge1xuICBhZGRDZXJ0aWZpY2F0ZVRvTlNTQ2VydERCLFxuICBhc3NlcnROb3RUb3VjaGluZ0ZpbGVzLFxuICBvcGVuQ2VydGlmaWNhdGVJbkZpcmVmb3gsXG4gIGNsb3NlRmlyZWZveCxcbiAgcmVtb3ZlQ2VydGlmaWNhdGVGcm9tTlNTQ2VydERCLFxuICBIT01FXG59IGZyb20gJy4vc2hhcmVkJztcbmltcG9ydCB7IFBsYXRmb3JtIH0gZnJvbSAnLic7XG5cbmNvbnN0IGRlYnVnID0gY3JlYXRlRGVidWcoJ2RldmNlcnQ6cGxhdGZvcm1zOm1hY29zJyk7XG5cbmNvbnN0IGdldENlcnRVdGlsUGF0aCA9ICgpOiBzdHJpbmcgPT5cbiAgcGF0aC5qb2luKFxuICAgIHJ1bignYnJldyAtLXByZWZpeCBuc3MnKVxuICAgICAgLnRvU3RyaW5nKClcbiAgICAgIC50cmltKCksXG4gICAgJ2JpbicsXG4gICAgJ2NlcnR1dGlsJ1xuICApO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNYWNPU1BsYXRmb3JtIGltcGxlbWVudHMgUGxhdGZvcm0ge1xuICBwcml2YXRlIEZJUkVGT1hfQlVORExFX1BBVEggPSAnL0FwcGxpY2F0aW9ucy9GaXJlZm94LmFwcCc7XG4gIHByaXZhdGUgRklSRUZPWF9CSU5fUEFUSCA9IHBhdGguam9pbihcbiAgICB0aGlzLkZJUkVGT1hfQlVORExFX1BBVEgsXG4gICAgJ0NvbnRlbnRzL01hY09TL2ZpcmVmb3gnXG4gICk7XG4gIHByaXZhdGUgRklSRUZPWF9OU1NfRElSID0gcGF0aC5qb2luKFxuICAgIEhPTUUsXG4gICAgJ0xpYnJhcnkvQXBwbGljYXRpb24gU3VwcG9ydC9GaXJlZm94L1Byb2ZpbGVzLyonXG4gICk7XG5cbiAgcHJpdmF0ZSBIT1NUX0ZJTEVfUEFUSCA9ICcvZXRjL2hvc3RzJztcblxuICAvKipcbiAgICogbWFjT1MgaXMgcHJldHR5IHNpbXBsZSAtIGp1c3QgYWRkIHRoZSBjZXJ0aWZpY2F0ZSB0byB0aGUgc3lzdGVtIGtleWNoYWluLFxuICAgKiBhbmQgbW9zdCBhcHBsaWNhdGlvbnMgd2lsbCBkZWxlZ2F0ZSB0byB0aGF0IGZvciBkZXRlcm1pbmluZyB0cnVzdGVkXG4gICAqIGNlcnRpZmljYXRlcy4gRmlyZWZveCwgb2YgY291cnNlLCBkb2VzIGl0J3Mgb3duIHRoaW5nLiBXZSBjYW4gdHJ5IHRvXG4gICAqIGF1dG9tYXRpY2FsbHkgaW5zdGFsbCB0aGUgY2VydCB3aXRoIEZpcmVmb3ggaWYgd2UgY2FuIHVzZSBjZXJ0dXRpbCB2aWEgdGhlXG4gICAqIGBuc3NgIEhvbWVicmV3IHBhY2thZ2UsIG90aGVyd2lzZSB3ZSBnbyBtYW51YWwgd2l0aCB1c2VyLWZhY2luZyBwcm9tcHRzLlxuICAgKi9cbiAgYXN5bmMgYWRkVG9UcnVzdFN0b3JlcyhcbiAgICBjZXJ0aWZpY2F0ZVBhdGg6IHN0cmluZyxcbiAgICBvcHRpb25zOiBPcHRpb25zID0ge31cbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gQ2hyb21lLCBTYWZhcmksIHN5c3RlbSB1dGlsc1xuICAgIGRlYnVnKCdBZGRpbmcgZGV2Y2VydCByb290IENBIHRvIG1hY09TIHN5c3RlbSBrZXljaGFpbicpO1xuICAgIHJ1bihcbiAgICAgIGBzdWRvIHNlY3VyaXR5IGFkZC10cnVzdGVkLWNlcnQgLWQgLXIgdHJ1c3RSb290IC1rIC9MaWJyYXJ5L0tleWNoYWlucy9TeXN0ZW0ua2V5Y2hhaW4gLXAgc3NsIC1wIGJhc2ljIFwiJHtjZXJ0aWZpY2F0ZVBhdGh9XCJgXG4gICAgKTtcblxuICAgIGlmICh0aGlzLmlzRmlyZWZveEluc3RhbGxlZCgpKSB7XG4gICAgICAvLyBUcnkgdG8gdXNlIGNlcnR1dGlsIHRvIGluc3RhbGwgdGhlIGNlcnQgYXV0b21hdGljYWxseVxuICAgICAgZGVidWcoXG4gICAgICAgICdGaXJlZm94IGluc3RhbGwgZGV0ZWN0ZWQuIEFkZGluZyBkZXZjZXJ0IHJvb3QgQ0EgdG8gRmlyZWZveCB0cnVzdCBzdG9yZSdcbiAgICAgICk7XG4gICAgICBpZiAoIXRoaXMuaXNOU1NJbnN0YWxsZWQoKSkge1xuICAgICAgICBpZiAoIW9wdGlvbnMuc2tpcENlcnR1dGlsSW5zdGFsbCkge1xuICAgICAgICAgIGlmIChjb21tYW5kRXhpc3RzKCdicmV3JykpIHtcbiAgICAgICAgICAgIGRlYnVnKFxuICAgICAgICAgICAgICBgY2VydHV0aWwgaXMgbm90IGFscmVhZHkgaW5zdGFsbGVkLCBidXQgSG9tZWJyZXcgaXMgZGV0ZWN0ZWQuIFRyeWluZyB0byBpbnN0YWxsIGNlcnR1dGlsIHZpYSBIb21lYnJldy4uLmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBydW4oJ2JyZXcgaW5zdGFsbCBuc3MnKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVidWcoXG4gICAgICAgICAgICAgIGBIb21lYnJldyBpc24ndCBpbnN0YWxsZWQsIHNvIHdlIGNhbid0IHRyeSB0byBpbnN0YWxsIGNlcnR1dGlsLiBGYWxsaW5nIGJhY2sgdG8gbWFudWFsIGNlcnRpZmljYXRlIGluc3RhbGxgXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IG9wZW5DZXJ0aWZpY2F0ZUluRmlyZWZveChcbiAgICAgICAgICAgICAgdGhpcy5GSVJFRk9YX0JJTl9QQVRILFxuICAgICAgICAgICAgICBjZXJ0aWZpY2F0ZVBhdGhcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRlYnVnKFxuICAgICAgICAgICAgYGNlcnR1dGlsIGlzIG5vdCBhbHJlYWR5IGluc3RhbGxlZCwgYW5kIHNraXBDZXJ0dXRpbEluc3RhbGwgaXMgdHJ1ZSwgc28gd2UgaGF2ZSB0byBmYWxsIGJhY2sgdG8gYSBtYW51YWwgaW5zdGFsbGBcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybiBhd2FpdCBvcGVuQ2VydGlmaWNhdGVJbkZpcmVmb3goXG4gICAgICAgICAgICB0aGlzLkZJUkVGT1hfQklOX1BBVEgsXG4gICAgICAgICAgICBjZXJ0aWZpY2F0ZVBhdGhcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBhd2FpdCBjbG9zZUZpcmVmb3goKTtcbiAgICAgIGFkZENlcnRpZmljYXRlVG9OU1NDZXJ0REIoXG4gICAgICAgIHRoaXMuRklSRUZPWF9OU1NfRElSLFxuICAgICAgICBjZXJ0aWZpY2F0ZVBhdGgsXG4gICAgICAgIGdldENlcnRVdGlsUGF0aCgpXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1ZyhcbiAgICAgICAgJ0ZpcmVmb3ggZG9lcyBub3QgYXBwZWFyIHRvIGJlIGluc3RhbGxlZCwgc2tpcHBpbmcgRmlyZWZveC1zcGVjaWZpYyBzdGVwcy4uLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgcmVtb3ZlRnJvbVRydXN0U3RvcmVzKGNlcnRpZmljYXRlUGF0aDogc3RyaW5nKTogdm9pZCB7XG4gICAgZGVidWcoJ1JlbW92aW5nIGRldmNlcnQgcm9vdCBDQSBmcm9tIG1hY09TIHN5c3RlbSBrZXljaGFpbicpO1xuICAgIHRyeSB7XG4gICAgICBpZiAoZXhpc3RzU3luYyhjZXJ0aWZpY2F0ZVBhdGgpKSB7XG4gICAgICAgIHJ1bihgc3VkbyBzZWN1cml0eSByZW1vdmUtdHJ1c3RlZC1jZXJ0IC1kIFwiJHtjZXJ0aWZpY2F0ZVBhdGh9XCJgKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBkZWJ1ZyhcbiAgICAgICAgYGZhaWxlZCB0byByZW1vdmUgJHtjZXJ0aWZpY2F0ZVBhdGh9IGZyb20gbWFjT1MgY2VydCBzdG9yZSwgY29udGludWluZy4gJHtlLnRvU3RyaW5nKCl9YFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHRoaXMuaXNGaXJlZm94SW5zdGFsbGVkKCkgJiYgdGhpcy5pc05TU0luc3RhbGxlZCgpKSB7XG4gICAgICBkZWJ1ZyhcbiAgICAgICAgJ0ZpcmVmb3ggaW5zdGFsbCBhbmQgY2VydHV0aWwgaW5zdGFsbCBkZXRlY3RlZC4gVHJ5aW5nIHRvIHJlbW92ZSByb290IENBIGZyb20gRmlyZWZveCBOU1MgZGF0YWJhc2VzJ1xuICAgICAgKTtcbiAgICAgIHJlbW92ZUNlcnRpZmljYXRlRnJvbU5TU0NlcnREQihcbiAgICAgICAgdGhpcy5GSVJFRk9YX05TU19ESVIsXG4gICAgICAgIGNlcnRpZmljYXRlUGF0aCxcbiAgICAgICAgZ2V0Q2VydFV0aWxQYXRoKClcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgYWRkRG9tYWluVG9Ib3N0RmlsZUlmTWlzc2luZyhkb21haW46IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IGhvc3RzRmlsZUNvbnRlbnRzID0gcmVhZCh0aGlzLkhPU1RfRklMRV9QQVRILCAndXRmOCcpO1xuICAgIGlmICghaG9zdHNGaWxlQ29udGVudHMuaW5jbHVkZXMoZG9tYWluKSkge1xuICAgICAgcnVuKFxuICAgICAgICBgZWNobyAnXFxuMTI3LjAuMC4xICR7ZG9tYWlufScgfCBzdWRvIHRlZSAtYSBcIiR7dGhpcy5IT1NUX0ZJTEVfUEFUSH1cIiA+IC9kZXYvbnVsbGBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgZGVsZXRlUHJvdGVjdGVkRmlsZXMoZmlsZXBhdGg6IHN0cmluZyk6IHZvaWQge1xuICAgIGFzc2VydE5vdFRvdWNoaW5nRmlsZXMoZmlsZXBhdGgsICdkZWxldGUnKTtcbiAgICBydW4oYHN1ZG8gcm0gLXJmIFwiJHtmaWxlcGF0aH1cImApO1xuICB9XG5cbiAgcmVhZFByb3RlY3RlZEZpbGUoZmlsZXBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgYXNzZXJ0Tm90VG91Y2hpbmdGaWxlcyhmaWxlcGF0aCwgJ3JlYWQnKTtcbiAgICByZXR1cm4gcnVuKGBzdWRvIGNhdCBcIiR7ZmlsZXBhdGh9XCJgKVxuICAgICAgLnRvU3RyaW5nKClcbiAgICAgIC50cmltKCk7XG4gIH1cblxuICB3cml0ZVByb3RlY3RlZEZpbGUoZmlsZXBhdGg6IHN0cmluZywgY29udGVudHM6IHN0cmluZyk6IHZvaWQge1xuICAgIGFzc2VydE5vdFRvdWNoaW5nRmlsZXMoZmlsZXBhdGgsICd3cml0ZScpO1xuICAgIGlmIChleGlzdHMoZmlsZXBhdGgpKSB7XG4gICAgICBydW4oYHN1ZG8gcm0gXCIke2ZpbGVwYXRofVwiYCk7XG4gICAgfVxuICAgIHdyaXRlRmlsZShmaWxlcGF0aCwgY29udGVudHMpO1xuICAgIHJ1bihgc3VkbyBjaG93biAwIFwiJHtmaWxlcGF0aH1cImApO1xuICAgIHJ1bihgc3VkbyBjaG1vZCA2MDAgXCIke2ZpbGVwYXRofVwiYCk7XG4gIH1cblxuICBwcml2YXRlIGlzRmlyZWZveEluc3RhbGxlZCgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZXhpc3RzKHRoaXMuRklSRUZPWF9CVU5ETEVfUEFUSCk7XG4gIH1cblxuICBwcml2YXRlIGlzTlNTSW5zdGFsbGVkKCk6IGJvb2xlYW4ge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gcnVuKCdicmV3IGxpc3QgLTEnKVxuICAgICAgICAudG9TdHJpbmcoKVxuICAgICAgICAuaW5jbHVkZXMoJ1xcbm5zc1xcbicpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbn1cbiJdfQ==