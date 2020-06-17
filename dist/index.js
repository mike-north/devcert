"use strict";
/* eslint-disable @typescript-eslint/no-misused-promises */
/**
 * @packageDocumentation
 * Utilities for safely generating locally-trusted and machine-specific X.509 certificates for local development
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const execa = require("execa");
const createDebug = require("debug");
const command_exists_1 = require("command-exists");
const rimraf = require("rimraf");
const constants_1 = require("./constants");
const platforms_1 = require("./platforms");
const certificate_authority_1 = require("./certificate-authority");
exports.uninstall = certificate_authority_1.uninstall;
const certificates_1 = require("./certificates");
const user_interface_1 = require("./user-interface");
const remote_utils_1 = require("./remote-utils");
const node_forge_1 = require("node-forge");
const date_fns_1 = require("date-fns");
const utils_1 = require("./utils");
const debug = createDebug('devcert');
const REMAINING_BUSINESS_DAYS_VALIDITY_BEFORE_RENEW = 5;
const DEFAULT_CERT_OPTIONS = {
    caCertExpiry: 180,
    domainCertExpiry: 30
};
async function certificateFor(commonName, optionsOrAlternativeNames, options, partialCertOptions) {
    if (Array.isArray(optionsOrAlternativeNames)) {
        return certificateForImpl(commonName, optionsOrAlternativeNames, options, partialCertOptions);
    }
    else {
        return certificateForImpl(commonName, [], options, partialCertOptions);
    }
}
exports.certificateFor = certificateFor;
function getExpireAndRenewalDates(crt, renewalBufferInBusinessDays) {
    const expireAt = _getExpireDate(crt);
    const renewBy = date_fns_1.subBusinessDays(expireAt, renewalBufferInBusinessDays);
    return { expireAt, renewBy };
}
function getCertPortionOfPemString(crt) {
    const beginStr = '-----BEGIN CERTIFICATE-----';
    const endStr = '-----END CERTIFICATE-----';
    const begin = crt.indexOf(beginStr);
    const end = crt.indexOf(endStr);
    if (begin < 0 || end < 0)
        throw new Error(`Improperly formatted PEM file. Expected to find ${beginStr} and ${endStr}
"${crt}"`);
    const certContent = crt.substr(begin, end - begin + endStr.length);
    return certContent;
}
function _getExpireDate(crt) {
    const certInfo = node_forge_1.pki.certificateFromPem(crt);
    const { notAfter } = certInfo.validity;
    return notAfter;
}
function shouldRenew(crt, renewalBufferInBusinessDays) {
    const now = new Date();
    const { expireAt, renewBy } = getExpireAndRenewalDates(crt, renewalBufferInBusinessDays);
    debug(`evaluating cert renewal\n- now:\t${now.toDateString()}\n- renew at:\t${renewBy.toDateString()}\n- expire at:\t${expireAt.toDateString()}`);
    return now.valueOf() >= renewBy.valueOf();
}
/**
 * Get the expiration and recommended renewal dates, for the latest issued
 * cert for a given common_name
 *
 * @alpha
 * @param commonName - common_name of cert whose expiration info is desired
 * @param renewalBufferInBusinessDays - number of business days before cert expiration, to start indicating that it should be renewed
 */
function getCertExpirationInfo(commonName, renewalBufferInBusinessDays = REMAINING_BUSINESS_DAYS_VALIDITY_BEFORE_RENEW) {
    const domainCertPath = utils_1.pathForDomain(commonName, `certificate.crt`);
    if (!fs_1.existsSync(domainCertPath))
        throw new Error(`cert for ${commonName} was not found`);
    const domainCert = fs_1.readFileSync(domainCertPath).toString();
    if (!domainCert) {
        throw new Error(`No certificate for ${commonName} exists`);
    }
    const crt = getCertPortionOfPemString(domainCert);
    const { expireAt, renewBy } = getExpireAndRenewalDates(crt, renewalBufferInBusinessDays);
    const mustRenew = shouldRenew(crt, renewalBufferInBusinessDays);
    return { mustRenew, expireAt, renewBy };
}
exports.getCertExpirationInfo = getCertExpirationInfo;
async function certificateForImpl(commonName, alternativeNames, options = {}, partialCertOptions = {}) {
    var _a;
    debug(`Certificate requested for ${commonName}. Skipping certutil install: ${Boolean(options.skipCertutilInstall)}. Skipping hosts file: ${Boolean(options.skipHostsFile)}`);
    const certOptions = Object.assign(Object.assign({}, DEFAULT_CERT_OPTIONS), partialCertOptions);
    if (options.ui) {
        Object.assign(user_interface_1.default, options.ui);
    }
    if (!constants_1.isMac && !constants_1.isLinux && !constants_1.isWindows) {
        throw new Error(`Platform not supported: "${process.platform}"`);
    }
    if (!command_exists_1.sync('openssl')) {
        throw new Error('OpenSSL not found: OpenSSL is required to generate SSL certificates - make sure it is installed and available in your PATH');
    }
    const domainKeyPath = utils_1.keyPathForDomain(commonName);
    const domainCertPath = utils_1.certPathForDomain(commonName);
    if (!fs_1.existsSync(constants_1.rootCAKeyPath)) {
        debug('Root CA is not installed yet, so it must be our first run. Installing root CA ...');
        await certificate_authority_1.default(options, certOptions);
    }
    else if (options.getCaBuffer || options.getCaPath) {
        debug('Root CA is not readable, but it probably is because an earlier version of devcert locked it. Trying to fix...');
        await certificate_authority_1.ensureCACertReadable(options, certOptions);
    }
    if (!fs_1.existsSync(domainCertPath)) {
        debug(`Can't find certificate file for ${commonName}, so it must be the first request for ${commonName}. Generating and caching ...`);
        await certificates_1.generateDomainCertificate(commonName, alternativeNames, certOptions);
    }
    else {
        const certContents = getCertPortionOfPemString(fs_1.readFileSync(domainCertPath).toString());
        const expireDate = _getExpireDate(certContents);
        if (shouldRenew(certContents, (_a = options.renewalBufferInBusinessDays, (_a !== null && _a !== void 0 ? _a : REMAINING_BUSINESS_DAYS_VALIDITY_BEFORE_RENEW)))) {
            debug(`Certificate for ${commonName} was close to expiring (on ${expireDate.toDateString()}). A fresh certificate will be generated for you`);
            await removeAndRevokeDomainCert(commonName);
            await certificates_1.generateDomainCertificate(commonName, alternativeNames, certOptions);
        }
        else {
            debug(`Certificate for ${commonName} was not close to expiring (on ${expireDate.toDateString()}).`);
        }
    }
    if (!options.skipHostsFile) {
        await platforms_1.default.addDomainToHostFileIfMissing(commonName);
    }
    debug(`Returning domain certificate`);
    const ret = {
        key: fs_1.readFileSync(domainKeyPath),
        cert: fs_1.readFileSync(domainCertPath)
    };
    if (options.getCaBuffer)
        ret.ca = fs_1.readFileSync(constants_1.rootCACertPath);
    if (options.getCaPath)
        ret.caPath = constants_1.rootCACertPath;
    return ret;
}
/**
 * Trust the certificate for a given hostname and port and add
 * the returned cert to the local trust store.
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 * @param certPath - file path to store the cert
 */
async function trustCertsOnRemote(hostname, port, certPath) {
    // Get the remote certificate from the server
    const certData = await remote_utils_1.getRemoteCertificate(hostname, port);
    try {
        // Write the certificate data on this file.
        fs_1.writeFileSync(certPath, certData);
    }
    catch (err) {
        throw new Error(err);
    }
    // Trust the remote cert on your local box
    try {
        await platforms_1.default.addToTrustStores(certPath);
        debug('Certificate trusted successfully');
        debug('Attempting to close the remote server');
    }
    catch (err) {
        throw new Error(err);
    }
    return certData;
}
/**
 * Trust the remote hosts's certificate on local machine.
 * This function would ssh into the remote host, get the certificate
 * and trust the local machine from where this function is getting called from.
 * @public
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 * @param certPath - file path to store the cert
 * @param renewalBufferInBusinessDays - valid days before renewing the cert
 */
function trustRemoteMachine(hostname, port, certPath, renewalBufferInBusinessDays = REMAINING_BUSINESS_DAYS_VALIDITY_BEFORE_RENEW) {
    return new Promise((resolve, reject) => {
        debug(`Connecting to remote server on port: ${port}`);
        // Connect to remote box via ssh.
        const child = execa.shell(
        // @TODO Change this to npx
        `ssh ${hostname} node devcert/src/express.js --port=${port} `, {
            detached: false
        });
        // Throw any error that might have occurred on the remote side.
        if (child && child.stderr) {
            child.stderr.on('data', (err) => {
                var _a;
                throw new Error((_a = err) === null || _a === void 0 ? void 0 : _a.toString());
            });
        }
        if (child && child.stdout) {
            child.stdout.on('data', async (data) => {
                var _a, _b, _c;
                debug('Connected to remote server successfully');
                const stdoutData = (_a = data) === null || _a === void 0 ? void 0 : _a.toString().trimRight();
                if ((_b = stdoutData) === null || _b === void 0 ? void 0 : _b.includes(`Server started at port: ${port}`)) {
                    // Trust the certs
                    const certData = await trustCertsOnRemote(hostname, port, certPath);
                    // Once certs are trusted, close the remote server and cleanup.
                    try {
                        const remoteServer = await remote_utils_1.closeRemoteServer(hostname, port);
                        debug(remoteServer);
                        const crt = getCertPortionOfPemString(certData);
                        const mustRenew = shouldRenew(crt, renewalBufferInBusinessDays);
                        // return the certificate renewal state to the consumer to handle the
                        // renewal usecase.
                        resolve(mustRenew);
                    }
                    catch (err) {
                        throw new Error(err);
                    }
                    child.kill();
                }
                else if ((_c = stdoutData) === null || _c === void 0 ? void 0 : _c.includes('Process terminated')) {
                    debug('Remote server closed successfully');
                }
            });
        }
        else {
            reject('Error executing shell command');
        }
    });
}
exports.trustRemoteMachine = trustRemoteMachine;
/**
 * Untrust the certificate for a given file path.
 * @public
 * @param filePath - file path of the cert
 */
function untrustMachine(filePath) {
    platforms_1.default.removeFromTrustStores(filePath);
}
exports.untrustMachine = untrustMachine;
/**
 * Check whether a certificate with a given common_name has been installed
 *
 * @public
 * @param commonName - commonName of certificate whose existence is being checked
 */
function hasCertificateFor(commonName) {
    return fs_1.existsSync(utils_1.pathForDomain(commonName, `certificate.crt`));
}
exports.hasCertificateFor = hasCertificateFor;
/**
 * Get a list of domains that certifiates have been generated for
 * @alpha
 */
function configuredDomains() {
    return fs_1.readdirSync(constants_1.domainsDir);
}
exports.configuredDomains = configuredDomains;
/**
 * Remove a certificate
 * @public
 * @param commonName - commonName of cert to remove
 * @deprecated please use {@link removeAndRevokeDomainCert | removeAndRevokeDomainCert} to ensure that the OpenSSL cert removal is handled properly
 */
function removeDomain(commonName) {
    rimraf.sync(utils_1.pathForDomain(commonName));
}
exports.removeDomain = removeDomain;
/**
 * Remove a certificate and revoke it from the OpenSSL cert database
 * @public
 * @param commonName - commonName of cert to remove
 */
async function removeAndRevokeDomainCert(commonName) {
    debug(`removing domain certificate for ${commonName}`);
    const certFolderPath = utils_1.pathForDomain(commonName);
    const domainCertPath = utils_1.certPathForDomain(commonName);
    if (fs_1.existsSync(certFolderPath)) {
        debug(`cert found on disk for ${commonName}`);
        // revoke the cert
        debug(`revoking cert ${commonName}`);
        await certificates_1.revokeDomainCertificate(commonName);
        // delete the cert file
        debug(`deleting cert on disk for ${commonName} - ${fs_1.statSync(domainCertPath).size}`);
        removeDomain(commonName);
        debug(`deleted cert on disk for ${commonName} - ${fs_1.existsSync(domainCertPath)}`);
    }
    else
        debug(`cert not found on disk ${commonName}`);
    debug(`completed removing domain certificate for ${commonName}`);
}
exports.removeAndRevokeDomainCert = removeAndRevokeDomainCert;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbImluZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSwyREFBMkQ7QUFDM0Q7OztHQUdHOztBQUVILDJCQU9ZO0FBQ1osK0JBQStCO0FBQy9CLHFDQUFxQztBQUNyQyxtREFBdUQ7QUFDdkQsaUNBQWlDO0FBQ2pDLDJDQU9xQjtBQUNyQiwyQ0FBMEM7QUFDMUMsbUVBR2lDO0FBVXhCLG9CQVhQLGlDQUFTLENBV087QUFUbEIsaURBR3dCO0FBQ3hCLHFEQUFxRDtBQUNyRCxpREFBeUU7QUFDekUsMkNBQWlDO0FBQ2pDLHVDQUEyQztBQUMzQyxtQ0FBNkU7QUFFN0UsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBRXJDLE1BQU0sNkNBQTZDLEdBQUcsQ0FBQyxDQUFDO0FBK0V4RCxNQUFNLG9CQUFvQixHQUFnQjtJQUN4QyxZQUFZLEVBQUUsR0FBRztJQUNqQixnQkFBZ0IsRUFBRSxFQUFFO0NBQ3JCLENBQUM7QUE0Q0ssS0FBSyxVQUFVLGNBQWMsQ0FJbEMsVUFBa0IsRUFDbEIseUJBQXVDLEVBQ3ZDLE9BQVcsRUFDWCxrQkFBdUI7SUFFdkIsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLHlCQUF5QixDQUFDLEVBQUU7UUFDNUMsT0FBTyxrQkFBa0IsQ0FDdkIsVUFBVSxFQUNWLHlCQUF5QixFQUN6QixPQUFPLEVBQ1Asa0JBQWtCLENBQ25CLENBQUM7S0FDSDtTQUFNO1FBQ0wsT0FBTyxrQkFBa0IsQ0FBQyxVQUFVLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0tBQ3hFO0FBQ0gsQ0FBQztBQW5CRCx3Q0FtQkM7QUFFRCxTQUFTLHdCQUF3QixDQUMvQixHQUFXLEVBQ1gsMkJBQW1DO0lBRW5DLE1BQU0sUUFBUSxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNyQyxNQUFNLE9BQU8sR0FBRywwQkFBZSxDQUFD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S0FBSyxDQUFDLDBCQUEwQixVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQzlDLGtCQUFrQjtRQUNsQixLQUFLLENBQUMsaUJBQWlCLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDckMsTUFBTSxzQ0FBdUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMxQyx1QkFBdUI7UUFDdkIsS0FBSyxDQUNILDZCQUE2QixVQUFVLE1BQ3JDLGFBQVEsQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUMzQixFQUFFLENBQ0gsQ0FBQztRQUNGLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN6QixLQUFLLENBQ0gsNEJBQTRCLFVBQVUsTUFBTSxlQUFVLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FDekUsQ0FBQztLQUNIOztRQUFNLEtBQUssQ0FBQywwQkFBMEIsVUFBVSxFQUFFLENBQUMsQ0FBQztJQUNyRCxLQUFLLENBQUMsNkNBQTZDLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFDbkUsQ0FBQztBQXZCRCw4REF1QkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiBlc2xpbnQtZGlzYWJsZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tbWlzdXNlZC1wcm9taXNlcyAqL1xuLyoqXG4gKiBAcGFja2FnZURvY3VtZW50YXRpb25cbiAqIFV0aWxpdGllcyBmb3Igc2FmZWx5IGdlbmVyYXRpbmcgbG9jYWxseS10cnVzdGVkIGFuZCBtYWNoaW5lLXNwZWNpZmljIFguNTA5IGNlcnRpZmljYXRlcyBmb3IgbG9jYWwgZGV2ZWxvcG1lbnRcbiAqL1xuXG5pbXBvcnQge1xuICByZWFkRmlsZVN5bmMgYXMgcmVhZEZpbGUsXG4gIHJlYWRkaXJTeW5jIGFzIHJlYWRkaXIsXG4gIGV4aXN0c1N5bmMgYXMgZXhpc3RzLFxuICBleGlzdHNTeW5jLFxuICB3cml0ZUZpbGVTeW5jLFxuICBzdGF0U3luY1xufSBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBleGVjYSBmcm9tICdleGVjYSc7XG5pbXBvcnQgKiBhcyBjcmVhdGVEZWJ1ZyBmcm9tICdkZWJ1Zyc7XG5pbXBvcnQgeyBzeW5jIGFzIGNvbW1hbmRFeGlzdHMgfSBmcm9tICdjb21tYW5kLWV4aXN0cyc7XG5pbXBvcnQgKiBhcyByaW1yYWYgZnJvbSAncmltcmFmJztcbmltcG9ydCB7XG4gIGlzTWFjLFxuICBpc0xpbnV4LFxuICBpc1dpbmRvd3MsXG4gIGRvbWFpbnNEaXIsXG4gIHJvb3RDQUtleVBhdGgsXG4gIHJvb3RDQUNlcnRQYXRoXG59IGZyb20gJy4vY29uc3RhbnRzJztcbmltcG9ydCBjdXJyZW50UGxhdGZvcm0gZnJvbSAnLi9wbGF0Zm9ybXMnO1xuaW1wb3J0IGluc3RhbGxDZXJ0aWZpY2F0ZUF1dGhvcml0eSwge1xuICBlbnN1cmVDQUNlcnRSZWFkYWJsZSxcbiAgdW5pbnN0YWxsXG59IGZyb20gJy4vY2VydGlmaWNhdGUtYXV0aG9yaXR5JztcbmltcG9ydCB7XG4gIGdlbmVyYXRlRG9tYWluQ2VydGlmaWNhdGUsXG4gIHJldm9rZURvbWFpbkNlcnRpZmljYXRlXG59IGZyb20gJy4vY2VydGlmaWNhdGVzJztcbmltcG9ydCBVSSwgeyBVc2VySW50ZXJmYWNlIH0gZnJvbSAnLi91c2VyLWludGVyZmFjZSc7XG5pbXBvcnQgeyBnZXRSZW1vdGVDZXJ0aWZpY2F0ZSwgY2xvc2VSZW1vdGVTZXJ2ZXIgfSBmcm9tICcuL3JlbW90ZS11dGlscyc7XG5pbXBvcnQgeyBwa2kgfSBmcm9tICdub2RlLWZvcmdlJztcbmltcG9ydCB7IHN1YkJ1c2luZXNzRGF5cyB9IGZyb20gJ2RhdGUtZm5zJztcbmltcG9ydCB7IHBhdGhGb3JEb21haW4sIGtleVBhdGhGb3JEb21haW4sIGNlcnRQYXRoRm9yRG9tYWluIH0gZnJvbSAnLi91dGlscyc7XG5leHBvcnQgeyB1bmluc3RhbGwsIFVzZXJJbnRlcmZhY2UgfTtcbmNvbnN0IGRlYnVnID0gY3JlYXRlRGVidWcoJ2RldmNlcnQnKTtcblxuY29uc3QgUkVNQUlOSU5HX0JVU0lORVNTX0RBWVNfVkFMSURJVFlfQkVGT1JFX1JFTkVXID0gNTtcblxuLyoqXG4gKiBDZXJ0aWZpY2F0ZSBvcHRpb25zXG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ2VydE9wdGlvbnMge1xuICAvKiogTnVtYmVyIG9mIGRheXMgYmVmb3JlIHRoZSBDQSBleHBpcmVzICovXG4gIGNhQ2VydEV4cGlyeTogbnVtYmVyO1xuICAvKiogTnVtYmVyIG9mIGRheXMgYmVmb3JlIHRoZSBkb21haW4gY2VydGlmaWNhdGUgZXhwaXJlcyAqL1xuICBkb21haW5DZXJ0RXhwaXJ5OiBudW1iZXI7XG59XG4vKipcbiAqIENlcnQgZ2VuZXJhdGlvbiBvcHRpb25zXG4gKlxuICogQHB1YmxpY1xuICovXG5leHBvcnQgaW50ZXJmYWNlIE9wdGlvbnMgLyogZXh0ZW5kcyBQYXJ0aWFsPElDYUJ1ZmZlck9wdHMgJiBJQ2FQYXRoT3B0cz4gICovIHtcbiAgLyoqIFJldHVybiB0aGUgQ0EgY2VydGlmaWNhdGUgZGF0YT8gKi9cbiAgZ2V0Q2FCdWZmZXI/OiBib29sZWFuO1xuICAvKiogUmV0dXJuIHRoZSBwYXRoIHRvIHRoZSBDQSBjZXJ0aWZpY2F0ZT8gKi9cbiAgZ2V0Q2FQYXRoPzogYm9vbGVhbjtcbiAgLyoqIElmIGBjZXJ0dXRpbGAgaXMgbm90IGluc3RhbGxlZCBhbHJlYWR5IChmb3IgdXBkYXRpbmcgbnNzIGRhdGFiYXNlczsgZS5nLiBmaXJlZm94KSwgZG8gbm90IGF0dGVtcHQgdG8gaW5zdGFsbCBpdCAqL1xuICBza2lwQ2VydHV0aWxJbnN0YWxsPzogYm9vbGVhbjtcbiAgLyoqIERvIG5vdCB1cGRhdGUgeW91ciBzeXN0ZW1zIGhvc3QgZmlsZSB3aXRoIHRoZSBkb21haW4gbmFtZSBvZiB0aGUgY2VydGlmaWNhdGUgKi9cbiAgc2tpcEhvc3RzRmlsZT86IGJvb2xlYW47XG4gIC8qKiBVc2VyIGludGVyZmFjZSBob29rcyAqL1xuICB1aT86IFVzZXJJbnRlcmZhY2U7XG4gIC8qKiBOdW1iZXIgb2YgYnVzaW5lc3MgZGF5cyBiZWZvcmUgZG9tYWluIGNlcnQgZXhwaXJ5IGJlZm9yZSBhdXRvbWF0aWMgcmV2b2tlIGFuZCByZW5ldyAqL1xuICByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXM/OiBudW1iZXI7XG59XG4vKipcbiAqIFRoZSBDQSBwdWJsaWMga2V5IGFzIGEgYnVmZmVyXG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ2FCdWZmZXIge1xuICAvKiogQ0EgcHVibGljIGtleSAqL1xuICBjYTogQnVmZmVyO1xufVxuLyoqXG4gKiBUaGUgY2VydCBhdXRob3JpdHkncyBwYXRoIG9uIGRpc2tcbiAqIEBwdWJsaWNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBDYVBhdGgge1xuICAvKiogQ0EgY2VydCBwYXRoIG9uIGRpc2sgKi9cbiAgY2FQYXRoOiBzdHJpbmc7XG59XG4vKipcbiAqIERvbWFpbiBjZXJ0IHB1YmxpYyBhbmQgcHJpdmF0ZSBrZXlzIGFzIGJ1ZmZlcnNcbiAqIEBwdWJsaWNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBEb21haW5EYXRhIHtcbiAgLyoqIHByaXZhdGUga2V5ICovXG4gIGtleTogQnVmZmVyO1xuICAvKiogcHVibGljIGtleSAoY2VydCkgKi9cbiAgY2VydDogQnVmZmVyO1xufVxuLyoqXG4gKiBBIHJldHVybiB2YWx1ZSBjb250YWluaW5nIHRoZSBDQSBwdWJsaWMga2V5XG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCB0eXBlIElSZXR1cm5DYTxPIGV4dGVuZHMgT3B0aW9ucz4gPSBPWydnZXRDYUJ1ZmZlciddIGV4dGVuZHMgdHJ1ZVxuICA/IENhQnVmZmVyXG4gIDogZmFsc2U7XG4vKipcbiAqIEEgcmV0dXJuIHZhbHVlIGNvbnRhaW5pbmcgdGhlIENBIHBhdGggb24gZGlza1xuICogQHB1YmxpY1xuICovXG5leHBvcnQgdHlwZSBJUmV0dXJuQ2FQYXRoPE8gZXh0ZW5kcyBPcHRpb25zPiA9IE9bJ2dldENhUGF0aCddIGV4dGVuZHMgdHJ1ZVxuICA/IENhUGF0aFxuICA6IGZhbHNlO1xuLyoqXG4gKiBBIHJldHVybiB2YWx1ZSBjb250YWluaW5nIHRoZSBDQSBwdWJsaWMga2V5LCBDQSBwYXRoIG9uIGRpc2ssIGFuZCBkb21haW4gY2VydCBpbmZvXG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCB0eXBlIElSZXR1cm5EYXRhPE8gZXh0ZW5kcyBPcHRpb25zID0ge30+ID0gRG9tYWluRGF0YSAmXG4gIElSZXR1cm5DYTxPPiAmXG4gIElSZXR1cm5DYVBhdGg8Tz47XG5cbmNvbnN0IERFRkFVTFRfQ0VSVF9PUFRJT05TOiBDZXJ0T3B0aW9ucyA9IHtcbiAgY2FDZXJ0RXhwaXJ5OiAxODAsXG4gIGRvbWFpbkNlcnRFeHBpcnk6IDMwXG59O1xuXG4vKipcbiAqIFJlcXVlc3QgYW4gU1NMIGNlcnRpZmljYXRlIGZvciB0aGUgZ2l2ZW4gYXBwIG5hbWUgc2lnbmVkIGJ5IHRoZSBkZXZjZXJ0IHJvb3RcbiAqIGNlcnRpZmljYXRlIGF1dGhvcml0eS4gSWYgZGV2Y2VydCBoYXMgcHJldmlvdXNseSBnZW5lcmF0ZWQgYSBjZXJ0aWZpY2F0ZSBmb3JcbiAqIHRoYXQgYXBwIG5hbWUgb24gdGhpcyBtYWNoaW5lLCBpdCB3aWxsIHJldXNlIHRoYXQgY2VydGlmaWNhdGUuXG4gKlxuICogSWYgdGhpcyBpcyB0aGUgZmlyc3QgdGltZSBkZXZjZXJ0IGlzIGJlaW5nIHJ1biBvbiB0aGlzIG1hY2hpbmUsIGl0IHdpbGxcbiAqIGdlbmVyYXRlIGFuZCBhdHRlbXB0IHRvIGluc3RhbGwgYSByb290IGNlcnRpZmljYXRlIGF1dGhvcml0eS5cbiAqXG4gKiBJZiBgb3B0aW9ucy5nZXRDYUJ1ZmZlcmAgaXMgdHJ1ZSwgcmV0dXJuIHZhbHVlIHdpbGwgaW5jbHVkZSB0aGUgY2EgY2VydGlmaWNhdGUgZGF0YVxuICogYXMgXFx7IGNhOiBCdWZmZXIgXFx9XG4gKlxuICogSWYgYG9wdGlvbnMuZ2V0Q2FQYXRoYCBpcyB0cnVlLCByZXR1cm4gdmFsdWUgd2lsbCBpbmNsdWRlIHRoZSBjYSBjZXJ0aWZpY2F0ZSBwYXRoXG4gKiBhcyBcXHsgY2FQYXRoOiBzdHJpbmcgXFx9XG4gKlxuICogQHB1YmxpY1xuICogQHBhcmFtIGNvbW1vbk5hbWUgLSBjb21tb24gbmFtZSBmb3IgY2VydGlmaWNhdGVcbiAqIEBwYXJhbSBhbHRlcm5hdGl2ZU5hbWVzIC0gYWx0ZXJuYXRlIG5hbWVzIGZvciB0aGUgY2VydGlmaWNhdGVcbiAqIEBwYXJhbSBvcHRpb25zIC0gY2VydCBnZW5lcmF0aW9uIG9wdGlvbnNcbiAqIEBwYXJhbSBwYXJ0aWFsQ2VydE9wdGlvbnMgLSBjZXJ0aWZpY2F0ZSBvcHRpb25zXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjZXJ0aWZpY2F0ZUZvcjxcbiAgTyBleHRlbmRzIE9wdGlvbnMsXG4gIENPIGV4dGVuZHMgUGFydGlhbDxDZXJ0T3B0aW9ucz5cbj4oXG4gIGNvbW1vbk5hbWU6IHN0cmluZyxcbiAgYWx0ZXJuYXRpdmVOYW1lczogc3RyaW5nW10sXG4gIG9wdGlvbnM/OiBPLFxuICBwYXJ0aWFsQ2VydE9wdGlvbnM/OiBDT1xuKTogUHJvbWlzZTxJUmV0dXJuRGF0YTxPPj47XG5cbi8qKlxuICoge0Bpbmhlcml0ZG9jIChjZXJ0aWZpY2F0ZUZvcjoxKX1cbiAqIEBwdWJsaWNcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNlcnRpZmljYXRlRm9yPFxuICBPIGV4dGVuZHMgT3B0aW9ucyxcbiAgQ08gZXh0ZW5kcyBQYXJ0aWFsPENlcnRPcHRpb25zPlxuPihcbiAgY29tbW9uTmFtZTogc3RyaW5nLFxuICBvcHRpb25zPzogTyxcbiAgcGFydGlhbENlcnRPcHRpb25zPzogQ09cbik6IFByb21pc2U8SVJldHVybkRhdGE8Tz4+O1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNlcnRpZmljYXRlRm9yPFxuICBPIGV4dGVuZHMgT3B0aW9ucyxcbiAgQ08gZXh0ZW5kcyBQYXJ0aWFsPENlcnRPcHRpb25zPlxuPihcbiAgY29tbW9uTmFtZTogc3RyaW5nLFxuICBvcHRpb25zT3JBbHRlcm5hdGl2ZU5hbWVzOiBzdHJpbmdbXSB8IE8sXG4gIG9wdGlvbnM/OiBPLFxuICBwYXJ0aWFsQ2VydE9wdGlvbnM/OiBDT1xuKTogUHJvbWlzZTxJUmV0dXJuRGF0YTxPPj4ge1xuICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zT3JBbHRlcm5hdGl2ZU5hbWVzKSkge1xuICAgIHJldHVybiBjZXJ0aWZpY2F0ZUZvckltcGwoXG4gICAgICBjb21tb25OYW1lLFxuICAgICAgb3B0aW9uc09yQWx0ZXJuYXRpdmVOYW1lcyxcbiAgICAgIG9wdGlvbnMsXG4gICAgICBwYXJ0aWFsQ2VydE9wdGlvbnNcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBjZXJ0aWZpY2F0ZUZvckltcGwoY29tbW9uTmFtZSwgW10sIG9wdGlvbnMsIHBhcnRpYWxDZXJ0T3B0aW9ucyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0RXhwaXJlQW5kUmVuZXdhbERhdGVzKFxuICBjcnQ6IHN0cmluZyxcbiAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzOiBudW1iZXJcbik6IHsgZXhwaXJlQXQ6IERhdGU7IHJlbmV3Qnk6IERhdGUgfSB7XG4gIGNvbnN0IGV4cGlyZUF0ID0gX2dldEV4cGlyZURhdGUoY3J0KTtcbiAgY29uc3QgcmVuZXdCeSA9IHN1YkJ1c2luZXNzRGF5cyhleHBpcmVBdCwgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzKTtcbiAgcmV0dXJuIHsgZXhwaXJlQXQsIHJlbmV3QnkgfTtcbn1cblxuZnVuY3Rpb24gZ2V0Q2VydFBvcnRpb25PZlBlbVN0cmluZyhjcnQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGJlZ2luU3RyID0gJy0tLS0tQkVHSU4gQ0VSVElGSUNBVEUtLS0tLSc7XG4gIGNvbnN0IGVuZFN0ciA9ICctLS0tLUVORCBDRVJUSUZJQ0FURS0tLS0tJztcbiAgY29uc3QgYmVnaW4gPSBjcnQuaW5kZXhPZihiZWdpblN0cik7XG4gIGNvbnN0IGVuZCA9IGNydC5pbmRleE9mKGVuZFN0cik7XG4gIGlmIChiZWdpbiA8IDAgfHwgZW5kIDwgMClcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgSW1wcm9wZXJseSBmb3JtYXR0ZWQgUEVNIGZpbGUuIEV4cGVjdGVkIHRvIGZpbmQgJHtiZWdpblN0cn0gYW5kICR7ZW5kU3RyfVxuXCIke2NydH1cImBcbiAgICApO1xuXG4gIGNvbnN0IGNlcnRDb250ZW50ID0gY3J0LnN1YnN0cihiZWdpbiwgZW5kIC0gYmVnaW4gKyBlbmRTdHIubGVuZ3RoKTtcbiAgcmV0dXJuIGNlcnRDb250ZW50O1xufVxuXG5mdW5jdGlvbiBfZ2V0RXhwaXJlRGF0ZShjcnQ6IHN0cmluZyk6IERhdGUge1xuICBjb25zdCBjZXJ0SW5mbyA9IHBraS5jZXJ0aWZpY2F0ZUZyb21QZW0oY3J0KTtcbiAgY29uc3QgeyBub3RBZnRlciB9ID0gY2VydEluZm8udmFsaWRpdHk7XG4gIHJldHVybiBub3RBZnRlcjtcbn1cblxuZnVuY3Rpb24gc2hvdWxkUmVuZXcoXG4gIGNydDogc3RyaW5nLFxuICByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXM6IG51bWJlclxuKTogYm9vbGVhbiB7XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gIGNvbnN0IHsgZXhwaXJlQXQsIHJlbmV3QnkgfSA9IGdldEV4cGlyZUFuZFJlbmV3YWxEYXRlcyhcbiAgICBjcnQsXG4gICAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzXG4gICk7XG4gIGRlYnVnKFxuICAgIGBldmFsdWF0aW5nIGNlcnQgcmVuZXdhbFxcbi0gbm93OlxcdCR7bm93LnRvRGF0ZVN0cmluZygpfVxcbi0gcmVuZXcgYXQ6XFx0JHtyZW5ld0J5LnRvRGF0ZVN0cmluZygpfVxcbi0gZXhwaXJlIGF0OlxcdCR7ZXhwaXJlQXQudG9EYXRlU3RyaW5nKCl9YFxuICApO1xuICByZXR1cm4gbm93LnZhbHVlT2YoKSA+PSByZW5ld0J5LnZhbHVlT2YoKTtcbn1cblxuLyoqXG4gKiBHZXQgdGhlIGV4cGlyYXRpb24gYW5kIHJlY29tbWVuZGVkIHJlbmV3YWwgZGF0ZXMsIGZvciB0aGUgbGF0ZXN0IGlzc3VlZFxuICogY2VydCBmb3IgYSBnaXZlbiBjb21tb25fbmFtZVxuICpcbiAqIEBhbHBoYVxuICogQHBhcmFtIGNvbW1vbk5hbWUgLSBjb21tb25fbmFtZSBvZiBjZXJ0IHdob3NlIGV4cGlyYXRpb24gaW5mbyBpcyBkZXNpcmVkXG4gKiBAcGFyYW0gcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzIC0gbnVtYmVyIG9mIGJ1c2luZXNzIGRheXMgYmVmb3JlIGNlcnQgZXhwaXJhdGlvbiwgdG8gc3RhcnQgaW5kaWNhdGluZyB0aGF0IGl0IHNob3VsZCBiZSByZW5ld2VkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDZXJ0RXhwaXJhdGlvbkluZm8oXG4gIGNvbW1vbk5hbWU6IHN0cmluZyxcbiAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzID0gUkVNQUlOSU5HX0JVU0lORVNTX0RBWVNfVkFMSURJVFlfQkVGT1JFX1JFTkVXXG4pOiB7IG11c3RSZW5ldzogYm9vbGVhbjsgcmVuZXdCeTogRGF0ZTsgZXhwaXJlQXQ6IERhdGUgfSB7XG4gIGNvbnN0IGRvbWFpbkNlcnRQYXRoID0gcGF0aEZvckRvbWFpbihjb21tb25OYW1lLCBgY2VydGlmaWNhdGUuY3J0YCk7XG4gIGlmICghZXhpc3RzKGRvbWFpbkNlcnRQYXRoKSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoYGNlcnQgZm9yICR7Y29tbW9uTmFtZX0gd2FzIG5vdCBmb3VuZGApO1xuICBjb25zdCBkb21haW5DZXJ0ID0gcmVhZEZpbGUoZG9tYWluQ2VydFBhdGgpLnRvU3RyaW5nKCk7XG4gIGlmICghZG9tYWluQ2VydCkge1xuICAgIHRocm93IG5ldyBFcnJvcihgTm8gY2VydGlmaWNhdGUgZm9yICR7Y29tbW9uTmFtZX0gZXhpc3RzYCk7XG4gIH1cbiAgY29uc3QgY3J0ID0gZ2V0Q2VydFBvcnRpb25PZlBlbVN0cmluZyhkb21haW5DZXJ0KTtcbiAgY29uc3QgeyBleHBpcmVBdCwgcmVuZXdCeSB9ID0gZ2V0RXhwaXJlQW5kUmVuZXdhbERhdGVzKFxuICAgIGNydCxcbiAgICByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXNcbiAgKTtcbiAgY29uc3QgbXVzdFJlbmV3ID0gc2hvdWxkUmVuZXcoY3J0LCByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXMpO1xuICByZXR1cm4geyBtdXN0UmVuZXcsIGV4cGlyZUF0LCByZW5ld0J5IH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNlcnRpZmljYXRlRm9ySW1wbDxcbiAgTyBleHRlbmRzIE9wdGlvbnMsXG4gIENPIGV4dGVuZHMgUGFydGlhbDxDZXJ0T3B0aW9ucz5cbj4oXG4gIGNvbW1vbk5hbWU6IHN0cmluZyxcbiAgYWx0ZXJuYXRpdmVOYW1lczogc3RyaW5nW10sXG4gIG9wdGlvbnM6IE8gPSB7fSBhcyBPLFxuICBwYXJ0aWFsQ2VydE9wdGlvbnM6IENPID0ge30gYXMgQ09cbik6IFByb21pc2U8SVJldHVybkRhdGE8Tz4+IHtcbiAgZGVidWcoXG4gICAgYENlcnRpZmljYXRlIHJlcXVlc3RlZCBmb3IgJHtjb21tb25OYW1lfS4gU2tpcHBpbmcgY2VydHV0aWwgaW5zdGFsbDogJHtCb29sZWFuKFxuICAgICAgb3B0aW9ucy5za2lwQ2VydHV0aWxJbnN0YWxsXG4gICAgKX0uIFNraXBwaW5nIGhvc3RzIGZpbGU6ICR7Qm9vbGVhbihvcHRpb25zLnNraXBIb3N0c0ZpbGUpfWBcbiAgKTtcbiAgY29uc3QgY2VydE9wdGlvbnM6IENlcnRPcHRpb25zID0ge1xuICAgIC4uLkRFRkFVTFRfQ0VSVF9PUFRJT05TLFxuICAgIC4uLnBhcnRpYWxDZXJ0T3B0aW9uc1xuICB9O1xuICBpZiAob3B0aW9ucy51aSkge1xuICAgIE9iamVjdC5hc3NpZ24oVUksIG9wdGlvbnMudWkpO1xuICB9XG5cbiAgaWYgKCFpc01hYyAmJiAhaXNMaW51eCAmJiAhaXNXaW5kb3dzKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBQbGF0Zm9ybSBub3Qgc3VwcG9ydGVkOiBcIiR7cHJvY2Vzcy5wbGF0Zm9ybX1cImApO1xuICB9XG5cbiAgaWYgKCFjb21tYW5kRXhpc3RzKCdvcGVuc3NsJykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAnT3BlblNTTCBub3QgZm91bmQ6IE9wZW5TU0wgaXMgcmVxdWlyZWQgdG8gZ2VuZXJhdGUgU1NMIGNlcnRpZmljYXRlcyAtIG1ha2Ugc3VyZSBpdCBpcyBpbnN0YWxsZWQgYW5kIGF2YWlsYWJsZSBpbiB5b3VyIFBBVEgnXG4gICAgKTtcbiAgfVxuXG4gIGNvbnN0IGRvbWFpbktleVBhdGggPSBrZXlQYXRoRm9yRG9tYWluKGNvbW1vbk5hbWUpO1xuICBjb25zdCBkb21haW5DZXJ0UGF0aCA9IGNlcnRQYXRoRm9yRG9tYWluKGNvbW1vbk5hbWUpO1xuXG4gIGlmICghZXhpc3RzKHJvb3RDQUtleVBhdGgpKSB7XG4gICAgZGVidWcoXG4gICAgICAnUm9vdCBDQSBpcyBub3QgaW5zdGFsbGVkIHlldCwgc28gaXQgbXVzdCBiZSBvdXIgZmlyc3QgcnVuLiBJbnN0YWxsaW5nIHJvb3QgQ0EgLi4uJ1xuICAgICk7XG4gICAgYXdhaXQgaW5zdGFsbENlcnRpZmljYXRlQXV0aG9yaXR5KG9wdGlvbnMsIGNlcnRPcHRpb25zKTtcbiAgfSBlbHNlIGlmIChvcHRpb25zLmdldENhQnVmZmVyIHx8IG9wdGlvbnMuZ2V0Q2FQYXRoKSB7XG4gICAgZGVidWcoXG4gICAgICAnUm9vdCBDQSBpcyBub3QgcmVhZGFibGUsIGJ1dCBpdCBwcm9iYWJseSBpcyBiZWNhdXNlIGFuIGVhcmxpZXIgdmVyc2lvbiBvZiBkZXZjZXJ0IGxvY2tlZCBpdC4gVHJ5aW5nIHRvIGZpeC4uLidcbiAgICApO1xuICAgIGF3YWl0IGVuc3VyZUNBQ2VydFJlYWRhYmxlKG9wdGlvbnMsIGNlcnRPcHRpb25zKTtcbiAgfVxuXG4gIGlmICghZXhpc3RzKGRvbWFpbkNlcnRQYXRoKSkge1xuICAgIGRlYnVnKFxuICAgICAgYENhbid0IGZpbmQgY2VydGlmaWNhdGUgZmlsZSBmb3IgJHtjb21tb25OYW1lfSwgc28gaXQgbXVzdCBiZSB0aGUgZmlyc3QgcmVxdWVzdCBmb3IgJHtjb21tb25OYW1lfS4gR2VuZXJhdGluZyBhbmQgY2FjaGluZyAuLi5gXG4gICAgKTtcbiAgICBhd2FpdCBnZW5lcmF0ZURvbWFpbkNlcnRpZmljYXRlKGNvbW1vbk5hbWUsIGFsdGVybmF0aXZlTmFtZXMsIGNlcnRPcHRpb25zKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBjZXJ0Q29udGVudHMgPSBnZXRDZXJ0UG9ydGlvbk9mUGVtU3RyaW5nKFxuICAgICAgcmVhZEZpbGUoZG9tYWluQ2VydFBhdGgpLnRvU3RyaW5nKClcbiAgICApO1xuICAgIGNvbnN0IGV4cGlyZURhdGUgPSBfZ2V0RXhwaXJlRGF0ZShjZXJ0Q29udGVudHMpO1xuICAgIGlmIChcbiAgICAgIHNob3VsZFJlbmV3KFxuICAgICAgICBjZXJ0Q29udGVudHMsXG4gICAgICAgIG9wdGlvbnMucmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzID8/XG4gICAgICAgICAgUkVNQUlOSU5HX0JVU0lORVNTX0RBWVNfVkFMSURJVFlfQkVGT1JFX1JFTkVXXG4gICAgICApXG4gICAgKSB7XG4gICAgICBkZWJ1ZyhcbiAgICAgICAgYENlcnRpZmljYXRlIGZvciAke2NvbW1vbk5hbWV9IHdhcyBjbG9zZSB0byBleHBpcmluZyAob24gJHtleHBpcmVEYXRlLnRvRGF0ZVN0cmluZygpfSkuIEEgZnJlc2ggY2VydGlmaWNhdGUgd2lsbCBiZSBnZW5lcmF0ZWQgZm9yIHlvdWBcbiAgICAgICk7XG4gICAgICBhd2FpdCByZW1vdmVBbmRSZXZva2VEb21haW5DZXJ0KGNvbW1vbk5hbWUpO1xuICAgICAgYXdhaXQgZ2VuZXJhdGVEb21haW5DZXJ0aWZpY2F0ZShcbiAgICAgICAgY29tbW9uTmFtZSxcbiAgICAgICAgYWx0ZXJuYXRpdmVOYW1lcyxcbiAgICAgICAgY2VydE9wdGlvbnNcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlYnVnKFxuICAgICAgICBgQ2VydGlmaWNhdGUgZm9yICR7Y29tbW9uTmFtZX0gd2FzIG5vdCBjbG9zZSB0byBleHBpcmluZyAob24gJHtleHBpcmVEYXRlLnRvRGF0ZVN0cmluZygpfSkuYFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBpZiAoIW9wdGlvbnMuc2tpcEhvc3RzRmlsZSkge1xuICAgIGF3YWl0IGN1cnJlbnRQbGF0Zm9ybS5hZGREb21haW5Ub0hvc3RGaWxlSWZNaXNzaW5nKGNvbW1vbk5hbWUpO1xuICB9XG5cbiAgZGVidWcoYFJldHVybmluZyBkb21haW4gY2VydGlmaWNhdGVgKTtcblxuICBjb25zdCByZXQgPSB7XG4gICAga2V5OiByZWFkRmlsZShkb21haW5LZXlQYXRoKSxcbiAgICBjZXJ0OiByZWFkRmlsZShkb21haW5DZXJ0UGF0aClcbiAgfSBhcyBJUmV0dXJuRGF0YTxPPjtcbiAgaWYgKG9wdGlvbnMuZ2V0Q2FCdWZmZXIpXG4gICAgKChyZXQgYXMgdW5rbm93bikgYXMgQ2FCdWZmZXIpLmNhID0gcmVhZEZpbGUocm9vdENBQ2VydFBhdGgpO1xuICBpZiAob3B0aW9ucy5nZXRDYVBhdGgpICgocmV0IGFzIHVua25vd24pIGFzIENhUGF0aCkuY2FQYXRoID0gcm9vdENBQ2VydFBhdGg7XG5cbiAgcmV0dXJuIHJldDtcbn1cblxuLyoqXG4gKiBUcnVzdCB0aGUgY2VydGlmaWNhdGUgZm9yIGEgZ2l2ZW4gaG9zdG5hbWUgYW5kIHBvcnQgYW5kIGFkZFxuICogdGhlIHJldHVybmVkIGNlcnQgdG8gdGhlIGxvY2FsIHRydXN0IHN0b3JlLlxuICogQHBhcmFtIGhvc3RuYW1lIC0gaG9zdG5hbWUgb2YgdGhlIHJlbW90ZSBtYWNoaW5lXG4gKiBAcGFyYW0gcG9ydCAtIHBvcnQgdG8gY29ubmVjdCB0aGUgcmVtb3RlIG1hY2hpbmVcbiAqIEBwYXJhbSBjZXJ0UGF0aCAtIGZpbGUgcGF0aCB0byBzdG9yZSB0aGUgY2VydFxuICovXG5hc3luYyBmdW5jdGlvbiB0cnVzdENlcnRzT25SZW1vdGUoXG4gIGhvc3RuYW1lOiBzdHJpbmcsXG4gIHBvcnQ6IG51bWJlcixcbiAgY2VydFBhdGg6IHN0cmluZ1xuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgLy8gR2V0IHRoZSByZW1vdGUgY2VydGlmaWNhdGUgZnJvbSB0aGUgc2VydmVyXG4gIGNvbnN0IGNlcnREYXRhID0gYXdhaXQgZ2V0UmVtb3RlQ2VydGlmaWNhdGUoaG9zdG5hbWUsIHBvcnQpO1xuICB0cnkge1xuICAgIC8vIFdyaXRlIHRoZSBjZXJ0aWZpY2F0ZSBkYXRhIG9uIHRoaXMgZmlsZS5cbiAgICB3cml0ZUZpbGVTeW5jKGNlcnRQYXRoLCBjZXJ0RGF0YSk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHRocm93IG5ldyBFcnJvcihlcnIpO1xuICB9XG4gIC8vIFRydXN0IHRoZSByZW1vdGUgY2VydCBvbiB5b3VyIGxvY2FsIGJveFxuICB0cnkge1xuICAgIGF3YWl0IGN1cnJlbnRQbGF0Zm9ybS5hZGRUb1RydXN0U3RvcmVzKGNlcnRQYXRoKTtcbiAgICBkZWJ1ZygnQ2VydGlmaWNhdGUgdHJ1c3RlZCBzdWNjZXNzZnVsbHknKTtcbiAgICBkZWJ1ZygnQXR0ZW1wdGluZyB0byBjbG9zZSB0aGUgcmVtb3RlIHNlcnZlcicpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoZXJyKTtcbiAgfVxuICByZXR1cm4gY2VydERhdGE7XG59XG4vKipcbiAqIFRydXN0IHRoZSByZW1vdGUgaG9zdHMncyBjZXJ0aWZpY2F0ZSBvbiBsb2NhbCBtYWNoaW5lLlxuICogVGhpcyBmdW5jdGlvbiB3b3VsZCBzc2ggaW50byB0aGUgcmVtb3RlIGhvc3QsIGdldCB0aGUgY2VydGlmaWNhdGVcbiAqIGFuZCB0cnVzdCB0aGUgbG9jYWwgbWFjaGluZSBmcm9tIHdoZXJlIHRoaXMgZnVuY3Rpb24gaXMgZ2V0dGluZyBjYWxsZWQgZnJvbS5cbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSBob3N0bmFtZSAtIGhvc3RuYW1lIG9mIHRoZSByZW1vdGUgbWFjaGluZVxuICogQHBhcmFtIHBvcnQgLSBwb3J0IHRvIGNvbm5lY3QgdGhlIHJlbW90ZSBtYWNoaW5lXG4gKiBAcGFyYW0gY2VydFBhdGggLSBmaWxlIHBhdGggdG8gc3RvcmUgdGhlIGNlcnRcbiAqIEBwYXJhbSByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXMgLSB2YWxpZCBkYXlzIGJlZm9yZSByZW5ld2luZyB0aGUgY2VydFxuICovXG5leHBvcnQgZnVuY3Rpb24gdHJ1c3RSZW1vdGVNYWNoaW5lKFxuICBob3N0bmFtZTogc3RyaW5nLFxuICBwb3J0OiBudW1iZXIsXG4gIGNlcnRQYXRoOiBzdHJpbmcsXG4gIHJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5cyA9IFJFTUFJTklOR19CVVNJTkVTU19EQVlTX1ZBTElESVRZX0JFRk9SRV9SRU5FV1xuKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgZGVidWcoYENvbm5lY3RpbmcgdG8gcmVtb3RlIHNlcnZlciBvbiBwb3J0OiAke3BvcnR9YCk7XG4gICAgLy8gQ29ubmVjdCB0byByZW1vdGUgYm94IHZpYSBzc2guXG4gICAgY29uc3QgY2hpbGQgPSBleGVjYS5zaGVsbChcbiAgICAgIC8vIEBUT0RPIENoYW5nZSB0aGlzIHRvIG5weFxuICAgICAgYHNzaCAke2hvc3RuYW1lfSBub2RlIGRldmNlcnQvc3JjL2V4cHJlc3MuanMgLS1wb3J0PSR7cG9ydH0gYCxcbiAgICAgIHtcbiAgICAgICAgZGV0YWNoZWQ6IGZhbHNlXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIFRocm93IGFueSBlcnJvciB0aGF0IG1pZ2h0IGhhdmUgb2NjdXJyZWQgb24gdGhlIHJlbW90ZSBzaWRlLlxuICAgIGlmIChjaGlsZCAmJiBjaGlsZC5zdGRlcnIpIHtcbiAgICAgIGNoaWxkLnN0ZGVyci5vbignZGF0YScsIChlcnI6IGV4ZWNhLlN0ZElPT3B0aW9uKSA9PiB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihlcnI/LnRvU3RyaW5nKCkpO1xuICAgICAgfSk7XG4gICAgfVxuICAgIGlmIChjaGlsZCAmJiBjaGlsZC5zdGRvdXQpIHtcbiAgICAgIGNoaWxkLnN0ZG91dC5vbignZGF0YScsIGFzeW5jIChkYXRhOiBleGVjYS5TdGRJT09wdGlvbikgPT4ge1xuICAgICAgICBkZWJ1ZygnQ29ubmVjdGVkIHRvIHJlbW90ZSBzZXJ2ZXIgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgICAgIGNvbnN0IHN0ZG91dERhdGEgPSBkYXRhPy50b1N0cmluZygpLnRyaW1SaWdodCgpO1xuICAgICAgICBpZiAoc3Rkb3V0RGF0YT8uaW5jbHVkZXMoYFNlcnZlciBzdGFydGVkIGF0IHBvcnQ6ICR7cG9ydH1gKSkge1xuICAgICAgICAgIC8vIFRydXN0IHRoZSBjZXJ0c1xuICAgICAgICAgIGNvbnN0IGNlcnREYXRhID0gYXdhaXQgdHJ1c3RDZXJ0c09uUmVtb3RlKGhvc3RuYW1lLCBwb3J0LCBjZXJ0UGF0aCk7XG4gICAgICAgICAgLy8gT25jZSBjZXJ0cyBhcmUgdHJ1c3RlZCwgY2xvc2UgdGhlIHJlbW90ZSBzZXJ2ZXIgYW5kIGNsZWFudXAuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlbW90ZVNlcnZlciA9IGF3YWl0IGNsb3NlUmVtb3RlU2VydmVyKGhvc3RuYW1lLCBwb3J0KTtcbiAgICAgICAgICAgIGRlYnVnKHJlbW90ZVNlcnZlcik7XG4gICAgICAgICAgICBjb25zdCBjcnQgPSBnZXRDZXJ0UG9ydGlvbk9mUGVtU3RyaW5nKGNlcnREYXRhKTtcbiAgICAgICAgICAgIGNvbnN0IG11c3RSZW5ldyA9IHNob3VsZFJlbmV3KGNydCwgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzKTtcbiAgICAgICAgICAgIC8vIHJldHVybiB0aGUgY2VydGlmaWNhdGUgcmVuZXdhbCBzdGF0ZSB0byB0aGUgY29uc3VtZXIgdG8gaGFuZGxlIHRoZVxuICAgICAgICAgICAgLy8gcmVuZXdhbCB1c2VjYXNlLlxuICAgICAgICAgICAgcmVzb2x2ZShtdXN0UmVuZXcpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNoaWxkLmtpbGwoKTtcbiAgICAgICAgfSBlbHNlIGlmIChzdGRvdXREYXRhPy5pbmNsdWRlcygnUHJvY2VzcyB0ZXJtaW5hdGVkJykpIHtcbiAgICAgICAgICBkZWJ1ZygnUmVtb3RlIHNlcnZlciBjbG9zZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZWplY3QoJ0Vycm9yIGV4ZWN1dGluZyBzaGVsbCBjb21tYW5kJyk7XG4gICAgfVxuICB9KTtcbn1cblxuLyoqXG4gKiBVbnRydXN0IHRoZSBjZXJ0aWZpY2F0ZSBmb3IgYSBnaXZlbiBmaWxlIHBhdGguXG4gKiBAcHVibGljXG4gKiBAcGFyYW0gZmlsZVBhdGggLSBmaWxlIHBhdGggb2YgdGhlIGNlcnRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVudHJ1c3RNYWNoaW5lKGZpbGVQYXRoOiBzdHJpbmcpOiB2b2lkIHtcbiAgY3VycmVudFBsYXRmb3JtLnJlbW92ZUZyb21UcnVzdFN0b3JlcyhmaWxlUGF0aCk7XG59XG5cbi8qKlxuICogQ2hlY2sgd2hldGhlciBhIGNlcnRpZmljYXRlIHdpdGggYSBnaXZlbiBjb21tb25fbmFtZSBoYXMgYmVlbiBpbnN0YWxsZWRcbiAqXG4gKiBAcHVibGljXG4gKiBAcGFyYW0gY29tbW9uTmFtZSAtIGNvbW1vbk5hbWUgb2YgY2VydGlmaWNhdGUgd2hvc2UgZXhpc3RlbmNlIGlzIGJlaW5nIGNoZWNrZWRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhhc0NlcnRpZmljYXRlRm9yKGNvbW1vbk5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gZXhpc3RzKHBhdGhGb3JEb21haW4oY29tbW9uTmFtZSwgYGNlcnRpZmljYXRlLmNydGApKTtcbn1cblxuLyoqXG4gKiBHZXQgYSBsaXN0IG9mIGRvbWFpbnMgdGhhdCBjZXJ0aWZpYXRlcyBoYXZlIGJlZW4gZ2VuZXJhdGVkIGZvclxuICogQGFscGhhXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb25maWd1cmVkRG9tYWlucygpOiBzdHJpbmdbXSB7XG4gIHJldHVybiByZWFkZGlyKGRvbWFpbnNEaXIpO1xufVxuXG4vKipcbiAqIFJlbW92ZSBhIGNlcnRpZmljYXRlXG4gKiBAcHVibGljXG4gKiBAcGFyYW0gY29tbW9uTmFtZSAtIGNvbW1vbk5hbWUgb2YgY2VydCB0byByZW1vdmVcbiAqIEBkZXByZWNhdGVkIHBsZWFzZSB1c2Uge0BsaW5rIHJlbW92ZUFuZFJldm9rZURvbWFpbkNlcnQgfCByZW1vdmVBbmRSZXZva2VEb21haW5DZXJ0fSB0byBlbnN1cmUgdGhhdCB0aGUgT3BlblNTTCBjZXJ0IHJlbW92YWwgaXMgaGFuZGxlZCBwcm9wZXJseVxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRG9tYWluKGNvbW1vbk5hbWU6IHN0cmluZyk6IHZvaWQge1xuICByaW1yYWYuc3luYyhwYXRoRm9yRG9tYWluKGNvbW1vbk5hbWUpKTtcbn1cblxuLyoqXG4gKiBSZW1vdmUgYSBjZXJ0aWZpY2F0ZSBhbmQgcmV2b2tlIGl0IGZyb20gdGhlIE9wZW5TU0wgY2VydCBkYXRhYmFzZVxuICogQHB1YmxpY1xuICogQHBhcmFtIGNvbW1vbk5hbWUgLSBjb21tb25OYW1lIG9mIGNlcnQgdG8gcmVtb3ZlXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZW1vdmVBbmRSZXZva2VEb21haW5DZXJ0KFxuICBjb21tb25OYW1lOiBzdHJpbmdcbik6IFByb21pc2U8dm9pZD4ge1xuICBkZWJ1ZyhgcmVtb3ZpbmcgZG9tYWluIGNlcnRpZmljYXRlIGZvciAke2NvbW1vbk5hbWV9YCk7XG4gIGNvbnN0IGNlcnRGb2xkZXJQYXRoID0gcGF0aEZvckRvbWFpbihjb21tb25OYW1lKTtcbiAgY29uc3QgZG9tYWluQ2VydFBhdGggPSBjZXJ0UGF0aEZvckRvbWFpbihjb21tb25OYW1lKTtcbiAgaWYgKGV4aXN0c1N5bmMoY2VydEZvbGRlclBhdGgpKSB7XG4gICAgZGVidWcoYGNlcnQgZm91bmQgb24gZGlzayBmb3IgJHtjb21tb25OYW1lfWApO1xuICAgIC8vIHJldm9rZSB0aGUgY2VydFxuICAgIGRlYnVnKGByZXZva2luZyBjZXJ0ICR7Y29tbW9uTmFtZX1gKTtcbiAgICBhd2FpdCByZXZva2VEb21haW5DZXJ0aWZpY2F0ZShjb21tb25OYW1lKTtcbiAgICAvLyBkZWxldGUgdGhlIGNlcnQgZmlsZVxuICAgIGRlYnVnKFxuICAgICAgYGRlbGV0aW5nIGNlcnQgb24gZGlzayBmb3IgJHtjb21tb25OYW1lfSAtICR7XG4gICAgICAgIHN0YXRTeW5jKGRvbWFpbkNlcnRQYXRoKS5zaXplXG4gICAgICB9YFxuICAgICk7XG4gICAgcmVtb3ZlRG9tYWluKGNvbW1vbk5hbWUpO1xuICAgIGRlYnVnKFxuICAgICAgYGRlbGV0ZWQgY2VydCBvbiBkaXNrIGZvciAke2NvbW1vbk5hbWV9IC0gJHtleGlzdHNTeW5jKGRvbWFpbkNlcnRQYXRoKX1gXG4gICAgKTtcbiAgfSBlbHNlIGRlYnVnKGBjZXJ0IG5vdCBmb3VuZCBvbiBkaXNrICR7Y29tbW9uTmFtZX1gKTtcbiAgZGVidWcoYGNvbXBsZXRlZCByZW1vdmluZyBkb21haW4gY2VydGlmaWNhdGUgZm9yICR7Y29tbW9uTmFtZX1gKTtcbn1cbiJdfQ==