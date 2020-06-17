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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGFyd2luLmpzIiwic291cmNlUm9vdCI6Ii4vIiwic291cmNlcyI6WyJwbGF0Zm9ybXMvZGFyd2luLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsNkJBQTZCO0FBQzdCLDJCQUtZO0FBQ1oscUNBQXFDO0FBQ3JDLG1EQUF1RDtBQUN2RCxvQ0FBK0I7QUFFL0IscUNBT2tCO0FBR2xCLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0FBRXJELE1BQU0sZUFBZSxHQUFHLEdBQVcsRUFBRSxDQUNuQyxJQUFJLENBQUMsSUFBSSxDQUNQLFdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztLQUNyQixRQUFRLEVBQUU7S0FDVixJQUFJLEVBQUUsRUFDVCxLQUFLLEVBQ0wsVUFBVSxDQUNYLENBQUM7QUFFSixNQUFxQixhQUFhO0lBQWxDO1FBQ1Usd0JBQW1CLEdBQUcsMkJBQTJCLENBQUM7UUFDbEQscUJBQWdCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FDbEMsSUFBSSxDQUFDLG1CQUFtQixFQUN4Qix3QkFBd0IsQ0FDekIsQ0FBQztRQUNNLG9CQUFlLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FDakMsYUFBSSxFQUNKLGdEQUFnRCxDQUNqRCxDQUFDO1FBRU0sbUJBQWMsR0FBRyxZQUFZLENBQUM7SUFrSXhDLENBQUM7SUFoSUM7Ozs7OztPQU1HO0lBQ0gsS0FBSyxDQUFDLGdCQUFnQixDQUNwQixlQUF1QixFQUN2QixVQUFtQixFQUFFO1FBRXJCLCtCQUErQjtRQUMvQixLQUFLLENBQUMsaURBQWlELENBQUMsQ0FBQztRQUN6RCxXQUFHLENBQ0QseUdBQXlHLGVBQWUsR0FBRyxDQUM1SCxDQUFDO1FBRUYsSUFBSSxJQUFJLENBQUMsa0JBQWtCLEVBQUUsRUFBRTtZQUM3Qix3REFBd0Q7WUFDeEQsS0FBSyxDQUNILHlFQUF5RSxDQUMxRSxDQUFDO1lBQ0YsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsRUFBRTtnQkFDMUIsSUFBSSxD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Q0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFTyxjQUFjO1FBQ3BCLElBQUk7WUFDRixPQUFPLFdBQUcsQ0FBQyxjQUFjLENBQUM7aUJBQ3ZCLFFBQVEsRUFBRTtpQkFDVixRQUFRLENBQUMsU0FBUyxDQUFDLENBQUM7U0FDeEI7UUFBQyxPQUFPLENBQUMsRUFBRTtZQUNWLE9BQU8sS0FBSyxDQUFDO1NBQ2Q7SUFDSCxDQUFDO0NBQ0Y7QUE3SUQsZ0NBNklDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7XG4gIHdyaXRlRmlsZVN5bmMgYXMgd3JpdGVGaWxlLFxuICBleGlzdHNTeW5jIGFzIGV4aXN0cyxcbiAgcmVhZEZpbGVTeW5jIGFzIHJlYWQsXG4gIGV4aXN0c1N5bmNcbn0gZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgY3JlYXRlRGVidWcgZnJvbSAnZGVidWcnO1xuaW1wb3J0IHsgc3luYyBhcyBjb21tYW5kRXhpc3RzIH0gZnJvbSAnY29tbWFuZC1leGlzdHMnO1xuaW1wb3J0IHsgcnVuIH0gZnJvbSAnLi4vdXRpbHMnO1xuaW1wb3J0IHsgT3B0aW9ucyB9IGZyb20gJy4uL2luZGV4JztcbmltcG9ydCB7XG4gIGFkZENlcnRpZmljYXRlVG9OU1NDZXJ0REIsXG4gIGFzc2VydE5vdFRvdWNoaW5nRmlsZXMsXG4gIG9wZW5DZXJ0aWZpY2F0ZUluRmlyZWZveCxcbiAgY2xvc2VGaXJlZm94LFxuICByZW1vdmVDZXJ0aWZpY2F0ZUZyb21OU1NDZXJ0REIsXG4gIEhPTUVcbn0gZnJvbSAnLi9zaGFyZWQnO1xuaW1wb3J0IHsgUGxhdGZvcm0gfSBmcm9tICcuJztcblxuY29uc3QgZGVidWcgPSBjcmVhdGVEZWJ1ZygnZGV2Y2VydDpwbGF0Zm9ybXM6bWFjb3MnKTtcblxuY29uc3QgZ2V0Q2VydFV0aWxQYXRoID0gKCk6IHN0cmluZyA9PlxuICBwYXRoLmpvaW4oXG4gICAgcnVuKCdicmV3IC0tcHJlZml4IG5zcycpXG4gICAgICAudG9TdHJpbmcoKVxuICAgICAgLnRyaW0oKSxcbiAgICAnYmluJyxcbiAgICAnY2VydHV0aWwnXG4gICk7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1hY09TUGxhdGZvcm0gaW1wbGVtZW50cyBQbGF0Zm9ybSB7XG4gIHByaXZhdGUgRklSRUZPWF9CVU5ETEVfUEFUSCA9ICcvQXBwbGljYXRpb25zL0ZpcmVmb3guYXBwJztcbiAgcHJpdmF0ZSBGSVJFRk9YX0JJTl9QQVRIID0gcGF0aC5qb2luKFxuICAgIHRoaXMuRklSRUZPWF9CVU5ETEVfUEFUSCxcbiAgICAnQ29udGVudHMvTWFjT1MvZmlyZWZveCdcbiAgKTtcbiAgcHJpdmF0ZSBGSVJFRk9YX05TU19ESVIgPSBwYXRoLmpvaW4oXG4gICAgSE9NRSxcbiAgICAnTGlicmFyeS9BcHBsaWNhdGlvbiBTdXBwb3J0L0ZpcmVmb3gvUHJvZmlsZXMvKidcbiAgKTtcblxuICBwcml2YXRlIEhPU1RfRklMRV9QQVRIID0gJy9ldGMvaG9zdHMnO1xuXG4gIC8qKlxuICAgKiBtYWNPUyBpcyBwcmV0dHkgc2ltcGxlIC0ganVzdCBhZGQgdGhlIGNlcnRpZmljYXRlIHRvIHRoZSBzeXN0ZW0ga2V5Y2hhaW4sXG4gICAqIGFuZCBtb3N0IGFwcGxpY2F0aW9ucyB3aWxsIGRlbGVnYXRlIHRvIHRoYXQgZm9yIGRldGVybWluaW5nIHRydXN0ZWRcbiAgICogY2VydGlmaWNhdGVzLiBGaXJlZm94LCBvZiBjb3Vyc2UsIGRvZXMgaXQncyBvd24gdGhpbmcuIFdlIGNhbiB0cnkgdG9cbiAgICogYXV0b21hdGljYWxseSBpbnN0YWxsIHRoZSBjZXJ0IHdpdGggRmlyZWZveCBpZiB3ZSBjYW4gdXNlIGNlcnR1dGlsIHZpYSB0aGVcbiAgICogYG5zc2AgSG9tZWJyZXcgcGFja2FnZSwgb3RoZXJ3aXNlIHdlIGdvIG1hbnVhbCB3aXRoIHVzZXItZmFjaW5nIHByb21wdHMuXG4gICAqL1xuICBhc3luYyBhZGRUb1RydXN0U3RvcmVzKFxuICAgIGNlcnRpZmljYXRlUGF0aDogc3RyaW5nLFxuICAgIG9wdGlvbnM6IE9wdGlvbnMgPSB7fVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAvLyBDaHJvbWUsIFNhZmFyaSwgc3lzdGVtIHV0aWxzXG4gICAgZGVidWcoJ0FkZGluZyBkZXZjZXJ0IHJvb3QgQ0EgdG8gbWFjT1Mgc3lzdGVtIGtleWNoYWluJyk7XG4gICAgcnVuKFxuICAgICAgYHN1ZG8gc2VjdXJpdHkgYWRkLXRydXN0ZWQtY2VydCAtZCAtciB0cnVzdFJvb3QgLWsgL0xpYnJhcnkvS2V5Y2hhaW5zL1N5c3RlbS5rZXljaGFpbiAtcCBzc2wgLXAgYmFzaWMgXCIke2NlcnRpZmljYXRlUGF0aH1cImBcbiAgICApO1xuXG4gICAgaWYgKHRoaXMuaXNGaXJlZm94SW5zdGFsbGVkKCkpIHtcbiAgICAgIC8vIFRyeSB0byB1c2UgY2VydHV0aWwgdG8gaW5zdGFsbCB0aGUgY2VydCBhdXRvbWF0aWNhbGx5XG4gICAgICBkZWJ1ZyhcbiAgICAgICAgJ0ZpcmVmb3ggaW5zdGFsbCBkZXRlY3RlZC4gQWRkaW5nIGRldmNlcnQgcm9vdCBDQSB0byBGaXJlZm94IHRydXN0IHN0b3JlJ1xuICAgICAgKTtcbiAgICAgIGlmICghdGhpcy5pc05TU0luc3RhbGxlZCgpKSB7XG4gICAgICAgIGlmICghb3B0aW9ucy5za2lwQ2VydHV0aWxJbnN0YWxsKSB7XG4gICAgICAgICAgaWYgKGNvbW1hbmRFeGlzdHMoJ2JyZXcnKSkge1xuICAgICAgICAgICAgZGVidWcoXG4gICAgICAgICAgICAgIGBjZXJ0dXRpbCBpcyBub3QgYWxyZWFkeSBpbnN0YWxsZWQsIGJ1dCBIb21lYnJldyBpcyBkZXRlY3RlZC4gVHJ5aW5nIHRvIGluc3RhbGwgY2VydHV0aWwgdmlhIEhvbWVicmV3Li4uYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJ1bignYnJldyBpbnN0YWxsIG5zcycpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkZWJ1ZyhcbiAgICAgICAgICAgICAgYEhvbWVicmV3IGlzbid0IGluc3RhbGxlZCwgc28gd2UgY2FuJ3QgdHJ5IHRvIGluc3RhbGwgY2VydHV0aWwuIEZhbGxpbmcgYmFjayB0byBtYW51YWwgY2VydGlmaWNhdGUgaW5zdGFsbGBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICByZXR1cm4gYXdhaXQgb3BlbkNlcnRpZmljYXRlSW5GaXJlZm94KFxuICAgICAgICAgICAgICB0aGlzLkZJUkVGT1hfQklOX1BBVEgsXG4gICAgICAgICAgICAgIGNlcnRpZmljYXRlUGF0aFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZGVidWcoXG4gICAgICAgICAgICBgY2VydHV0aWwgaXMgbm90IGFscmVhZHkgaW5zdGFsbGVkLCBhbmQgc2tpcENlcnR1dGlsSW5zdGFsbCBpcyB0cnVlLCBzbyB3ZSBoYXZlIHRvIGZhbGwgYmFjayB0byBhIG1hbnVhbCBpbnN0YWxsYFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIGF3YWl0IG9wZW5DZXJ0aWZpY2F0ZUluRmlyZWZveChcbiAgICAgICAgICAgIHRoaXMuRklSRUZPWF9CSU5fUEFUSCxcbiAgICAgICAgICAgIGNlcnRpZmljYXRlUGF0aFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGF3YWl0IGNsb3NlRmlyZWZveCgpO1xuICAgICAgYWRkQ2VydGlmaWNhdGVUb05TU0NlcnREQihcbiAgICAgICAgdGhpcy5GSVJFRk9YX05TU19ESVIsXG4gICAgICAgIGNlcnRpZmljYXRlUGF0aCxcbiAgICAgICAgZ2V0Q2VydFV0aWxQYXRoKClcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlYnVnKFxuICAgICAgICAnRmlyZWZveCBkb2VzIG5vdCBhcHBlYXIgdG8gYmUgaW5zdGFsbGVkLCBza2lwcGluZyBGaXJlZm94LXNwZWNpZmljIHN0ZXBzLi4uJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICByZW1vdmVGcm9tVHJ1c3RTdG9yZXMoY2VydGlmaWNhdGVQYXRoOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBkZWJ1ZygnUmVtb3ZpbmcgZGV2Y2VydCByb290IENBIGZyb20gbWFjT1Mgc3lzdGVtIGtleWNoYWluJyk7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChleGlzdHNTeW5jKGNlcnRpZmljYXRlUGF0aCkpIHtcbiAgICAgICAgcnVuKGBzdWRvIHNlY3VyaXR5IHJlbW92ZS10cnVzdGVkLWNlcnQgLWQgXCIke2NlcnRpZmljYXRlUGF0aH1cImApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGRlYnVnKFxuICAgICAgICBgZmFpbGVkIHRvIHJlbW92ZSAke2NlcnRpZmljYXRlUGF0aH0gZnJvbSBtYWNPUyBjZXJ0IHN0b3JlLCBjb250aW51aW5nLiAke2UudG9TdHJpbmcoKX1gXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAodGhpcy5pc0ZpcmVmb3hJbnN0YWxsZWQoKSAmJiB0aGlzLmlzTlNTSW5zdGFsbGVkKCkpIHtcbiAgICAgIGRlYnVnKFxuICAgICAgICAnRmlyZWZveCBpbnN0YWxsIGFuZCBjZXJ0dXRpbCBpbnN0YWxsIGRldGVjdGVkLiBUcnlpbmcgdG8gcmVtb3ZlIHJvb3QgQ0EgZnJvbSBGaXJlZm94IE5TUyBkYXRhYmFzZXMnXG4gICAgICApO1xuICAgICAgcmVtb3ZlQ2VydGlmaWNhdGVGcm9tTlNTQ2VydERCKFxuICAgICAgICB0aGlzLkZJUkVGT1hfTlNTX0RJUixcbiAgICAgICAgY2VydGlmaWNhdGVQYXRoLFxuICAgICAgICBnZXRDZXJ0VXRpbFBhdGgoKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBhZGREb21haW5Ub0hvc3RGaWxlSWZNaXNzaW5nKGRvbWFpbjogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgaG9zdHNGaWxlQ29udGVudHMgPSByZWFkKHRoaXMuSE9TVF9GSUxFX1BBVEgsICd1dGY4Jyk7XG4gICAgaWYgKCFob3N0c0ZpbGVDb250ZW50cy5pbmNsdWRlcyhkb21haW4pKSB7XG4gICAgICBydW4oXG4gICAgICAgIGBlY2hvICdcXG4xMjcuMC4wLjEgJHtkb21haW59JyB8IHN1ZG8gdGVlIC1hIFwiJHt0aGlzLkhPU1RfRklMRV9QQVRIfVwiID4gL2Rldi9udWxsYFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBkZWxldGVQcm90ZWN0ZWRGaWxlcyhmaWxlcGF0aDogc3RyaW5nKTogdm9pZCB7XG4gICAgYXNzZXJ0Tm90VG91Y2hpbmdGaWxlcyhmaWxlcGF0aCwgJ2RlbGV0ZScpO1xuICAgIHJ1bihgc3VkbyBybSAtcmYgXCIke2ZpbGVwYXRofVwiYCk7XG4gIH1cblxuICByZWFkUHJvdGVjdGVkRmlsZShmaWxlcGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBhc3NlcnROb3RUb3VjaGluZ0ZpbGVzKGZpbGVwYXRoLCAncmVhZCcpO1xuICAgIHJldHVybiBydW4oYHN1ZG8gY2F0IFwiJHtmaWxlcGF0aH1cImApXG4gICAgICAudG9TdHJpbmcoKVxuICAgICAgLnRyaW0oKTtcbiAgfVxuXG4gIHdyaXRlUHJvdGVjdGVkRmlsZShmaWxlcGF0aDogc3RyaW5nLCBjb250ZW50czogc3RyaW5nKTogdm9pZCB7XG4gICAgYXNzZXJ0Tm90VG91Y2hpbmdGaWxlcyhmaWxlcGF0aCwgJ3dyaXRlJyk7XG4gICAgaWYgKGV4aXN0cyhmaWxlcGF0aCkpIHtcbiAgICAgIHJ1bihgc3VkbyBybSBcIiR7ZmlsZXBhdGh9XCJgKTtcbiAgICB9XG4gICAgd3JpdGVGaWxlKGZpbGVwYXRoLCBjb250ZW50cyk7XG4gICAgcnVuKGBzdWRvIGNob3duIDAgXCIke2ZpbGVwYXRofVwiYCk7XG4gICAgcnVuKGBzdWRvIGNobW9kIDYwMCBcIiR7ZmlsZXBhdGh9XCJgKTtcbiAgfVxuXG4gIHByaXZhdGUgaXNGaXJlZm94SW5zdGFsbGVkKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBleGlzdHModGhpcy5GSVJFRk9YX0JVTkRMRV9QQVRIKTtcbiAgfVxuXG4gIHByaXZhdGUgaXNOU1NJbnN0YWxsZWQoKTogYm9vbGVhbiB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBydW4oJ2JyZXcgbGlzdCAtMScpXG4gICAgICAgIC50b1N0cmluZygpXG4gICAgICAgIC5pbmNsdWRlcygnXFxubnNzXFxuJyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxufVxuIl19