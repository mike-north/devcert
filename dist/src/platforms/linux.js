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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGludXguanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInNyYy9wbGF0Zm9ybXMvbGludXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSw2QkFBNkI7QUFDN0IsMkJBS1k7QUFDWixxQ0FBcUM7QUFDckMsbURBQXVEO0FBQ3ZELHFDQU9rQjtBQUNsQixvQ0FBK0I7QUFFL0Isc0RBQW1DO0FBRW5DLHdDQUF3QztBQUN4QyxzQ0FBNkM7QUFFN0MsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLHlCQUF5QixDQUFDLENBQUM7QUFFckQsSUFBSyxXQUtKO0FBTEQsV0FBSyxXQUFXO0lBQ2QsbURBQVcsQ0FBQTtJQUNYLGlEQUFNLENBQUE7SUFDTiwrQ0FBSyxDQUFBO0lBQ0wsaURBQU0sQ0FBQTtBQUNSLENBQUMsRUFMSSxXQUFXLEtBQVgsV0FBVyxRQUtmO0FBRUQsS0FBSyxVQUFVLG9CQUFvQixDQUNqQyxnQkFBaUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7SUFFdEUsTUFBTSxNQUFNLEdBQUcsTUFBTSxhQUFhLENBQUM7SUFDbkMsUUFBUSxNQUFNLEVBQUU7UUFDZCxLQUFLLHNDQUFzQztZQUN6QyxPQUFPLEVBQUUsSUFBSSxFQUFFLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNyQyxLQUFLLFFBQVE7WUFDWCxPQUFPLEVBQUUsSUFBSSxFQUFFLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN0QyxLQUFLLFFBQVE7WUFDWCxPQUFPLEVBQUUsSUFBSSxFQUFFLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN0QztZQUNFLE9BQU87Z0JBQ0wsSUFBSSxFQUFFLFdBQVcsQ0FBQyxPQUFPO2dCQUN6QixPQUFPLEVBQUUseUJBQXlCLE1BQU0sRUFBRTthQUMzQyxDQUFDO0tBQ0w7QUFDSCxDQUFDO0FBYUQsU0FBUyxrQkFBa0IsQ0FDekIs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QixPQUFPLGVBQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDdEMsQ0FBQztDQUNGO0FBeEtELGdDQXdLQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQge1xuICBleGlzdHNTeW5jIGFzIGV4aXN0cyxcbiAgcmVhZEZpbGVTeW5jIGFzIHJlYWQsXG4gIHdyaXRlRmlsZVN5bmMgYXMgd3JpdGVGaWxlLFxuICBleGlzdHNTeW5jXG59IGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIGNyZWF0ZURlYnVnIGZyb20gJ2RlYnVnJztcbmltcG9ydCB7IHN5bmMgYXMgY29tbWFuZEV4aXN0cyB9IGZyb20gJ2NvbW1hbmQtZXhpc3RzJztcbmltcG9ydCB7XG4gIGFkZENlcnRpZmljYXRlVG9OU1NDZXJ0REIsXG4gIGFzc2VydE5vdFRvdWNoaW5nRmlsZXMsXG4gIG9wZW5DZXJ0aWZpY2F0ZUluRmlyZWZveCxcbiAgY2xvc2VGaXJlZm94LFxuICByZW1vdmVDZXJ0aWZpY2F0ZUZyb21OU1NDZXJ0REIsXG4gIEhPTUVcbn0gZnJvbSAnLi9zaGFyZWQnO1xuaW1wb3J0IHsgcnVuIH0gZnJvbSAnLi4vdXRpbHMnO1xuaW1wb3J0IHsgT3B0aW9ucyB9IGZyb20gJy4uL2luZGV4JztcbmltcG9ydCBVSSBmcm9tICcuLi91c2VyLWludGVyZmFjZSc7XG5pbXBvcnQgeyBQbGF0Zm9ybSB9IGZyb20gJy4nO1xuaW1wb3J0ICogYXMgc2kgZnJvbSAnc3lzdGVtaW5mb3JtYXRpb24nO1xuaW1wb3J0IHsgVW5yZWFjaGFibGVFcnJvciB9IGZyb20gJy4uL2Vycm9ycyc7XG5cbmNvbnN0IGRlYnVnID0gY3JlYXRlRGVidWcoJ2RldmNlcnQ6cGxhdGZvcm1zOmxpbnV4Jyk7XG5cbmVudW0gTGludXhGbGF2b3Ige1xuICBVbmtub3duID0gMCxcbiAgVWJ1bnR1LFxuICBSaGVsNyxcbiAgRmVkb3JhXG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRldGVybWluZUxpbnV4Rmxhdm9yKFxuICBkaXN0cm9Qcm9taXNlOiBQcm9taXNlPHN0cmluZz4gPSBzaS5vc0luZm8oKS50aGVuKGluZm8gPT4gaW5mby5kaXN0cm8pXG4pOiBQcm9taXNlPHsgZmxhdjogTGludXhGbGF2b3I7IG1lc3NhZ2U/OiBzdHJpbmcgfT4ge1xuICBjb25zdCBkaXN0cm8gPSBhd2FpdCBkaXN0cm9Qcm9taXNlO1xuICBzd2l0Y2ggKGRpc3Rybykge1xuICAgIGNhc2UgJ1JlZCBIYXQgRW50ZXJwcmlzZSBMaW51eCBXb3Jrc3RhdGlvbic6XG4gICAgICByZXR1cm4geyBmbGF2OiBMaW51eEZsYXZvci5SaGVsNyB9O1xuICAgIGNhc2UgJ1VidW50dSc6XG4gICAgICByZXR1cm4geyBmbGF2OiBMaW51eEZsYXZvci5VYnVudHUgfTtcbiAgICBjYXNlICdGZWRvcmEnOlxuICAgICAgcmV0dXJuIHsgZmxhdjogTGludXhGbGF2b3IuRmVkb3JhIH07XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGZsYXY6IExpbnV4Rmxhdm9yLlVua25vd24sXG4gICAgICAgIG1lc3NhZ2U6IGBVbmtub3duIGxpbnV4IGRpc3RybzogJHtkaXN0cm99YFxuICAgICAgfTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgQ21kIHtcbiAgY29tbWFuZDogc3RyaW5nO1xuICBhcmdzOiBzdHJpbmdbXTtcbn1cblxuaW50ZXJmYWNlIExpbnV4Rmxhdm9yRGV0YWlscyB7XG4gIGNhRm9sZGVyczogc3RyaW5nW107XG4gIHBvc3RDYVBsYWNlbWVudENvbW1hbmRzOiBDbWRbXTtcbiAgcG9zdENhUmVtb3ZhbENvbW1hbmRzOiBDbWRbXTtcbn1cblxuZnVuY3Rpb24gbGludXhGbGF2b3JEZXRhaWxzKFxuICBmbGF2b3I6IEV4Y2x1ZGU8TGludXhGbGF2b3IsIExpbnV4Rmxhdm9yLlVua25vd24+XG4pOiBMaW51eEZsYXZvckRldGFpbHMge1xuICBzd2l0Y2ggKGZsYXZvcikge1xuICAgIGNhc2UgTGludXhGbGF2b3IuUmhlbDc6XG4gICAgY2FzZSBMaW51eEZsYXZvci5GZWRvcmE6XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjYUZvbGRlcnM6IFtcbiAgICAgICAgICAnL2V0Yy9wa2kvY2EtdHJ1c3Qvc291cmNlL2FuY2hvcnMnLFxuICAgICAgICAgICcvdXNyL3NoYXJlL3BraS9jYS10cnVzdC1zb3VyY2UnXG4gICAgICAgIF0sXG4gICAgICAgIHBvc3RDYVBsYWNlbWVudENvbW1hbmRzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgY29tbWFuZDogJ3N1ZG8nLFxuICAgICAgICAgICAgYXJnczogWyd1cGRhdGUtY2EtdHJ1c3QnXVxuICAgICAgICAgIH1cbiAgICAgICAgXSxcbiAgICAgICAgcG9zdENhUmVtb3ZhbENvbW1hbmRzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgY29tbWFuZDogJ3N1ZG8nLFxuICAgICAgICAgICAgYXJnczogWyd1cGRhdGUtY2EtdHJ1c3QnXVxuICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgICAgfTtcbiAgICBjYXNlIExpbnV4Rmxhdm9yLlVidW50dTpcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNhRm9sZGVyczogW1xuICAgICAgICAgICcvZXRjL3BraS9jYS10cnVzdC9zb3VyY2UvYW5jaG9ycycsXG4gICAgICAgICAgJy91c3IvbG9jYWwvc2hhcmUvY2EtY2VydGlmaWNhdGVzJ1xuICAgICAgICBdLFxuICAgICAgICBwb3N0Q2FQbGFjZW1lbnRDb21tYW5kczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGNvbW1hbmQ6ICdzdWRvJyxcbiAgICAgICAgICAgIGFyZ3M6IFsndXBkYXRlLWNhLWNlcnRpZmljYXRlcyddXG4gICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICBwb3N0Q2FSZW1vdmFsQ29tbWFuZHM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBjb21tYW5kOiAnc3VkbycsXG4gICAgICAgICAgICBhcmdzOiBbJ3VwZGF0ZS1jYS1jZXJ0aWZpY2F0ZXMnXVxuICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgICAgfTtcblxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgVW5yZWFjaGFibGVFcnJvcihmbGF2b3IsICdVbmFibGUgdG8gZGV0ZWN0IGxpbnV4IGZsYXZvcicpO1xuICB9XG59XG5hc3luYyBmdW5jdGlvbiBjdXJyZW50TGludXhGbGF2b3JEZXRhaWxzKCk6IFByb21pc2U8TGludXhGbGF2b3JEZXRhaWxzPiB7XG4gIGNvbnN0IHsgZmxhdjogZmxhdm9yLCBtZXNzYWdlIH0gPSBhd2FpdCBkZXRlcm1pbmVMaW51eEZsYXZvcigpO1xuICBpZiAoIWZsYXZvcikgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpOyAvLyBUT0RPIGJldHRlciBlcnJvclxuICByZXR1cm4gbGludXhGbGF2b3JEZXRhaWxzKGZsYXZvcik7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIExpbnV4UGxhdGZvcm0gaW1wbGVtZW50cyBQbGF0Zm9ybSB7XG4gIHByaXZhdGUgRklSRUZPWF9OU1NfRElSID0gcGF0aC5qb2luKEhPTUUsICcubW96aWxsYS9maXJlZm94LyonKTtcbiAgcHJpdmF0ZSBDSFJPTUVfTlNTX0RJUiA9IHBhdGguam9pbihIT01FLCAnLnBraS9uc3NkYicpO1xuICBwcml2YXRlIEZJUkVGT1hfQklOX1BBVEggPSAnL3Vzci9iaW4vZmlyZWZveCc7XG4gIHByaXZhdGUgQ0hST01FX0JJTl9QQVRIID0gJy91c3IvYmluL2dvb2dsZS1jaHJvbWUnO1xuXG4gIHByaXZhdGUgSE9TVF9GSUxFX1BBVEggPSAnL2V0Yy9ob3N0cyc7XG5cbiAgLyoqXG4gICAqIExpbnV4IGlzIHN1cnByaXNpbmdseSBkaWZmaWN1bHQuIFRoZXJlIHNlZW1zIHRvIGJlIG11bHRpcGxlIHN5c3RlbS13aWRlXG4gICAqIHJlcG9zaXRvcmllcyBmb3IgY2VydHMsIHNvIHdlIGNvcHkgb3VycyB0byBlYWNoLiBIb3dldmVyLCBGaXJlZm94IGRvZXMgaXQnc1xuICAgKiB1c3VhbCBzZXBhcmF0ZSB0cnVzdCBzdG9yZS4gUGx1cyBDaHJvbWUgcmVsaWVzIG9uIHRoZSBOU1MgdG9vbGluZyAobGlrZVxuICAgKiBGaXJlZm94KSwgYnV0IHVzZXMgdGhlIHVzZXIncyBOU1MgZGF0YWJhc2UsIHVubGlrZSBGaXJlZm94ICh3aGljaCB1c2VzIGFcbiAgICogc2VwYXJhdGUgTW96aWxsYSBvbmUpLiBBbmQgc2luY2UgQ2hyb21lIGRvZXNuJ3QgcHJvbXB0IHRoZSB1c2VyIHdpdGggYSBHVUlcbiAgICogZmxvdyB3aGVuIG9wZW5pbmcgY2VydHMsIGlmIHdlIGNhbid0IHVzZSBjZXJ0dXRpbCB0byBpbnN0YWxsIG91ciBjZXJ0aWZpY2F0ZVxuICAgKiBpbnRvIHRoZSB1c2VyJ3MgTlNTIGRhdGFiYXNlLCB3ZSdyZSBvdXQgb2YgbHVjay5cbiAgICovXG4gIGFzeW5jIGFkZFRvVHJ1c3RTdG9yZXMoXG4gICAgY2VydGlmaWNhdGVQYXRoOiBzdHJpbmcsXG4gICAgb3B0aW9uczogT3B0aW9ucyA9IHt9XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGRlYnVnKCdBZGRpbmcgZGV2Y2VydCByb290IENBIHRvIExpbnV4IHN5c3RlbS13aWRlIHRydXN0IHN0b3JlcycpO1xuICAgIC8vIHJ1bihgc3VkbyBjcCAkeyBjZXJ0aWZpY2F0ZVBhdGggfSAvZXRjL3NzbC9jZXJ0cy9kZXZjZXJ0LmNydGApO1xuICAgIGNvbnN0IGxpbnV4SW5mbyA9IGF3YWl0IGN1cnJlbnRMaW51eEZsYXZvckRldGFpbHMoKTtcbiAgICBjb25zdCB7IGNhRm9sZGVycywgcG9zdENhUGxhY2VtZW50Q29tbWFuZHMgfSA9IGxpbnV4SW5mbztcbiAgICBjYUZvbGRlcnMuZm9yRWFjaChmb2xkZXIgPT4ge1xuICAgICAgcnVuKGBzdWRvIGNwIFwiJHtjZXJ0aWZpY2F0ZVBhdGh9XCIgJHtwYXRoLmpvaW4oZm9sZGVyLCAnZGV2Y2VydC5jcnQnKX1gKTtcbiAgICB9KTtcbiAgICAvLyBydW4oYHN1ZG8gYmFzaCAtYyBcImNhdCAkeyBjZXJ0aWZpY2F0ZVBhdGggfSA+PiAvZXRjL3NzbC9jZXJ0cy9jYS1jZXJ0aWZpY2F0ZXMuY3J0XCJgKTtcbiAgICBwb3N0Q2FQbGFjZW1lbnRDb21tYW5kcy5mb3JFYWNoKCh7IGNvbW1hbmQsIGFyZ3MgfSkgPT4ge1xuICAgICAgcnVuKGAke2NvbW1hbmR9ICR7YXJncy5qb2luKCcgJyl9YC50cmltKCkpO1xuICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuaXNGaXJlZm94SW5zdGFsbGVkKCkpIHtcbiAgICAgIC8vIEZpcmVmb3hcbiAgICAgIGRlYnVnKFxuICAgICAgICAnRmlyZWZveCBpbnN0YWxsIGRldGVjdGVkOiBhZGRpbmcgZGV2Y2VydCByb290IENBIHRvIEZpcmVmb3gtc3BlY2lmaWMgdHJ1c3Qgc3RvcmVzIC4uLidcbiAgICAgICk7XG4gICAgICBpZiAoIWNvbW1hbmRFeGlzdHMoJ2NlcnR1dGlsJykpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMuc2tpcENlcnR1dGlsSW5zdGFsbCkge1xuICAgICAgICAgIGRlYnVnKFxuICAgICAgICAgICAgJ05TUyB0b29saW5nIGlzIG5vdCBhbHJlYWR5IGluc3RhbGxlZCwgYW5kIGBza2lwQ2VydHV0aWxgIGlzIHRydWUsIHNvIGZhbGxpbmcgYmFjayB0byBtYW51YWwgY2VydGlmaWNhdGUgaW5zdGFsbCBmb3IgRmlyZWZveCdcbiAgICAgICAgICApO1xuICAgICAgICAgIG9wZW5DZXJ0aWZpY2F0ZUluRmlyZWZveCh0aGlzLkZJUkVGT1hfQklOX1BBVEgsIGNlcnRpZmljYXRlUGF0aCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZGVidWcoXG4gICAgICAgICAgICAnTlNTIHRvb2xpbmcgaXMgbm90IGFscmVhZHkgaW5zdGFsbGVkLiBUcnlpbmcgdG8gaW5zdGFsbCBOU1MgdG9vbGluZyBub3cgd2l0aCBgYXB0IGluc3RhbGxgJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgcnVuKCdzdWRvIGFwdCBpbnN0YWxsIGxpYm5zczMtdG9vbHMnKTtcbiAgICAgICAgICBkZWJ1ZyhcbiAgICAgICAgICAgICdJbnN0YWxsaW5nIGNlcnRpZmljYXRlIGludG8gRmlyZWZveCB0cnVzdCBzdG9yZXMgdXNpbmcgTlNTIHRvb2xpbmcnXG4gICAgICAgICAgKTtcbiAgICAgICAgICBhd2FpdCBjbG9zZUZpcmVmb3goKTtcbiAgICAgICAgICBhZGRDZXJ0aWZpY2F0ZVRvTlNTQ2VydERCKFxuICAgICAgICAgICAgdGhpcy5GSVJFRk9YX05TU19ESVIsXG4gICAgICAgICAgICBjZXJ0aWZpY2F0ZVBhdGgsXG4gICAgICAgICAgICAnY2VydHV0aWwnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1ZyhcbiAgICAgICAgJ0ZpcmVmb3ggZG9lcyBub3QgYXBwZWFyIHRvIGJlIGluc3RhbGxlZCwgc2tpcHBpbmcgRmlyZWZveC1zcGVjaWZpYyBzdGVwcy4uLidcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuaXNDaHJvbWVJbnN0YWxsZWQoKSkge1xuICAgICAgZGVidWcoXG4gICAgICAgICdDaHJvbWUgaW5zdGFsbCBkZXRlY3RlZDogYWRkaW5nIGRldmNlcnQgcm9vdCBDQSB0byBDaHJvbWUgdHJ1c3Qgc3RvcmUgLi4uJ1xuICAgICAgKTtcbiAgICAgIGlmICghY29tbWFuZEV4aXN0cygnY2VydHV0aWwnKSkge1xuICAgICAgICBVSS53YXJuQ2hyb21lT25MaW51eFdpdGhvdXRDZXJ0dXRpbCgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgY2xvc2VGaXJlZm94KCk7XG4gICAgICAgIGFkZENlcnRpZmljYXRlVG9OU1NDZXJ0REIoXG4gICAgICAgICAgdGhpcy5DSFJPTUVfTlNTX0RJUixcbiAgICAgICAgICBjZXJ0aWZpY2F0ZVBhdGgsXG4gICAgICAgICAgJ2NlcnR1dGlsJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1ZyhcbiAgICAgICAgJ0Nocm9tZSBkb2VzIG5vdCBhcHBlYXIgdG8gYmUgaW5zdGFsbGVkLCBza2lwcGluZyBDaHJvbWUtc3BlY2lmaWMgc3RlcHMuLi4nXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJlbW92ZUZyb21UcnVzdFN0b3JlcyhjZXJ0aWZpY2F0ZVBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGxpbnV4SW5mbyA9IGF3YWl0IGN1cnJlbnRMaW51eEZsYXZvckRldGFpbHMoKTtcbiAgICBjb25zdCB7IGNhRm9sZGVycywgcG9zdENhUmVtb3ZhbENvbW1hbmRzIH0gPSBsaW51eEluZm87XG4gICAgY2FGb2xkZXJzLmZvckVhY2goZm9sZGVyID0+IHtcbiAgICAgIGNvbnN0IGNlcnRQYXRoID0gcGF0aC5qb2luKGZvbGRlciwgJ2RldmNlcnQuY3J0Jyk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBleGlzdHMgPSBleGlzdHNTeW5jKGNlcnRQYXRoKTtcbiAgICAgICAgZGVidWcoeyBleGlzdHMgfSk7XG4gICAgICAgIGlmICghZXhpc3RzKSB7XG4gICAgICAgICAgZGVidWcoYGNlcnQgYXQgbG9jYXRpb24gJHtjZXJ0UGF0aH0gd2FzIG5vdCBmb3VuZC4gU2tpcHBpbmcuLi5gKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcnVuKGBzdWRvIHJtIFwiJHtjZXJ0aWZpY2F0ZVBhdGh9XCIgJHtjZXJ0UGF0aH1gKTtcbiAgICAgICAgICBwb3N0Q2FSZW1vdmFsQ29tbWFuZHMuZm9yRWFjaCgoeyBjb21tYW5kLCBhcmdzIH0pID0+IHtcbiAgICAgICAgICAgIHJ1bihgJHtjb21tYW5kfSAke2FyZ3Muam9pbignICcpfWAudHJpbSgpKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBkZWJ1ZyhcbiAgICAgICAgICBgZmFpbGVkIHRvIHJlbW92ZSAke2NlcnRpZmljYXRlUGF0aH0gZnJvbSAke2NlcnRQYXRofSwgY29udGludWluZy4gJHtlLnRvU3RyaW5nKCl9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICAgIC8vIHJ1bihgc3VkbyBiYXNoIC1jIFwiY2F0ICR7IGNlcnRpZmljYXRlUGF0aCB9ID4+IC9ldGMvc3NsL2NlcnRzL2NhLWNlcnRpZmljYXRlcy5jcnRcImApO1xuXG4gICAgaWYgKGNvbW1hbmRFeGlzdHMoJ2NlcnR1dGlsJykpIHtcbiAgICAgIGlmICh0aGlzLmlzRmlyZWZveEluc3RhbGxlZCgpKSB7XG4gICAgICAgIHJlbW92ZUNlcnRpZmljYXRlRnJvbU5TU0NlcnREQihcbiAgICAgICAgICB0aGlzLkZJUkVGT1hfTlNTX0RJUixcbiAgICAgICAgICBjZXJ0aWZpY2F0ZVBhdGgsXG4gICAgICAgICAgJ2NlcnR1dGlsJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKHRoaXMuaXNDaHJvbWVJbnN0YWxsZWQoKSkge1xuICAgICAgICByZW1vdmVDZXJ0aWZpY2F0ZUZyb21OU1NDZXJ0REIoXG4gICAgICAgICAgdGhpcy5DSFJPTUVfTlNTX0RJUixcbiAgICAgICAgICBjZXJ0aWZpY2F0ZVBhdGgsXG4gICAgICAgICAgJ2NlcnR1dGlsJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGFkZERvbWFpblRvSG9zdEZpbGVJZk1pc3NpbmcoZG9tYWluOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBob3N0c0ZpbGVDb250ZW50cyA9IHJlYWQodGhpcy5IT1NUX0ZJTEVfUEFUSCwgJ3V0ZjgnKTtcbiAgICBpZiAoIWhvc3RzRmlsZUNvbnRlbnRzLmluY2x1ZGVzKGRvbWFpbikpIHtcbiAgICAgIHJ1bihcbiAgICAgICAgYGVjaG8gJzEyNy4wLjAuMSAgJHtkb21haW59JyB8IHN1ZG8gdGVlIC1hIFwiJHt0aGlzLkhPU1RfRklMRV9QQVRIfVwiID4gL2Rldi9udWxsYFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBkZWxldGVQcm90ZWN0ZWRGaWxlcyhmaWxlcGF0aDogc3RyaW5nKTogdm9pZCB7XG4gICAgYXNzZXJ0Tm90VG91Y2hpbmdGaWxlcyhmaWxlcGF0aCwgJ2RlbGV0ZScpO1xuICAgIHJ1bihgc3VkbyBybSAtcmYgXCIke2ZpbGVwYXRofVwiYCk7XG4gIH1cblxuICByZWFkUHJvdGVjdGVkRmlsZShmaWxlcGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBhc3NlcnROb3RUb3VjaGluZ0ZpbGVzKGZpbGVwYXRoLCAncmVhZCcpO1xuICAgIHJldHVybiBydW4oYHN1ZG8gY2F0IFwiJHtmaWxlcGF0aH1cImApXG4gICAgICAudG9TdHJpbmcoKVxuICAgICAgLnRyaW0oKTtcbiAgfVxuXG4gIHdyaXRlUHJvdGVjdGVkRmlsZShmaWxlcGF0aDogc3RyaW5nLCBjb250ZW50czogc3RyaW5nKTogdm9pZCB7XG4gICAgYXNzZXJ0Tm90VG91Y2hpbmdGaWxlcyhmaWxlcGF0aCwgJ3dyaXRlJyk7XG4gICAgaWYgKGV4aXN0cyhmaWxlcGF0aCkpIHtcbiAgICAgIHJ1bihgc3VkbyBybSBcIiR7ZmlsZXBhdGh9XCJgKTtcbiAgICB9XG4gICAgd3JpdGVGaWxlKGZpbGVwYXRoLCBjb250ZW50cyk7XG4gICAgcnVuKGBzdWRvIGNob3duIDAgXCIke2ZpbGVwYXRofVwiYCk7XG4gICAgcnVuKGBzdWRvIGNobW9kIDYwMCBcIiR7ZmlsZXBhdGh9XCJgKTtcbiAgfVxuXG4gIHByaXZhdGUgaXNGaXJlZm94SW5zdGFsbGVkKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBleGlzdHModGhpcy5GSVJFRk9YX0JJTl9QQVRIKTtcbiAgfVxuXG4gIHByaXZhdGUgaXNDaHJvbWVJbnN0YWxsZWQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGV4aXN0cyh0aGlzLkNIUk9NRV9CSU5fUEFUSCk7XG4gIH1cbn1cbiJdfQ==