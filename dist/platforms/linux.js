"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs_1 = require("fs");
const createDebug = require("debug");
const command_exists_1 = require("command-exists");
const shared_1 = require("./shared");
const utils_1 = require("../utils");
const user_interface_1 = require("../user-interface");
const si = require("systeminformation");
const errors_1 = require("../errors");
const debug = createDebug('devcert:platforms:linux');
var LinuxFlavor;
(function (LinuxFlavor) {
    LinuxFlavor[LinuxFlavor["Unknown"] = 0] = "Unknown";
    LinuxFlavor[LinuxFlavor["Ubuntu"] = 1] = "Ubuntu";
    LinuxFlavor[LinuxFlavor["Rhel7"] = 2] = "Rhel7";
    LinuxFlavor[LinuxFlavor["Fedora"] = 3] = "Fedora";
})(LinuxFlavor || (LinuxFlavor = {}));
async function determineLinuxFlavor(distroPromise = si.osInfo().then(info => info.distro)) {
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
function linuxFlavorDetails(flavor) {
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
            throw new errors_1.UnreachableError(flavor, 'Unable to detect linux flavor');
    }
}
async function currentLinuxFlavorDetails() {
    const { flav: flavor, message } = await determineLinuxFlavor();
    if (!flavor)
        throw new Error(message); // TODO better error
    return linuxFlavorDetails(flavor);
}
class LinuxPlatform {
    constructor() {
        this.FIREFOX_NSS_DIR = path.join(shared_1.HOME, '.mozilla/firefox/*');
        this.CHROME_NSS_DIR = path.join(shared_1.HOME, '.pki/nssdb');
        this.FIREFOX_BIN_PATH = '/usr/bin/firefox';
        this.CHROME_BIN_PATH = '/usr/bin/google-chrome';
        this.HOST_FILE_PATH = '/etc/hosts';
    }
    /**
     * Linux is surprisingly difficult. There seems to be multiple system-wide
     * repositories for certs, so we copy ours to each. However, Firefox does it's
     * usual separate trust store. Plus Chrome relies on the NSS tooling (like
     * Firefox), but uses the user's NSS database, unlike Firefox (which uses a
     * separate Mozilla one). And since Chrome doesn't prompt the user with a GUI
     * flow when opening certs, if we can't use certutil to install our certificate
     * into the user's NSS database, we're out of luck.
     */
    async addToTrustStores(certificatePath, options = {}) {
        debug('Adding devcert root CA to Linux system-wide trust stores');
        // run(`sudo cp ${ certificatePath } /etc/ssl/certs/devcert.crt`);
        const linuxInfo = await currentLinuxFlavorDetails();
        const { caFolders, postCaPlacementCommands } = linuxInfo;
        caFolders.forEach(folder => {
            utils_1.run(`sudo cp "${certificatePath}" ${path.join(folder, 'devcert.crt')}`);
        });
        // run(`sudo bash -c "cat ${ certificatePath } >> /etc/ssl/certs/ca-certificates.crt"`);
        postCaPlacementCommands.forEach(({ command, args }) => {
            utils_1.run(`${command} ${args.join(' ')}`.trim());
        });
        if (this.isFirefoxInstalled()) {
            // Firefox
            debug('Firefox install detected: adding devcert root CA to Firefox-specific trust stores ...');
            if (!command_exists_1.sync('certutil')) {
                if (options.skipCertutilInstall) {
                    debug('NSS tooling is not already installed, and `skipCertutil` is true, so falling back to manual certificate install for Firefox');
                    shared_1.openCertificateInFirefox(this.FIREFOX_BIN_PATH, certificatePath);
                }
                else {
                    debug('NSS tooling is not already installed. Trying to install NSS tooling now with `apt install`');
                    utils_1.run('sudo apt install libnss3-tools');
                    debug('Installing certificate into Firefox trust stores using NSS tooling');
                    await shared_1.closeFirefox();
                    shared_1.addCertificateToNSSCertDB(this.FIREFOX_NSS_DIR, certificatePath, 'certutil');
                }
            }
        }
        else {
            debug('Firefox does not appear to be installed, skipping Firefox-specific steps...');
        }
        if (this.isChromeInstalled()) {
            debug('Chrome install detected: adding devcert root CA to Chrome trust store ...');
            if (!command_exists_1.sync('certutil')) {
                user_interface_1.default.warnChromeOnLinuxWithoutCertutil();
            }
            else {
                await shared_1.closeFirefox();
                shared_1.addCertificateToNSSCertDB(this.CHROME_NSS_DIR, certificatePath, 'certutil');
            }
        }
        else {
            debug('Chrome does not appear to be installed, skipping Chrome-specific steps...');
        }
    }
    async removeFromTrustStores(certificatePath) {
        const linuxInfo = await currentLinuxFlavorDetails();
        const { caFolders, postCaRemovalCommands } = linuxInfo;
        caFolders.forEach(folder => {
            const certPath = path.join(folder, 'devcert.crt');
            try {
                const exists = fs_1.existsSync(certPath);
                debug({ exists });
                if (!exists) {
                    debug(`cert at location ${certPath} was not found. Skipping...`);
                    return;
                }
                else {
                    utils_1.run(`sudo rm "${certificatePath}" ${certPath}`);
                    postCaRemovalCommands.forEach(({ command, args }) => {
                        utils_1.run(`${command} ${args.join(' ')}`.trim());
                    });
                }
            }
            catch (e) {
                debug(`failed to remove ${certificatePath} from ${certPath}, continuing. ${e.toString()}`);
            }
        });
        // run(`sudo bash -c "cat ${ certificatePath } >> /etc/ssl/certs/ca-certificates.crt"`);
        if (command_exists_1.sync('certutil')) {
            if (this.isFirefoxInstalled()) {
                shared_1.removeCertificateFromNSSCertDB(this.FIREFOX_NSS_DIR, certificatePath, 'certutil');
            }
            if (this.isChromeInstalled()) {
                shared_1.removeCertificateFromNSSCertDB(this.CHROME_NSS_DIR, certificatePath, 'certutil');
            }
        }
    }
    addDomainToHostFileIfMissing(domain) {
        const hostsFileContents = fs_1.readFileSync(this.HOST_FILE_PATH, 'utf8');
        if (!hostsFileContents.includes(domain)) {
            utils_1.run(`echo '127.0.0.1  ${domain}' | sudo tee -a "${this.HOST_FILE_PATH}" > /dev/null`);
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
        return fs_1.existsSync(this.FIREFOX_BIN_PATH);
    }
    isChromeInstalled() {
        return fs_1.existsSync(this.CHROME_BIN_PATH);
    }
}
exports.default = LinuxPlatform;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGludXguanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInBsYXRmb3Jtcy9saW51eC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDZCQUE2QjtBQUM3QiwyQkFLWTtBQUNaLHFDQUFxQztBQUNyQyxtREFBdUQ7QUFDdkQscUNBT2tCO0FBQ2xCLG9DQUErQjtBQUUvQixzREFBbUM7QUFFbkMsd0NBQXdDO0FBQ3hDLHNDQUE2QztBQUU3QyxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMseUJBQXlCLENBQUMsQ0FBQztBQUVyRCxJQUFLLFdBS0o7QUFMRCxXQUFLLFdBQVc7SUFDZCxtREFBVyxDQUFBO0lBQ1gsaURBQU0sQ0FBQTtJQUNOLCtDQUFLLENBQUE7SUFDTCxpREFBTSxDQUFBO0FBQ1IsQ0FBQyxFQUxJLFdBQVcsS0FBWCxXQUFXLFFBS2Y7QUFFRCxLQUFLLFVBQVUsb0JBQW9CLENBQ2pDLGdCQUFpQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUV0RSxNQUFNLE1BQU0sR0FBRyxNQUFNLGFBQWEsQ0FBQztJQUNuQyxRQUFRLE1BQU0sRUFBRTtRQUNkLEtBQUssc0NBQXNDO1lBQ3pDLE9BQU8sRUFBRSxJQUFJLEVBQUUsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3JDLEtBQUssUUFBUTtZQUNYLE9BQU8sRUFBRSxJQUFJLEVBQUUsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3RDLEtBQUssUUFBUTtZQUNYLE9BQU8sRUFBRSxJQUFJLEVBQUUsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3RDO1lBQ0UsT0FBTztnQkFDTCxJQUFJLEVBQUUsV0FBVyxDQUFDLE9BQU87Z0JBQ3pCLE9BQU8sRUFBRSx5QkFBeUIsTUFBTSxFQUFFO2FBQzNDLENBQUM7S0FDTDtBQUNILENBQUM7QUFhRCxTQUFTLGtCQUFrQixDQUN6QixNQUFp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QU8sZUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUN0QyxDQUFDO0NBQ0Y7QUF4S0QsZ0NBd0tDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7XG4gIGV4aXN0c1N5bmMgYXMgZXhpc3RzLFxuICByZWFkRmlsZVN5bmMgYXMgcmVhZCxcbiAgd3JpdGVGaWxlU3luYyBhcyB3cml0ZUZpbGUsXG4gIGV4aXN0c1N5bmNcbn0gZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgY3JlYXRlRGVidWcgZnJvbSAnZGVidWcnO1xuaW1wb3J0IHsgc3luYyBhcyBjb21tYW5kRXhpc3RzIH0gZnJvbSAnY29tbWFuZC1leGlzdHMnO1xuaW1wb3J0IHtcbiAgYWRkQ2VydGlmaWNhdGVUb05TU0NlcnREQixcbiAgYXNzZXJ0Tm90VG91Y2hpbmdGaWxlcyxcbiAgb3BlbkNlcnRpZmljYXRlSW5GaXJlZm94LFxuICBjbG9zZUZpcmVmb3gsXG4gIHJlbW92ZUNlcnRpZmljYXRlRnJvbU5TU0NlcnREQixcbiAgSE9NRVxufSBmcm9tICcuL3NoYXJlZCc7XG5pbXBvcnQgeyBydW4gfSBmcm9tICcuLi91dGlscyc7XG5pbXBvcnQgeyBPcHRpb25zIH0gZnJvbSAnLi4vaW5kZXgnO1xuaW1wb3J0IFVJIGZyb20gJy4uL3VzZXItaW50ZXJmYWNlJztcbmltcG9ydCB7IFBsYXRmb3JtIH0gZnJvbSAnLic7XG5pbXBvcnQgKiBhcyBzaSBmcm9tICdzeXN0ZW1pbmZvcm1hdGlvbic7XG5pbXBvcnQgeyBVbnJlYWNoYWJsZUVycm9yIH0gZnJvbSAnLi4vZXJyb3JzJztcblxuY29uc3QgZGVidWcgPSBjcmVhdGVEZWJ1ZygnZGV2Y2VydDpwbGF0Zm9ybXM6bGludXgnKTtcblxuZW51bSBMaW51eEZsYXZvciB7XG4gIFVua25vd24gPSAwLFxuICBVYnVudHUsXG4gIFJoZWw3LFxuICBGZWRvcmFcbn1cblxuYXN5bmMgZnVuY3Rpb24gZGV0ZXJtaW5lTGludXhGbGF2b3IoXG4gIGRpc3Ryb1Byb21pc2U6IFByb21pc2U8c3RyaW5nPiA9IHNpLm9zSW5mbygpLnRoZW4oaW5mbyA9PiBpbmZvLmRpc3Rybylcbik6IFByb21pc2U8eyBmbGF2OiBMaW51eEZsYXZvcjsgbWVzc2FnZT86IHN0cmluZyB9PiB7XG4gIGNvbnN0IGRpc3RybyA9IGF3YWl0IGRpc3Ryb1Byb21pc2U7XG4gIHN3aXRjaCAoZGlzdHJvKSB7XG4gICAgY2FzZSAnUmVkIEhhdCBFbnRlcnByaXNlIExpbnV4IFdvcmtzdGF0aW9uJzpcbiAgICAgIHJldHVybiB7IGZsYXY6IExpbnV4Rmxhdm9yLlJoZWw3IH07XG4gICAgY2FzZSAnVWJ1bnR1JzpcbiAgICAgIHJldHVybiB7IGZsYXY6IExpbnV4Rmxhdm9yLlVidW50dSB9O1xuICAgIGNhc2UgJ0ZlZG9yYSc6XG4gICAgICByZXR1cm4geyBmbGF2OiBMaW51eEZsYXZvci5GZWRvcmEgfTtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZmxhdjogTGludXhGbGF2b3IuVW5rbm93bixcbiAgICAgICAgbWVzc2FnZTogYFVua25vd24gbGludXggZGlzdHJvOiAke2Rpc3Ryb31gXG4gICAgICB9O1xuICB9XG59XG5cbmludGVyZmFjZSBDbWQge1xuICBjb21tYW5kOiBzdHJpbmc7XG4gIGFyZ3M6IHN0cmluZ1tdO1xufVxuXG5pbnRlcmZhY2UgTGludXhGbGF2b3JEZXRhaWxzIHtcbiAgY2FGb2xkZXJzOiBzdHJpbmdbXTtcbiAgcG9zdENhUGxhY2VtZW50Q29tbWFuZHM6IENtZFtdO1xuICBwb3N0Q2FSZW1vdmFsQ29tbWFuZHM6IENtZFtdO1xufVxuXG5mdW5jdGlvbiBsaW51eEZsYXZvckRldGFpbHMoXG4gIGZsYXZvcjogRXhjbHVkZTxMaW51eEZsYXZvciwgTGludXhGbGF2b3IuVW5rbm93bj5cbik6IExpbnV4Rmxhdm9yRGV0YWlscyB7XG4gIHN3aXRjaCAoZmxhdm9yKSB7XG4gICAgY2FzZSBMaW51eEZsYXZvci5SaGVsNzpcbiAgICBjYXNlIExpbnV4Rmxhdm9yLkZlZG9yYTpcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNhRm9sZGVyczogW1xuICAgICAgICAgICcvZXRjL3BraS9jYS10cnVzdC9zb3VyY2UvYW5jaG9ycycsXG4gICAgICAgICAgJy91c3Ivc2hhcmUvcGtpL2NhLXRydXN0LXNvdXJjZSdcbiAgICAgICAgXSxcbiAgICAgICAgcG9zdENhUGxhY2VtZW50Q29tbWFuZHM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBjb21tYW5kOiAnc3VkbycsXG4gICAgICAgICAgICBhcmdzOiBbJ3VwZGF0ZS1jYS10cnVzdCddXG4gICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICBwb3N0Q2FSZW1vdmFsQ29tbWFuZHM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBjb21tYW5kOiAnc3VkbycsXG4gICAgICAgICAgICBhcmdzOiBbJ3VwZGF0ZS1jYS10cnVzdCddXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9O1xuICAgIGNhc2UgTGludXhGbGF2b3IuVWJ1bnR1OlxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY2FGb2xkZXJzOiBbXG4gICAgICAgICAgJy9ldGMvcGtpL2NhLXRydXN0L3NvdXJjZS9hbmNob3JzJyxcbiAgICAgICAgICAnL3Vzci9sb2NhbC9zaGFyZS9jYS1jZXJ0aWZpY2F0ZXMnXG4gICAgICAgIF0sXG4gICAgICAgIHBvc3RDYVBsYWNlbWVudENvbW1hbmRzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgY29tbWFuZDogJ3N1ZG8nLFxuICAgICAgICAgICAgYXJnczogWyd1cGRhdGUtY2EtY2VydGlmaWNhdGVzJ11cbiAgICAgICAgICB9XG4gICAgICAgIF0sXG4gICAgICAgIHBvc3RDYVJlbW92YWxDb21tYW5kczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGNvbW1hbmQ6ICdzdWRvJyxcbiAgICAgICAgICAgIGFyZ3M6IFsndXBkYXRlLWNhLWNlcnRpZmljYXRlcyddXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9O1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBVbnJlYWNoYWJsZUVycm9yKGZsYXZvciwgJ1VuYWJsZSB0byBkZXRlY3QgbGludXggZmxhdm9yJyk7XG4gIH1cbn1cbmFzeW5jIGZ1bmN0aW9uIGN1cnJlbnRMaW51eEZsYXZvckRldGFpbHMoKTogUHJvbWlzZTxMaW51eEZsYXZvckRldGFpbHM+IHtcbiAgY29uc3QgeyBmbGF2OiBmbGF2b3IsIG1lc3NhZ2UgfSA9IGF3YWl0IGRldGVybWluZUxpbnV4Rmxhdm9yKCk7XG4gIGlmICghZmxhdm9yKSB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7IC8vIFRPRE8gYmV0dGVyIGVycm9yXG4gIHJldHVybiBsaW51eEZsYXZvckRldGFpbHMoZmxhdm9yKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTGludXhQbGF0Zm9ybSBpbXBsZW1lbnRzIFBsYXRmb3JtIHtcbiAgcHJpdmF0ZSBGSVJFRk9YX05TU19ESVIgPSBwYXRoLmpvaW4oSE9NRSwgJy5tb3ppbGxhL2ZpcmVmb3gvKicpO1xuICBwcml2YXRlIENIUk9NRV9OU1NfRElSID0gcGF0aC5qb2luKEhPTUUsICcucGtpL25zc2RiJyk7XG4gIHByaXZhdGUgRklSRUZPWF9CSU5fUEFUSCA9ICcvdXNyL2Jpbi9maXJlZm94JztcbiAgcHJpdmF0ZSBDSFJPTUVfQklOX1BBVEggPSAnL3Vzci9iaW4vZ29vZ2xlLWNocm9tZSc7XG5cbiAgcHJpdmF0ZSBIT1NUX0ZJTEVfUEFUSCA9ICcvZXRjL2hvc3RzJztcblxuICAvKipcbiAgICogTGludXggaXMgc3VycHJpc2luZ2x5IGRpZmZpY3VsdC4gVGhlcmUgc2VlbXMgdG8gYmUgbXVsdGlwbGUgc3lzdGVtLXdpZGVcbiAgICogcmVwb3NpdG9yaWVzIGZvciBjZXJ0cywgc28gd2UgY29weSBvdXJzIHRvIGVhY2guIEhvd2V2ZXIsIEZpcmVmb3ggZG9lcyBpdCdzXG4gICAqIHVzdWFsIHNlcGFyYXRlIHRydXN0IHN0b3JlLiBQbHVzIENocm9tZSByZWxpZXMgb24gdGhlIE5TUyB0b29saW5nIChsaWtlXG4gICAqIEZpcmVmb3gpLCBidXQgdXNlcyB0aGUgdXNlcidzIE5TUyBkYXRhYmFzZSwgdW5saWtlIEZpcmVmb3ggKHdoaWNoIHVzZXMgYVxuICAgKiBzZXBhcmF0ZSBNb3ppbGxhIG9uZSkuIEFuZCBzaW5jZSBDaHJvbWUgZG9lc24ndCBwcm9tcHQgdGhlIHVzZXIgd2l0aCBhIEdVSVxuICAgKiBmbG93IHdoZW4gb3BlbmluZyBjZXJ0cywgaWYgd2UgY2FuJ3QgdXNlIGNlcnR1dGlsIHRvIGluc3RhbGwgb3VyIGNlcnRpZmljYXRlXG4gICAqIGludG8gdGhlIHVzZXIncyBOU1MgZGF0YWJhc2UsIHdlJ3JlIG91dCBvZiBsdWNrLlxuICAgKi9cbiAgYXN5bmMgYWRkVG9UcnVzdFN0b3JlcyhcbiAgICBjZXJ0aWZpY2F0ZVBhdGg6IHN0cmluZyxcbiAgICBvcHRpb25zOiBPcHRpb25zID0ge31cbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZGVidWcoJ0FkZGluZyBkZXZjZXJ0IHJvb3QgQ0EgdG8gTGludXggc3lzdGVtLXdpZGUgdHJ1c3Qgc3RvcmVzJyk7XG4gICAgLy8gcnVuKGBzdWRvIGNwICR7IGNlcnRpZmljYXRlUGF0aCB9IC9ldGMvc3NsL2NlcnRzL2RldmNlcnQuY3J0YCk7XG4gICAgY29uc3QgbGludXhJbmZvID0gYXdhaXQgY3VycmVudExpbnV4Rmxhdm9yRGV0YWlscygpO1xuICAgIGNvbnN0IHsgY2FGb2xkZXJzLCBwb3N0Q2FQbGFjZW1lbnRDb21tYW5kcyB9ID0gbGludXhJbmZvO1xuICAgIGNhRm9sZGVycy5mb3JFYWNoKGZvbGRlciA9PiB7XG4gICAgICBydW4oYHN1ZG8gY3AgXCIke2NlcnRpZmljYXRlUGF0aH1cIiAke3BhdGguam9pbihmb2xkZXIsICdkZXZjZXJ0LmNydCcpfWApO1xuICAgIH0pO1xuICAgIC8vIHJ1bihgc3VkbyBiYXNoIC1jIFwiY2F0ICR7IGNlcnRpZmljYXRlUGF0aCB9ID4+IC9ldGMvc3NsL2NlcnRzL2NhLWNlcnRpZmljYXRlcy5jcnRcImApO1xuICAgIHBvc3RDYVBsYWNlbWVudENvbW1hbmRzLmZvckVhY2goKHsgY29tbWFuZCwgYXJncyB9KSA9PiB7XG4gICAgICBydW4oYCR7Y29tbWFuZH0gJHthcmdzLmpvaW4oJyAnKX1gLnRyaW0oKSk7XG4gICAgfSk7XG5cbiAgICBpZiAodGhpcy5pc0ZpcmVmb3hJbnN0YWxsZWQoKSkge1xuICAgICAgLy8gRmlyZWZveFxuICAgICAgZGVidWcoXG4gICAgICAgICdGaXJlZm94IGluc3RhbGwgZGV0ZWN0ZWQ6IGFkZGluZyBkZXZjZXJ0IHJvb3QgQ0EgdG8gRmlyZWZveC1zcGVjaWZpYyB0cnVzdCBzdG9yZXMgLi4uJ1xuICAgICAgKTtcbiAgICAgIGlmICghY29tbWFuZEV4aXN0cygnY2VydHV0aWwnKSkge1xuICAgICAgICBpZiAob3B0aW9ucy5za2lwQ2VydHV0aWxJbnN0YWxsKSB7XG4gICAgICAgICAgZGVidWcoXG4gICAgICAgICAgICAnTlNTIHRvb2xpbmcgaXMgbm90IGFscmVhZHkgaW5zdGFsbGVkLCBhbmQgYHNraXBDZXJ0dXRpbGAgaXMgdHJ1ZSwgc28gZmFsbGluZyBiYWNrIHRvIG1hbnVhbCBjZXJ0aWZpY2F0ZSBpbnN0YWxsIGZvciBGaXJlZm94J1xuICAgICAgICAgICk7XG4gICAgICAgICAgb3BlbkNlcnRpZmljYXRlSW5GaXJlZm94KHRoaXMuRklSRUZPWF9CSU5fUEFUSCwgY2VydGlmaWNhdGVQYXRoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkZWJ1ZyhcbiAgICAgICAgICAgICdOU1MgdG9vbGluZyBpcyBub3QgYWxyZWFkeSBpbnN0YWxsZWQuIFRyeWluZyB0byBpbnN0YWxsIE5TUyB0b29saW5nIG5vdyB3aXRoIGBhcHQgaW5zdGFsbGAnXG4gICAgICAgICAgKTtcbiAgICAgICAgICBydW4oJ3N1ZG8gYXB0IGluc3RhbGwgbGlibnNzMy10b29scycpO1xuICAgICAgICAgIGRlYnVnKFxuICAgICAgICAgICAgJ0luc3RhbGxpbmcgY2VydGlmaWNhdGUgaW50byBGaXJlZm94IHRydXN0IHN0b3JlcyB1c2luZyBOU1MgdG9vbGluZydcbiAgICAgICAgICApO1xuICAgICAgICAgIGF3YWl0IGNsb3NlRmlyZWZveCgpO1xuICAgICAgICAgIGFkZENlcnRpZmljYXRlVG9OU1NDZXJ0REIoXG4gICAgICAgICAgICB0aGlzLkZJUkVGT1hfTlNTX0RJUixcbiAgICAgICAgICAgIGNlcnRpZmljYXRlUGF0aCxcbiAgICAgICAgICAgICdjZXJ0dXRpbCdcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlYnVnKFxuICAgICAgICAnRmlyZWZveCBkb2VzIG5vdCBhcHBlYXIgdG8gYmUgaW5zdGFsbGVkLCBza2lwcGluZyBGaXJlZm94LXNwZWNpZmljIHN0ZXBzLi4uJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5pc0Nocm9tZUluc3RhbGxlZCgpKSB7XG4gICAgICBkZWJ1ZyhcbiAgICAgICAgJ0Nocm9tZSBpbnN0YWxsIGRldGVjdGVkOiBhZGRpbmcgZGV2Y2VydCByb290IENBIHRvIENocm9tZSB0cnVzdCBzdG9yZSAuLi4nXG4gICAgICApO1xuICAgICAgaWYgKCFjb21tYW5kRXhpc3RzKCdjZXJ0dXRpbCcpKSB7XG4gICAgICAgIFVJLndhcm5DaHJvbWVPbkxpbnV4V2l0aG91dENlcnR1dGlsKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCBjbG9zZUZpcmVmb3goKTtcbiAgICAgICAgYWRkQ2VydGlmaWNhdGVUb05TU0NlcnREQihcbiAgICAgICAgICB0aGlzLkNIUk9NRV9OU1NfRElSLFxuICAgICAgICAgIGNlcnRpZmljYXRlUGF0aCxcbiAgICAgICAgICAnY2VydHV0aWwnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlYnVnKFxuICAgICAgICAnQ2hyb21lIGRvZXMgbm90IGFwcGVhciB0byBiZSBpbnN0YWxsZWQsIHNraXBwaW5nIENocm9tZS1zcGVjaWZpYyBzdGVwcy4uLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgcmVtb3ZlRnJvbVRydXN0U3RvcmVzKGNlcnRpZmljYXRlUGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgbGludXhJbmZvID0gYXdhaXQgY3VycmVudExpbnV4Rmxhdm9yRGV0YWlscygpO1xuICAgIGNvbnN0IHsgY2FGb2xkZXJzLCBwb3N0Q2FSZW1vdmFsQ29tbWFuZHMgfSA9IGxpbnV4SW5mbztcbiAgICBjYUZvbGRlcnMuZm9yRWFjaChmb2xkZXIgPT4ge1xuICAgICAgY29uc3QgY2VydFBhdGggPSBwYXRoLmpvaW4oZm9sZGVyLCAnZGV2Y2VydC5jcnQnKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGV4aXN0cyA9IGV4aXN0c1N5bmMoY2VydFBhdGgpO1xuICAgICAgICBkZWJ1Zyh7IGV4aXN0cyB9KTtcbiAgICAgICAgaWYgKCFleGlzdHMpIHtcbiAgICAgICAgICBkZWJ1ZyhgY2VydCBhdCBsb2NhdGlvbiAke2NlcnRQYXRofSB3YXMgbm90IGZvdW5kLiBTa2lwcGluZy4uLmApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBydW4oYHN1ZG8gcm0gXCIke2NlcnRpZmljYXRlUGF0aH1cIiAke2NlcnRQYXRofWApO1xuICAgICAgICAgIHBvc3RDYVJlbW92YWxDb21tYW5kcy5mb3JFYWNoKCh7IGNvbW1hbmQsIGFyZ3MgfSkgPT4ge1xuICAgICAgICAgICAgcnVuKGAke2NvbW1hbmR9ICR7YXJncy5qb2luKCcgJyl9YC50cmltKCkpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGRlYnVnKFxuICAgICAgICAgIGBmYWlsZWQgdG8gcmVtb3ZlICR7Y2VydGlmaWNhdGVQYXRofSBmcm9tICR7Y2VydFBhdGh9LCBjb250aW51aW5nLiAke2UudG9TdHJpbmcoKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgLy8gcnVuKGBzdWRvIGJhc2ggLWMgXCJjYXQgJHsgY2VydGlmaWNhdGVQYXRoIH0gPj4gL2V0Yy9zc2wvY2VydHMvY2EtY2VydGlmaWNhdGVzLmNydFwiYCk7XG5cbiAgICBpZiAoY29tbWFuZEV4aXN0cygnY2VydHV0aWwnKSkge1xuICAgICAgaWYgKHRoaXMuaXNGaXJlZm94SW5zdGFsbGVkKCkpIHtcbiAgICAgICAgcmVtb3ZlQ2VydGlmaWNhdGVGcm9tTlNTQ2VydERCKFxuICAgICAgICAgIHRoaXMuRklSRUZPWF9OU1NfRElSLFxuICAgICAgICAgIGNlcnRpZmljYXRlUGF0aCxcbiAgICAgICAgICAnY2VydHV0aWwnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAodGhpcy5pc0Nocm9tZUluc3RhbGxlZCgpKSB7XG4gICAgICAgIHJlbW92ZUNlcnRpZmljYXRlRnJvbU5TU0NlcnREQihcbiAgICAgICAgICB0aGlzLkNIUk9NRV9OU1NfRElSLFxuICAgICAgICAgIGNlcnRpZmljYXRlUGF0aCxcbiAgICAgICAgICAnY2VydHV0aWwnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYWRkRG9tYWluVG9Ib3N0RmlsZUlmTWlzc2luZyhkb21haW46IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IGhvc3RzRmlsZUNvbnRlbnRzID0gcmVhZCh0aGlzLkhPU1RfRklMRV9QQVRILCAndXRmOCcpO1xuICAgIGlmICghaG9zdHNGaWxlQ29udGVudHMuaW5jbHVkZXMoZG9tYWluKSkge1xuICAgICAgcnVuKFxuICAgICAgICBgZWNobyAnMTI3LjAuMC4xICAke2RvbWFpbn0nIHwgc3VkbyB0ZWUgLWEgXCIke3RoaXMuSE9TVF9GSUxFX1BBVEh9XCIgPiAvZGV2L251bGxgXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGRlbGV0ZVByb3RlY3RlZEZpbGVzKGZpbGVwYXRoOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBhc3NlcnROb3RUb3VjaGluZ0ZpbGVzKGZpbGVwYXRoLCAnZGVsZXRlJyk7XG4gICAgcnVuKGBzdWRvIHJtIC1yZiBcIiR7ZmlsZXBhdGh9XCJgKTtcbiAgfVxuXG4gIHJlYWRQcm90ZWN0ZWRGaWxlKGZpbGVwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGFzc2VydE5vdFRvdWNoaW5nRmlsZXMoZmlsZXBhdGgsICdyZWFkJyk7XG4gICAgcmV0dXJuIHJ1bihgc3VkbyBjYXQgXCIke2ZpbGVwYXRofVwiYClcbiAgICAgIC50b1N0cmluZygpXG4gICAgICAudHJpbSgpO1xuICB9XG5cbiAgd3JpdGVQcm90ZWN0ZWRGaWxlKGZpbGVwYXRoOiBzdHJpbmcsIGNvbnRlbnRzOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBhc3NlcnROb3RUb3VjaGluZ0ZpbGVzKGZpbGVwYXRoLCAnd3JpdGUnKTtcbiAgICBpZiAoZXhpc3RzKGZpbGVwYXRoKSkge1xuICAgICAgcnVuKGBzdWRvIHJtIFwiJHtmaWxlcGF0aH1cImApO1xuICAgIH1cbiAgICB3cml0ZUZpbGUoZmlsZXBhdGgsIGNvbnRlbnRzKTtcbiAgICBydW4oYHN1ZG8gY2hvd24gMCBcIiR7ZmlsZXBhdGh9XCJgKTtcbiAgICBydW4oYHN1ZG8gY2htb2QgNjAwIFwiJHtmaWxlcGF0aH1cImApO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0ZpcmVmb3hJbnN0YWxsZWQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGV4aXN0cyh0aGlzLkZJUkVGT1hfQklOX1BBVEgpO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0Nocm9tZUluc3RhbGxlZCgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZXhpc3RzKHRoaXMuQ0hST01FX0JJTl9QQVRIKTtcbiAgfVxufVxuIl19