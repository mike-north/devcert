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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hhcmVkLmpzIiwic291cmNlUm9vdCI6Ii4vIiwic291cmNlcyI6WyJwbGF0Zm9ybXMvc2hhcmVkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsNkJBQTZCO0FBQzdCLDJCQUEyQjtBQUMzQixxQ0FBcUM7QUFDckMsaUNBQWlDO0FBQ2pDLG9DQUFvQztBQUNwQyw2QkFBNkI7QUFDN0IsMkJBQWdDO0FBQ2hDLCtCQUFvQztBQUNwQywyQkFBb0U7QUFDcEUsb0NBQStCO0FBQy9CLDRDQUE2RTtBQUM3RSxzREFBbUM7QUFDbkMsaURBQWlEO0FBRWpELE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0FBRXpDLFFBQUEsSUFBSSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSTtJQUNsQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJO0lBQ2xCLENBQUMsQ0FBQyxDQUFDO1FBQ0MsTUFBTSxJQUFJLEtBQUssQ0FDYix5RkFBeUYsQ0FDMUYsQ0FBQztJQUNKLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFFVDs7O0dBR0c7QUFDSCxTQUFTLGNBQWMsQ0FDckIsVUFBa0IsRUFDbEIsUUFBNkQ7SUFFN0QsV0FBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFO1FBQzNDLEtBQUssQ0FDSCxzQkFBc0IsaUJBQWlCLG9DQUFvQyxDQUM1RSxDQUFDO1FBQ0YsSUFBSSxlQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxVQUFVLENBQUMsQ0FBQyxFQUFFO1lBQ3BELEtBQUssQ0FDSCxnQ0FBZ0MsaUJBQWlCLHVCQUF1QixDQUN6RSxDQUFDO1lBQ0YsUUFBUSxDQUFDLGlCQUFpQixFQUFFLFFBQVEsQ0FBQyxDQUFDO1NBQ3ZDO1FBQ0QsSUFBSSxlQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxVQUFVLENBQUMsQ0FBQyxFQUFFO1lB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d0JBQUUsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO0lBQ2hDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztBQUNqQixDQUFDO0FBdENELDREQXNDQztBQUVELFNBQWdCLHNCQUFzQixDQUNwQyxRQUFnQixFQUNoQixTQUFpQjtJQUVqQixJQUNFLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxxQkFBUyxDQUFDO1FBQy9CLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyw4QkFBa0IsRUFBRSxDQUFDLEVBQzFDO1FBQ0EsTUFBTSxJQUFJLEtBQUssQ0FDYixrQkFBa0IsU0FBUyxJQUFJLFFBQVEsbURBQW1ELENBQzNGLENBQUM7S0FDSDtBQUNILENBQUM7QUFaRCx3REFZQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyB1cmwgZnJvbSAndXJsJztcbmltcG9ydCAqIGFzIGNyZWF0ZURlYnVnIGZyb20gJ2RlYnVnJztcbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgZ2V0UG9ydCBmcm9tICdnZXQtcG9ydCc7XG5pbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IHsgZXhpc3RzU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IHN5bmMgYXMgZ2xvYiB9IGZyb20gJ2dsb2InO1xuaW1wb3J0IHsgcmVhZEZpbGVTeW5jIGFzIHJlYWRGaWxlLCBleGlzdHNTeW5jIGFzIGV4aXN0cyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IHJ1biB9IGZyb20gJy4uL3V0aWxzJztcbmltcG9ydCB7IGlzTWFjLCBpc0xpbnV4LCBjb25maWdEaXIsIGdldExlZ2FjeUNvbmZpZ0RpciB9IGZyb20gJy4uL2NvbnN0YW50cyc7XG5pbXBvcnQgVUkgZnJvbSAnLi4vdXNlci1pbnRlcmZhY2UnO1xuaW1wb3J0IHsgZXhlY1N5bmMgYXMgZXhlYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuXG5jb25zdCBkZWJ1ZyA9IGNyZWF0ZURlYnVnKCdkZXZjZXJ0OnBsYXRmb3JtczpzaGFyZWQnKTtcblxuZXhwb3J0IGNvbnN0IEhPTUUgPSBwcm9jZXNzLmVudi5IT01FXG4gID8gcHJvY2Vzcy5lbnYuSE9NRVxuICA6IChmdW5jdGlvbigpOiBuZXZlciB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICdIT01FIGVudmlyb25tZW50IHZhcmlhYmxlIHdhcyBub3Qgc2V0LiBJdCBzaG91bGQgYmUgc29tZXRoaW5nIGxpa2UgXCIvVXNlcnMvZXhhbXBsZU5hbWVcIidcbiAgICAgICk7XG4gICAgfSkoKTtcblxuLyoqXG4gKiAgR2l2ZW4gYSBkaXJlY3Rvcnkgb3IgZ2xvYiBwYXR0ZXJuIG9mIGRpcmVjdG9yaWVzLCBydW4gYSBjYWxsYmFjayBmb3IgZWFjaCBkYlxuICogIGRpcmVjdG9yeSwgd2l0aCBhIHZlcnNpb24gYXJndW1lbnQuXG4gKi9cbmZ1bmN0aW9uIGRvRm9yTlNTQ2VydERCKFxuICBuc3NEaXJHbG9iOiBzdHJpbmcsXG4gIGNhbGxiYWNrOiAoZGlyOiBzdHJpbmcsIHZlcnNpb246ICdsZWdhY3knIHwgJ21vZGVybicpID0+IHZvaWRcbik6IHZvaWQge1xuICBnbG9iKG5zc0Rpckdsb2IpLmZvckVhY2gocG90ZW50aWFsTlNTREJEaXIgPT4ge1xuICAgIGRlYnVnKFxuICAgICAgYGNoZWNraW5nIHRvIHNlZSBpZiAke3BvdGVudGlhbE5TU0RCRGlyfSBpcyBhIHZhbGlkIE5TUyBkYXRhYmFzZSBkaXJlY3RvcnlgXG4gICAgKTtcbiAgICBpZiAoZXhpc3RzKHBhdGguam9pbihwb3RlbnRpYWxOU1NEQkRpciwgJ2NlcnQ4LmRiJykpKSB7XG4gICAgICBkZWJ1ZyhcbiAgICAgICAgYEZvdW5kIGxlZ2FjeSBOU1MgZGF0YWJhc2UgaW4gJHtwb3RlbnRpYWxOU1NEQkRpcn0sIHJ1bm5pbmcgY2FsbGJhY2suLi5gXG4gICAgICApO1xuICAgICAgY2FsbGJhY2socG90ZW50aWFsTlNTREJEaXIsICdsZWdhY3knKTtcbiAgICB9XG4gICAgaWYgKGV4aXN0cyhwYXRoLmpvaW4ocG90ZW50aWFsTlNTREJEaXIsICdjZXJ0OS5kYicpKSkge1xuICAgICAgZGVidWcoXG4gICAgICAgIGBGb3VuZCBtb2Rlcm4gTlNTIGRhdGFiYXNlIGluICR7cG90ZW50aWFsTlNTREJEaXJ9LCBydW5uaW5nIGNhbGxiYWNrLi4uYFxuICAgICAgKTtcbiAgICAgIGNhbGxiYWNrKHBvdGVudGlhbE5TU0RCRGlyLCAnbW9kZXJuJyk7XG4gICAgfVxuICB9KTtcbn1cblxuLyoqXG4gKiAgR2l2ZW4gYSBkaXJlY3Rvcnkgb3IgZ2xvYiBwYXR0ZXJuIG9mIGRpcmVjdG9yaWVzLCBhdHRlbXB0IHRvIGluc3RhbGwgdGhlXG4gKiAgQ0EgY2VydGlmaWNhdGUgdG8gZWFjaCBkaXJlY3RvcnkgY29udGFpbmluZyBhbiBOU1MgZGF0YWJhc2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhZGRDZXJ0aWZpY2F0ZVRvTlNTQ2VydERCKFxuICBuc3NEaXJHbG9iOiBzdHJpbmcsXG4gIGNlcnRQYXRoOiBzdHJpbmcsXG4gIGNlcnR1dGlsUGF0aDogc3RyaW5nXG4pOiB2b2lkIHtcbiAgZGVidWcoYHRyeWluZyB0byBpbnN0YWxsIGNlcnRpZmljYXRlIGludG8gTlNTIGRhdGFiYXNlcyBpbiAke25zc0Rpckdsb2J9YCk7XG4gIGRvRm9yTlNTQ2VydERCKG5zc0Rpckdsb2IsIChkaXIsIHZlcnNpb24pID0+IHtcbiAgICBjb25zdCBkaXJBcmcgPSB2ZXJzaW9uID09PSAnbW9kZXJuJyA/IGBzcWw6JHtkaXJ9YCA6IGRpcjtcbiAgICBydW4oXG4gICAgICBgJHtjZXJ0dXRpbFBhdGh9IC1BIC1kIFwiJHtkaXJBcmd9XCIgLXQgJ0MsLCcgLWkgXCIke2NlcnRQYXRofVwiIC1uIGRldmNlcnRgXG4gICAgKTtcbiAgfSk7XG4gIGRlYnVnKFxuICAgIGBmaW5pc2hlZCBzY2FubmluZyAmIGluc3RhbGxpbmcgY2VydGlmaWNhdGUgaW4gTlNTIGRhdGFiYXNlcyBpbiAke25zc0Rpckdsb2J9YFxuICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlQ2VydGlmaWNhdGVGcm9tTlNTQ2VydERCKFxuICBuc3NEaXJHbG9iOiBzdHJpbmcsXG4gIGNlcnRQYXRoOiBzdHJpbmcsXG4gIGNlcnR1dGlsUGF0aDogc3RyaW5nXG4pOiB2b2lkIHtcbiAgZGVidWcoYHRyeWluZyB0byByZW1vdmUgY2VydGlmaWNhdGVzIGZyb20gTlNTIGRhdGFiYXNlcyBpbiAke25zc0Rpckdsb2J9YCk7XG4gIGRvRm9yTlNTQ2VydERCKG5zc0Rpckdsb2IsIChkaXIsIHZlcnNpb24pID0+IHtcbiAgICBjb25zdCBkaXJBcmcgPSB2ZXJzaW9uID09PSAnbW9kZXJuJyA/IGBzcWw6JHtkaXJ9YCA6IGRpcjtcbiAgICB0cnkge1xuICAgICAgaWYgKGV4aXN0c1N5bmMoY2VydFBhdGgpKSB7XG4gICAgICAgIHJ1bihcbiAgICAgICAgICBgJHtjZXJ0dXRpbFBhdGh9IC1BIC1kIFwiJHtkaXJBcmd9XCIgLXQgJ0MsLCcgLWkgXCIke2NlcnRQYXRofVwiIC1uIGRldmNlcnRgXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgZGVidWcoXG4gICAgICAgIGBmYWlsZWQgdG8gcmVtb3ZlICR7Y2VydFBhdGh9IGZyb20gJHtkaXJ9LCBjb250aW51aW5nLiAke2UudG9TdHJpbmcoKX1gXG4gICAgICApO1xuICAgIH1cbiAgfSk7XG4gIGRlYnVnKFxuICAgIGBmaW5pc2hlZCBzY2FubmluZyAmIGluc3RhbGxpbmcgY2VydGlmaWNhdGUgaW4gTlNTIGRhdGFiYXNlcyBpbiAke25zc0Rpckdsb2J9YFxuICApO1xufVxuXG4vKipcbiAqICBDaGVjayB0byBzZWUgaWYgRmlyZWZveCBpcyBzdGlsbCBydW5uaW5nLCBhbmQgaWYgc28sIGFzayB0aGUgdXNlciB0byBjbG9zZVxuICogIGl0LiBQb2xsIHVudGlsIGl0J3MgY2xvc2VkLCB0aGVuIHJldHVybi5cbiAqXG4gKiBUaGlzIGlzIG5lZWRlZCBiZWNhdXNlIEZpcmVmb3ggYXBwZWFycyB0byBsb2FkIHRoZSBOU1MgZGF0YWJhc2UgaW4tbWVtb3J5IG9uXG4gKiBzdGFydHVwLCBhbmQgb3ZlcndyaXRlIG9uIGV4aXQuIFNvIHdlIGhhdmUgdG8gYXNrIHRoZSB1c2VyIHRvIHF1aXRlIEZpcmVmb3hcbiAqIGZpcnN0IHNvIG91ciBjaGFuZ2VzIGRvbid0IGdldCBvdmVyd3JpdHRlbi5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNsb3NlRmlyZWZveCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgaWYgKGlzRmlyZWZveE9wZW4oKSkge1xuICAgIGF3YWl0IFVJLmNsb3NlRmlyZWZveEJlZm9yZUNvbnRpbnVpbmcoKTtcbiAgICB3aGlsZSAoaXNGaXJlZm94T3BlbigpKSB7XG4gICAgICBhd2FpdCBzbGVlcCg1MCk7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgRmlyZWZveCBpcyBjdXJyZW50bHkgb3BlblxuICovXG5mdW5jdGlvbiBpc0ZpcmVmb3hPcGVuKCk6IGJvb2xlYW4ge1xuICAvLyBOT1RFOiBXZSB1c2Ugc29tZSBXaW5kb3dzLXVuZnJpZW5kbHkgbWV0aG9kcyBoZXJlIChwcykgYmVjYXVzZSBXaW5kb3dzXG4gIC8vIG5ldmVyIG5lZWRzIHRvIGNoZWNrIHRoaXMsIGJlY2F1c2UgaXQgZG9lc24ndCB1cGRhdGUgdGhlIE5TUyBEQlxuICAvLyBhdXRvbWF0aWNhbHkuXG4gIGFzc2VydChcbiAgICBpc01hYyB8fCBpc0xpbnV4LFxuICAgICdjaGVja0Zvck9wZW5GaXJlZm94IHdhcyBpbnZva2VkIG9uIGEgcGxhdGZvcm0gb3RoZXIgdGhhbiBNYWMgb3IgTGludXgnXG4gICk7XG4gIHJldHVybiBleGVjKCdwcyBhdXgnKS5pbmRleE9mKCdmaXJlZm94JykgPiAtMTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2xlZXAobXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKSk7XG59XG5cbi8qKlxuICogRmlyZWZveCBtYW5hZ2VzIGl0J3Mgb3duIHRydXN0IHN0b3JlIGZvciBTU0wgY2VydGlmaWNhdGVzLCB3aGljaCBjYW4gYmVcbiAqIG1hbmFnZWQgdmlhIHRoZSBjZXJ0dXRpbCBjb21tYW5kIChzdXBwbGllZCBieSBOU1MgdG9vbGluZyBwYWNrYWdlcykuIEluIHRoZVxuICogZXZlbnQgdGhhdCBjZXJ0dXRpbCBpcyBub3QgYWxyZWFkeSBpbnN0YWxsZWQsIGFuZCBlaXRoZXIgY2FuJ3QgYmUgaW5zdGFsbGVkXG4gKiAoV2luZG93cykgb3IgdGhlIHVzZXIgZG9lc24ndCB3YW50IHRvIGluc3RhbGwgaXQgKHNraXBDZXJ0dXRpbEluc3RhbGw6XG4gKiB0cnVlKSwgaXQgbWVhbnMgdGhhdCB3ZSBjYW4ndCBwcm9ncmFtbWF0aWNhbGx5IHRlbGwgRmlyZWZveCB0byB0cnVzdCBvdXJcbiAqIHJvb3QgQ0EgY2VydGlmaWNhdGUuXG4gKlxuICogVGhlcmUgaXMgYSByZWNvdXJzZSB0aG91Z2guIFdoZW4gYSBGaXJlZm94IHRhYiBpcyBkaXJlY3RlZCB0byBhIFVSTCB0aGF0XG4gKiByZXNwb25kcyB3aXRoIGEgY2VydGlmaWNhdGUsIGl0IHdpbGwgYXV0b21hdGljYWxseSBwcm9tcHQgdGhlIHVzZXIgaWYgdGhleVxuICogd2FudCB0byBhZGQgaXQgdG8gdGhlaXIgdHJ1c3RlZCBjZXJ0aWZpY2F0ZXMuIFNvIGlmIHdlIGNhbid0IGF1dG9tYXRpY2FsbHlcbiAqIGluc3RhbGwgdGhlIGNlcnRpZmljYXRlIHZpYSBjZXJ0dXRpbCwgd2UgaW5zdGVhZCBzdGFydCBhIHF1aWNrIHdlYiBzZXJ2ZXJcbiAqIGFuZCBob3N0IG91ciBjZXJ0aWZpY2F0ZSBmaWxlLiBUaGVuIHdlIG9wZW4gdGhlIGhvc3RlZCBjZXJ0IFVSTCBpbiBGaXJlZm94XG4gKiB0byBraWNrIG9mZiB0aGUgR1VJIGZsb3cuXG4gKlxuICogVGhpcyBtZXRob2QgZG9lcyBhbGwgdGhpcywgYWxvbmcgd2l0aCBwcm92aWRpbmcgdXNlciBwcm9tcHRzIGluIHRoZSB0ZXJtaW5hbFxuICogdG8gd2FsayB0aGVtIHRocm91Z2ggdGhpcyBwcm9jZXNzLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gb3BlbkNlcnRpZmljYXRlSW5GaXJlZm94KFxuICBmaXJlZm94UGF0aDogc3RyaW5nLFxuICBjZXJ0UGF0aDogc3RyaW5nXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgZGVidWcoXG4gICAgJ0FkZGluZyBkZXZlcnQgdG8gRmlyZWZveCB0cnVzdCBzdG9yZXMgbWFudWFsbHkuIExhdW5jaGluZyBhIHdlYnNlcnZlciB0byBob3N0IG91ciBjZXJ0aWZpY2F0ZSB0ZW1wb3JhcmlseSAuLi4nXG4gICk7XG4gIGNvbnN0IHBvcnQgPSBhd2FpdCBnZXRQb3J0KCk7XG4gIGNvbnN0IHNlcnZlciA9IGh0dHBcbiAgICAuY3JlYXRlU2VydmVyKChyZXEsIHJlcykgPT4ge1xuICAgICAgY29uc3QgeyB1cmw6IHJlcVVybCB9ID0gcmVxO1xuICAgICAgaWYgKCFyZXFVcmwpXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgUmVxdWVzdCB1cmwgd2FzIGZvdW5kIHRvIGJlIGVtcHR5OiBcIiR7SlNPTi5zdHJpbmdpZnkocmVxVXJsKX1cImBcbiAgICAgICAgKTtcbiAgICAgIGNvbnN0IHsgcGF0aG5hbWUgfSA9IHVybC5wYXJzZShyZXFVcmwpO1xuICAgICAgaWYgKHBhdGhuYW1lID09PSAnL2NlcnRpZmljYXRlJykge1xuICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL3gteDUwOS1jYS1jZXJ0JyB9KTtcbiAgICAgICAgcmVzLndyaXRlKHJlYWRGaWxlKGNlcnRQYXRoKSk7XG4gICAgICAgIHJlcy5lbmQoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlcy53cml0ZUhlYWQoMjAwKTtcbiAgICAgICAgUHJvbWlzZS5yZXNvbHZlKFxuICAgICAgICAgIFVJLmZpcmVmb3hXaXphcmRQcm9tcHRQYWdlKGBodHRwOi8vbG9jYWxob3N0OiR7cG9ydH0vY2VydGlmaWNhdGVgKVxuICAgICAgICApLnRoZW4odXNlclJlc3BvbnNlID0+IHtcbiAgICAgICAgICByZXMud3JpdGUodXNlclJlc3BvbnNlKTtcbiAgICAgICAgICByZXMuZW5kKCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pXG4gICAgLmxpc3Rlbihwb3J0KTtcbiAgZGVidWcoXG4gICAgJ0NlcnRpZmljYXRlIHNlcnZlciBpcyB1cC4gUHJpbnRpbmcgaW5zdHJ1Y3Rpb25zIGZvciB1c2VyIGFuZCBsYXVuY2hpbmcgRmlyZWZveCB3aXRoIGhvc3RlZCBjZXJ0aWZpY2F0ZSBVUkwnXG4gICk7XG4gIGF3YWl0IFVJLnN0YXJ0RmlyZWZveFdpemFyZChgaHR0cDovL2xvY2FsaG9zdDoke3BvcnR9YCk7XG4gIHJ1bihgJHtmaXJlZm94UGF0aH0gaHR0cDovL2xvY2FsaG9zdDoke3BvcnR9YCk7XG4gIGF3YWl0IFVJLndhaXRGb3JGaXJlZm94V2l6YXJkKCk7XG4gIHNlcnZlci5jbG9zZSgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0Tm90VG91Y2hpbmdGaWxlcyhcbiAgZmlsZXBhdGg6IHN0cmluZyxcbiAgb3BlcmF0aW9uOiBzdHJpbmdcbik6IHZvaWQge1xuICBpZiAoXG4gICAgIWZpbGVwYXRoLnN0YXJ0c1dpdGgoY29uZmlnRGlyKSAmJlxuICAgICFmaWxlcGF0aC5zdGFydHNXaXRoKGdldExlZ2FjeUNvbmZpZ0RpcigpKVxuICApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgRGV2Y2VydCBjYW5ub3QgJHtvcGVyYXRpb259ICR7ZmlsZXBhdGh9OyBpdCBpcyBvdXRzaWRlIGtub3duIGRldmNlcnQgY29uZmlnIGRpcmVjdG9yaWVzIWBcbiAgICApO1xuICB9XG59XG4iXX0=