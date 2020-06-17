"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const url = require("url");
const createDebug = require("debug");
const assert = require("assert");
const getPort = require("get-port");
const http = require("http");
const fs_1 = require("fs");
const glob_1 = require("glob");
const fs_2 = require("fs");
const utils_1 = require("../utils");
const constants_1 = require("../constants");
const user_interface_1 = require("../user-interface");
const child_process_1 = require("child_process");
const debug = createDebug('devcert:platforms:shared');
exports.HOME = process.env.HOME
    ? process.env.HOME
    : (function () {
        throw new Error('HOME environment variable was not set. It should be something like "/Users/exampleName"');
    })();
/**
 *  Given a directory or glob pattern of directories, run a callback for each db
 *  directory, with a version argument.
 */
function doForNSSCertDB(nssDirGlob, callback) {
    glob_1.sync(nssDirGlob).forEach(potentialNSSDBDir => {
        debug(`checking to see if ${potentialNSSDBDir} is a valid NSS database directory`);
        if (fs_2.existsSync(path.join(potentialNSSDBDir, 'cert8.db'))) {
            debug(`Found legacy NSS database in ${potentialNSSDBDir}, running callback...`);
            callback(potentialNSSDBDir, 'legacy');
        }
        if (fs_2.existsSync(path.join(potentialNSSDBDir, 'cert9.db'))) {
            debug(`Found modern NSS database in ${potentialNSSDBDir}, running callback...`);
            callback(potentialNSSDBDir, 'modern');
        }
    });
}
/**
 *  Given a directory or glob pattern of directories, attempt to install the
 *  CA certificate to each directory containing an NSS database.
 */
function addCertificateToNSSCertDB(nssDirGlob, certPath, certutilPath) {
    debug(`trying to install certificate into NSS databases in ${nssDirGlob}`);
    doForNSSCertDB(nssDirGlob, (dir, version) => {
        const dirArg = version === 'modern' ? `sql:${dir}` : dir;
        utils_1.run(`${certutilPath} -A -d "${dirArg}" -t 'C,,' -i "${certPath}" -n devcert`);
    });
    debug(`finished scanning & installing certificate in NSS databases in ${nssDirGlob}`);
}
exports.addCertificateToNSSCertDB = addCertificateToNSSCertDB;
function removeCertificateFromNSSCertDB(nssDirGlob, certPath, certutilPath) {
    debug(`trying to remove certificates from NSS databases in ${nssDirGlob}`);
    doForNSSCertDB(nssDirGlob, (dir, version) => {
        const dirArg = version === 'modern' ? `sql:${dir}` : dir;
        try {
            if (fs_1.existsSync(certPath)) {
                utils_1.run(`${certutilPath} -A -d "${dirArg}" -t 'C,,' -i "${certPath}" -n devcert`);
            }
        }
        catch (e) {
            debug(`failed to remove ${certPath} from ${dir}, continuing. ${e.toString()}`);
        }
    });
    debug(`finished scanning & installing certificate in NSS databases in ${nssDirGlob}`);
}
exports.removeCertificateFromNSSCertDB = removeCertificateFromNSSCertDB;
/**
 *  Check to see if Firefox is still running, and if so, ask the user to close
 *  it. Poll until it's closed, then return.
 *
 * This is needed because Firefox appears to load the NSS database in-memory on
 * startup, and overwrite on exit. So we have to ask the user to quite Firefox
 * first so our changes don't get overwritten.
 */
async function closeFirefox() {
    if (isFirefoxOpen()) {
        await user_interface_1.default.closeFirefoxBeforeContinuing();
        while (isFirefoxOpen()) {
            await sleep(50);
        }
    }
}
exports.closeFirefox = closeFirefox;
/**
 * Check if Firefox is currently open
 */
function isFirefoxOpen() {
    // NOTE: We use some Windows-unfriendly methods here (ps) because Windows
    // never needs to check this, because it doesn't update the NSS DB
    // automaticaly.
    assert(constants_1.isMac || constants_1.isLinux, 'checkForOpenFirefox was invoked on a platform other than Mac or Linux');
    return child_process_1.execSync('ps aux').indexOf('firefox') > -1;
}
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Firefox manages it's own trust store for SSL certificates, which can be
 * managed via the certutil command (supplied by NSS tooling packages). In the
 * event that certutil is not already installed, and either can't be installed
 * (Windows) or the user doesn't want to install it (skipCertutilInstall:
 * true), it means that we can't programmatically tell Firefox to trust our
 * root CA certificate.
 *
 * There is a recourse though. When a Firefox tab is directed to a URL that
 * responds with a certificate, it will automatically prompt the user if they
 * want to add it to their trusted certificates. So if we can't automatically
 * install the certificate via certutil, we instead start a quick web server
 * and host our certificate file. Then we open the hosted cert URL in Firefox
 * to kick off the GUI flow.
 *
 * This method does all this, along with providing user prompts in the terminal
 * to walk them through this process.
 */
async function openCertificateInFirefox(firefoxPath, certPath) {
    debug('Adding devert to Firefox trust stores manually. Launching a webserver to host our certificate temporarily ...');
    const port = await getPort();
    const server = http
        .createServer((req, res) => {
        const { url: reqUrl } = req;
        if (!reqUrl)
            throw new Error(`Request url was found to be empty: "${JSON.stringify(reqUrl)}"`);
        const { pathname } = url.parse(reqUrl);
        if (pathname === '/certificate') {
            res.writeHead(200, { 'Content-type': 'application/x-x509-ca-cert' });
            res.write(fs_2.readFileSync(certPath));
            res.end();
        }
        else {
            res.writeHead(200);
            Promise.resolve(user_interface_1.default.firefoxWizardPromptPage(`http://localhost:${port}/certificate`)).then(userResponse => {
                res.write(userResponse);
                res.end();
            });
        }
    })
        .listen(port);
    debug('Certificate server is up. Printing instructions for user and launching Firefox with hosted certificate URL');
    await user_interface_1.default.startFirefoxWizard(`http://localhost:${port}`);
    utils_1.run(`${firefoxPath} http://localhost:${port}`);
    await user_interface_1.default.waitForFirefoxWizard();
    server.close();
}
exports.openCertificateInFirefox = openCertificateInFirefox;
function assertNotTouchingFiles(filepath, operation) {
    if (!filepath.startsWith(constants_1.configDir) &&
        !filepath.startsWith(constants_1.getLegacyConfigDir())) {
        throw new Error(`Devcert cannot ${operation} ${filepath}; it is outside known devcert config directories!`);
    }
}
exports.assertNotTouchingFiles = assertNotTouchingFiles;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hhcmVkLmpzIiwic291cmNlUm9vdCI6Ii4vIiwic291cmNlcyI6WyJzcmMvcGxhdGZvcm1zL3NoYXJlZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDZCQUE2QjtBQUM3QiwyQkFBMkI7QUFDM0IscUNBQXFDO0FBQ3JDLGlDQUFpQztBQUNqQyxvQ0FBb0M7QUFDcEMsNkJBQTZCO0FBQzdCLDJCQUFnQztBQUNoQywrQkFBb0M7QUFDcEMsMkJBQW9FO0FBQ3BFLG9DQUErQjtBQUMvQiw0Q0FBNkU7QUFDN0Usc0RBQW1DO0FBQ25DLGlEQUFpRDtBQUVqRCxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUV6QyxRQUFBLElBQUksR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUk7SUFDbEMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSTtJQUNsQixDQUFDLENBQUMsQ0FBQztRQUNDLE1BQU0sSUFBSSxLQUFLLENBQ2IseUZBQXlGLENBQzFGLENBQUM7SUFDSixDQUFDLENBQUMsRUFBRSxDQUFDO0FBRVQ7OztHQUdHO0FBQ0gsU0FBUyxjQUFjLENBQ3JCLFVBQWtCLEVBQ2xCLFFBQTZEO0lBRTdELFdBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsRUFBRTtRQUMzQyxLQUFLLENBQ0gsc0JBQXNCLGlCQUFpQixvQ0FBb0MsQ0FDNUUsQ0FBQztRQUNGLElBQUksZUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLENBQUMsRUFBRTtZQUNwRCxLQUFLLENBQ0gsZ0NBQWdDLGlCQUFpQix1QkFBdUIsQ0FDekUsQ0FBQztZQUNGLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxRQUFRLENBQUMsQ0FBQztTQUN2QztRQUNELElBQUksZUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLENBQUMsRUFB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QUFNLHdCQUFFLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztJQUNoQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7QUFDakIsQ0FBQztBQXRDRCw0REFzQ0M7QUFFRCxTQUFnQixzQkFBc0IsQ0FDcEMsUUFBZ0IsRUFDaEIsU0FBaUI7SUFFakIsSUFDRSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMscUJBQVMsQ0FBQztRQUMvQixDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsOEJBQWtCLEVBQUUsQ0FBQyxFQUMxQztRQUNBLE1BQU0sSUFBSSxLQUFLLENBQ2Isa0JBQWtCLFNBQVMsSUFBSSxRQUFRLG1EQUFtRCxDQUMzRixDQUFDO0tBQ0g7QUFDSCxDQUFDO0FBWkQsd0RBWUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0ICogYXMgdXJsIGZyb20gJ3VybCc7XG5pbXBvcnQgKiBhcyBjcmVhdGVEZWJ1ZyBmcm9tICdkZWJ1Zyc7XG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGdldFBvcnQgZnJvbSAnZ2V0LXBvcnQnO1xuaW1wb3J0ICogYXMgaHR0cCBmcm9tICdodHRwJztcbmltcG9ydCB7IGV4aXN0c1N5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBzeW5jIGFzIGdsb2IgfSBmcm9tICdnbG9iJztcbmltcG9ydCB7IHJlYWRGaWxlU3luYyBhcyByZWFkRmlsZSwgZXhpc3RzU3luYyBhcyBleGlzdHMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBydW4gfSBmcm9tICcuLi91dGlscyc7XG5pbXBvcnQgeyBpc01hYywgaXNMaW51eCwgY29uZmlnRGlyLCBnZXRMZWdhY3lDb25maWdEaXIgfSBmcm9tICcuLi9jb25zdGFudHMnO1xuaW1wb3J0IFVJIGZyb20gJy4uL3VzZXItaW50ZXJmYWNlJztcbmltcG9ydCB7IGV4ZWNTeW5jIGFzIGV4ZWMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcblxuY29uc3QgZGVidWcgPSBjcmVhdGVEZWJ1ZygnZGV2Y2VydDpwbGF0Zm9ybXM6c2hhcmVkJyk7XG5cbmV4cG9ydCBjb25zdCBIT01FID0gcHJvY2Vzcy5lbnYuSE9NRVxuICA/IHByb2Nlc3MuZW52LkhPTUVcbiAgOiAoZnVuY3Rpb24oKTogbmV2ZXIge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAnSE9NRSBlbnZpcm9ubWVudCB2YXJpYWJsZSB3YXMgbm90IHNldC4gSXQgc2hvdWxkIGJlIHNvbWV0aGluZyBsaWtlIFwiL1VzZXJzL2V4YW1wbGVOYW1lXCInXG4gICAgICApO1xuICAgIH0pKCk7XG5cbi8qKlxuICogIEdpdmVuIGEgZGlyZWN0b3J5IG9yIGdsb2IgcGF0dGVybiBvZiBkaXJlY3RvcmllcywgcnVuIGEgY2FsbGJhY2sgZm9yIGVhY2ggZGJcbiAqICBkaXJlY3RvcnksIHdpdGggYSB2ZXJzaW9uIGFyZ3VtZW50LlxuICovXG5mdW5jdGlvbiBkb0Zvck5TU0NlcnREQihcbiAgbnNzRGlyR2xvYjogc3RyaW5nLFxuICBjYWxsYmFjazogKGRpcjogc3RyaW5nLCB2ZXJzaW9uOiAnbGVnYWN5JyB8ICdtb2Rlcm4nKSA9PiB2b2lkXG4pOiB2b2lkIHtcbiAgZ2xvYihuc3NEaXJHbG9iKS5mb3JFYWNoKHBvdGVudGlhbE5TU0RCRGlyID0+IHtcbiAgICBkZWJ1ZyhcbiAgICAgIGBjaGVja2luZyB0byBzZWUgaWYgJHtwb3RlbnRpYWxOU1NEQkRpcn0gaXMgYSB2YWxpZCBOU1MgZGF0YWJhc2UgZGlyZWN0b3J5YFxuICAgICk7XG4gICAgaWYgKGV4aXN0cyhwYXRoLmpvaW4ocG90ZW50aWFsTlNTREJEaXIsICdjZXJ0OC5kYicpKSkge1xuICAgICAgZGVidWcoXG4gICAgICAgIGBGb3VuZCBsZWdhY3kgTlNTIGRhdGFiYXNlIGluICR7cG90ZW50aWFsTlNTREJEaXJ9LCBydW5uaW5nIGNhbGxiYWNrLi4uYFxuICAgICAgKTtcbiAgICAgIGNhbGxiYWNrKHBvdGVudGlhbE5TU0RCRGlyLCAnbGVnYWN5Jyk7XG4gICAgfVxuICAgIGlmIChleGlzdHMocGF0aC5qb2luKHBvdGVudGlhbE5TU0RCRGlyLCAnY2VydDkuZGInKSkpIHtcbiAgICAgIGRlYnVnKFxuICAgICAgICBgRm91bmQgbW9kZXJuIE5TUyBkYXRhYmFzZSBpbiAke3BvdGVudGlhbE5TU0RCRGlyfSwgcnVubmluZyBjYWxsYmFjay4uLmBcbiAgICAgICk7XG4gICAgICBjYWxsYmFjayhwb3RlbnRpYWxOU1NEQkRpciwgJ21vZGVybicpO1xuICAgIH1cbiAgfSk7XG59XG5cbi8qKlxuICogIEdpdmVuIGEgZGlyZWN0b3J5IG9yIGdsb2IgcGF0dGVybiBvZiBkaXJlY3RvcmllcywgYXR0ZW1wdCB0byBpbnN0YWxsIHRoZVxuICogIENBIGNlcnRpZmljYXRlIHRvIGVhY2ggZGlyZWN0b3J5IGNvbnRhaW5pbmcgYW4gTlNTIGRhdGFiYXNlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYWRkQ2VydGlmaWNhdGVUb05TU0NlcnREQihcbiAgbnNzRGlyR2xvYjogc3RyaW5nLFxuICBjZXJ0UGF0aDogc3RyaW5nLFxuICBjZXJ0dXRpbFBhdGg6IHN0cmluZ1xuKTogdm9pZCB7XG4gIGRlYnVnKGB0cnlpbmcgdG8gaW5zdGFsbCBjZXJ0aWZpY2F0ZSBpbnRvIE5TUyBkYXRhYmFzZXMgaW4gJHtuc3NEaXJHbG9ifWApO1xuICBkb0Zvck5TU0NlcnREQihuc3NEaXJHbG9iLCAoZGlyLCB2ZXJzaW9uKSA9PiB7XG4gICAgY29uc3QgZGlyQXJnID0gdmVyc2lvbiA9PT0gJ21vZGVybicgPyBgc3FsOiR7ZGlyfWAgOiBkaXI7XG4gICAgcnVuKFxuICAgICAgYCR7Y2VydHV0aWxQYXRofSAtQSAtZCBcIiR7ZGlyQXJnfVwiIC10ICdDLCwnIC1pIFwiJHtjZXJ0UGF0aH1cIiAtbiBkZXZjZXJ0YFxuICAgICk7XG4gIH0pO1xuICBkZWJ1ZyhcbiAgICBgZmluaXNoZWQgc2Nhbm5pbmcgJiBpbnN0YWxsaW5nIGNlcnRpZmljYXRlIGluIE5TUyBkYXRhYmFzZXMgaW4gJHtuc3NEaXJHbG9ifWBcbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUNlcnRpZmljYXRlRnJvbU5TU0NlcnREQihcbiAgbnNzRGlyR2xvYjogc3RyaW5nLFxuICBjZXJ0UGF0aDogc3RyaW5nLFxuICBjZXJ0dXRpbFBhdGg6IHN0cmluZ1xuKTogdm9pZCB7XG4gIGRlYnVnKGB0cnlpbmcgdG8gcmVtb3ZlIGNlcnRpZmljYXRlcyBmcm9tIE5TUyBkYXRhYmFzZXMgaW4gJHtuc3NEaXJHbG9ifWApO1xuICBkb0Zvck5TU0NlcnREQihuc3NEaXJHbG9iLCAoZGlyLCB2ZXJzaW9uKSA9PiB7XG4gICAgY29uc3QgZGlyQXJnID0gdmVyc2lvbiA9PT0gJ21vZGVybicgPyBgc3FsOiR7ZGlyfWAgOiBkaXI7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChleGlzdHNTeW5jKGNlcnRQYXRoKSkge1xuICAgICAgICBydW4oXG4gICAgICAgICAgYCR7Y2VydHV0aWxQYXRofSAtQSAtZCBcIiR7ZGlyQXJnfVwiIC10ICdDLCwnIC1pIFwiJHtjZXJ0UGF0aH1cIiAtbiBkZXZjZXJ0YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGRlYnVnKFxuICAgICAgICBgZmFpbGVkIHRvIHJlbW92ZSAke2NlcnRQYXRofSBmcm9tICR7ZGlyfSwgY29udGludWluZy4gJHtlLnRvU3RyaW5nKCl9YFxuICAgICAgKTtcbiAgICB9XG4gIH0pO1xuICBkZWJ1ZyhcbiAgICBgZmluaXNoZWQgc2Nhbm5pbmcgJiBpbnN0YWxsaW5nIGNlcnRpZmljYXRlIGluIE5TUyBkYXRhYmFzZXMgaW4gJHtuc3NEaXJHbG9ifWBcbiAgKTtcbn1cblxuLyoqXG4gKiAgQ2hlY2sgdG8gc2VlIGlmIEZpcmVmb3ggaXMgc3RpbGwgcnVubmluZywgYW5kIGlmIHNvLCBhc2sgdGhlIHVzZXIgdG8gY2xvc2VcbiAqICBpdC4gUG9sbCB1bnRpbCBpdCdzIGNsb3NlZCwgdGhlbiByZXR1cm4uXG4gKlxuICogVGhpcyBpcyBuZWVkZWQgYmVjYXVzZSBGaXJlZm94IGFwcGVhcnMgdG8gbG9hZCB0aGUgTlNTIGRhdGFiYXNlIGluLW1lbW9yeSBvblxuICogc3RhcnR1cCwgYW5kIG92ZXJ3cml0ZSBvbiBleGl0LiBTbyB3ZSBoYXZlIHRvIGFzayB0aGUgdXNlciB0byBxdWl0ZSBGaXJlZm94XG4gKiBmaXJzdCBzbyBvdXIgY2hhbmdlcyBkb24ndCBnZXQgb3ZlcndyaXR0ZW4uXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjbG9zZUZpcmVmb3goKTogUHJvbWlzZTx2b2lkPiB7XG4gIGlmIChpc0ZpcmVmb3hPcGVuKCkpIHtcbiAgICBhd2FpdCBVSS5jbG9zZUZpcmVmb3hCZWZvcmVDb250aW51aW5nKCk7XG4gICAgd2hpbGUgKGlzRmlyZWZveE9wZW4oKSkge1xuICAgICAgYXdhaXQgc2xlZXAoNTApO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIENoZWNrIGlmIEZpcmVmb3ggaXMgY3VycmVudGx5IG9wZW5cbiAqL1xuZnVuY3Rpb24gaXNGaXJlZm94T3BlbigpOiBib29sZWFuIHtcbiAgLy8gTk9URTogV2UgdXNlIHNvbWUgV2luZG93cy11bmZyaWVuZGx5IG1ldGhvZHMgaGVyZSAocHMpIGJlY2F1c2UgV2luZG93c1xuICAvLyBuZXZlciBuZWVkcyB0byBjaGVjayB0aGlzLCBiZWNhdXNlIGl0IGRvZXNuJ3QgdXBkYXRlIHRoZSBOU1MgREJcbiAgLy8gYXV0b21hdGljYWx5LlxuICBhc3NlcnQoXG4gICAgaXNNYWMgfHwgaXNMaW51eCxcbiAgICAnY2hlY2tGb3JPcGVuRmlyZWZveCB3YXMgaW52b2tlZCBvbiBhIHBsYXRmb3JtIG90aGVyIHRoYW4gTWFjIG9yIExpbnV4J1xuICApO1xuICByZXR1cm4gZXhlYygncHMgYXV4JykuaW5kZXhPZignZmlyZWZveCcpID4gLTE7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNsZWVwKG1zOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBtcykpO1xufVxuXG4vKipcbiAqIEZpcmVmb3ggbWFuYWdlcyBpdCdzIG93biB0cnVzdCBzdG9yZSBmb3IgU1NMIGNlcnRpZmljYXRlcywgd2hpY2ggY2FuIGJlXG4gKiBtYW5hZ2VkIHZpYSB0aGUgY2VydHV0aWwgY29tbWFuZCAoc3VwcGxpZWQgYnkgTlNTIHRvb2xpbmcgcGFja2FnZXMpLiBJbiB0aGVcbiAqIGV2ZW50IHRoYXQgY2VydHV0aWwgaXMgbm90IGFscmVhZHkgaW5zdGFsbGVkLCBhbmQgZWl0aGVyIGNhbid0IGJlIGluc3RhbGxlZFxuICogKFdpbmRvd3MpIG9yIHRoZSB1c2VyIGRvZXNuJ3Qgd2FudCB0byBpbnN0YWxsIGl0IChza2lwQ2VydHV0aWxJbnN0YWxsOlxuICogdHJ1ZSksIGl0IG1lYW5zIHRoYXQgd2UgY2FuJ3QgcHJvZ3JhbW1hdGljYWxseSB0ZWxsIEZpcmVmb3ggdG8gdHJ1c3Qgb3VyXG4gKiByb290IENBIGNlcnRpZmljYXRlLlxuICpcbiAqIFRoZXJlIGlzIGEgcmVjb3Vyc2UgdGhvdWdoLiBXaGVuIGEgRmlyZWZveCB0YWIgaXMgZGlyZWN0ZWQgdG8gYSBVUkwgdGhhdFxuICogcmVzcG9uZHMgd2l0aCBhIGNlcnRpZmljYXRlLCBpdCB3aWxsIGF1dG9tYXRpY2FsbHkgcHJvbXB0IHRoZSB1c2VyIGlmIHRoZXlcbiAqIHdhbnQgdG8gYWRkIGl0IHRvIHRoZWlyIHRydXN0ZWQgY2VydGlmaWNhdGVzLiBTbyBpZiB3ZSBjYW4ndCBhdXRvbWF0aWNhbGx5XG4gKiBpbnN0YWxsIHRoZSBjZXJ0aWZpY2F0ZSB2aWEgY2VydHV0aWwsIHdlIGluc3RlYWQgc3RhcnQgYSBxdWljayB3ZWIgc2VydmVyXG4gKiBhbmQgaG9zdCBvdXIgY2VydGlmaWNhdGUgZmlsZS4gVGhlbiB3ZSBvcGVuIHRoZSBob3N0ZWQgY2VydCBVUkwgaW4gRmlyZWZveFxuICogdG8ga2ljayBvZmYgdGhlIEdVSSBmbG93LlxuICpcbiAqIFRoaXMgbWV0aG9kIGRvZXMgYWxsIHRoaXMsIGFsb25nIHdpdGggcHJvdmlkaW5nIHVzZXIgcHJvbXB0cyBpbiB0aGUgdGVybWluYWxcbiAqIHRvIHdhbGsgdGhlbSB0aHJvdWdoIHRoaXMgcHJvY2Vzcy5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG9wZW5DZXJ0aWZpY2F0ZUluRmlyZWZveChcbiAgZmlyZWZveFBhdGg6IHN0cmluZyxcbiAgY2VydFBhdGg6IHN0cmluZ1xuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGRlYnVnKFxuICAgICdBZGRpbmcgZGV2ZXJ0IHRvIEZpcmVmb3ggdHJ1c3Qgc3RvcmVzIG1hbnVhbGx5LiBMYXVuY2hpbmcgYSB3ZWJzZXJ2ZXIgdG8gaG9zdCBvdXIgY2VydGlmaWNhdGUgdGVtcG9yYXJpbHkgLi4uJ1xuICApO1xuICBjb25zdCBwb3J0ID0gYXdhaXQgZ2V0UG9ydCgpO1xuICBjb25zdCBzZXJ2ZXIgPSBodHRwXG4gICAgLmNyZWF0ZVNlcnZlcigocmVxLCByZXMpID0+IHtcbiAgICAgIGNvbnN0IHsgdXJsOiByZXFVcmwgfSA9IHJlcTtcbiAgICAgIGlmICghcmVxVXJsKVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYFJlcXVlc3QgdXJsIHdhcyBmb3VuZCB0byBiZSBlbXB0eTogXCIke0pTT04uc3RyaW5naWZ5KHJlcVVybCl9XCJgXG4gICAgICAgICk7XG4gICAgICBjb25zdCB7IHBhdGhuYW1lIH0gPSB1cmwucGFyc2UocmVxVXJsKTtcbiAgICAgIGlmIChwYXRobmFtZSA9PT0gJy9jZXJ0aWZpY2F0ZScpIHtcbiAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi94LXg1MDktY2EtY2VydCcgfSk7XG4gICAgICAgIHJlcy53cml0ZShyZWFkRmlsZShjZXJ0UGF0aCkpO1xuICAgICAgICByZXMuZW5kKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXMud3JpdGVIZWFkKDIwMCk7XG4gICAgICAgIFByb21pc2UucmVzb2x2ZShcbiAgICAgICAgICBVSS5maXJlZm94V2l6YXJkUHJvbXB0UGFnZShgaHR0cDovL2xvY2FsaG9zdDoke3BvcnR9L2NlcnRpZmljYXRlYClcbiAgICAgICAgKS50aGVuKHVzZXJSZXNwb25zZSA9PiB7XG4gICAgICAgICAgcmVzLndyaXRlKHVzZXJSZXNwb25zZSk7XG4gICAgICAgICAgcmVzLmVuZCgpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC5saXN0ZW4ocG9ydCk7XG4gIGRlYnVnKFxuICAgICdDZXJ0aWZpY2F0ZSBzZXJ2ZXIgaXMgdXAuIFByaW50aW5nIGluc3RydWN0aW9ucyBmb3IgdXNlciBhbmQgbGF1bmNoaW5nIEZpcmVmb3ggd2l0aCBob3N0ZWQgY2VydGlmaWNhdGUgVVJMJ1xuICApO1xuICBhd2FpdCBVSS5zdGFydEZpcmVmb3hXaXphcmQoYGh0dHA6Ly9sb2NhbGhvc3Q6JHtwb3J0fWApO1xuICBydW4oYCR7ZmlyZWZveFBhdGh9IGh0dHA6Ly9sb2NhbGhvc3Q6JHtwb3J0fWApO1xuICBhd2FpdCBVSS53YWl0Rm9yRmlyZWZveFdpemFyZCgpO1xuICBzZXJ2ZXIuY2xvc2UoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFzc2VydE5vdFRvdWNoaW5nRmlsZXMoXG4gIGZpbGVwYXRoOiBzdHJpbmcsXG4gIG9wZXJhdGlvbjogc3RyaW5nXG4pOiB2b2lkIHtcbiAgaWYgKFxuICAgICFmaWxlcGF0aC5zdGFydHNXaXRoKGNvbmZpZ0RpcikgJiZcbiAgICAhZmlsZXBhdGguc3RhcnRzV2l0aChnZXRMZWdhY3lDb25maWdEaXIoKSlcbiAgKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYERldmNlcnQgY2Fubm90ICR7b3BlcmF0aW9ufSAke2ZpbGVwYXRofTsgaXQgaXMgb3V0c2lkZSBrbm93biBkZXZjZXJ0IGNvbmZpZyBkaXJlY3RvcmllcyFgXG4gICAgKTtcbiAgfVxufVxuIl19