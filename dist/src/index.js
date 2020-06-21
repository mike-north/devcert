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
exports.closeRemoteServer = remote_utils_1.closeRemoteServer;
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
function _logOrDebug(logger, type, message) {
    if (logger && type) {
        logger[type](message);
    }
    else {
        debug(message);
    }
}
/**
 * Trust the certificate for a given hostname and port and add
 * the returned cert to the local trust store.
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 * @param certPath - file path to store the cert
 */
async function trustCertsOnRemote(hostname, port, certPath, renewalBufferInBusinessDays, getRemoteCertsFunc = remote_utils_1.getRemoteCertificate, closeRemoteFunc = remote_utils_1.closeRemoteServer) {
    // Get the remote certificate from the server
    let mustRenew = false;
    try {
        debug('getting cert from remote machine');
        const certData = await getRemoteCertsFunc(hostname, port);
        mustRenew = shouldRenew(certData, renewalBufferInBusinessDays);
        debug(`writing the certificate data onto local file path: ${certPath}`);
        // Write the certificate data on this file.
        fs_1.writeFileSync(certPath, certData);
        // Trust the remote cert on your local box
        await platforms_1.default.addToTrustStores(certPath);
        debug('Certificate trusted successfully');
    }
    catch (err) {
        closeRemoteFunc(hostname, port);
        throw new Error(err);
    }
    return { mustRenew };
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
 * @param logger - Optional param for enabling logging in the consuming apps
 */
function trustRemoteMachine(hostname, port, certPath, renewalBufferInBusinessDays = REMAINING_BUSINESS_DAYS_VALIDITY_BEFORE_RENEW, logger) {
    return new Promise((resolve, reject) => {
        _logOrDebug(logger, 'log', `Connecting to remote host ${hostname} via ssh`);
        // Connect to remote box via ssh.
        const child = execa.shell(
        // @TODO Change this to npx
        `ssh ${hostname} npx mike-north/devcert#suchita/remote-connect remote --port=${port} `, {
            detached: false
        });
        // Throw any error that might have occurred on the remote side.
        if (child && child.stderr) {
            child.stderr.on('data', (data) => {
                var _a, _b;
                const stdErrData = (_a = data) === null || _a === void 0 ? void 0 : _a.toString().trimRight();
                if ((_b = stdErrData) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes('error')) {
                    remote_utils_1.closeRemoteServer(hostname, port);
                    throw new Error(stdErrData);
                }
            });
        }
        // Listen to the stdout stream and determine the appropriate steps.
        if (child && child.stdout) {
            _logOrDebug(logger, 'log', `Attempting to start the server at port ${port}. This may take a while...`);
            child.stdout.on('data', async (data) => {
                var _a, _b, _c;
                const stdoutData = (_a = data) === null || _a === void 0 ? void 0 : _a.toString().trimRight();
                if ((_b = stdoutData) === null || _b === void 0 ? void 0 : _b.includes(`Server started at port: ${port}`)) {
                    _logOrDebug(logger, 'log', `Connected to remote host ${hostname} via ssh successfully`);
                    // Once certs are trusted, close the remote server and cleanup.
                    try {
                        const mustRenew = await _trustRemoteMachine(hostname, port, certPath, renewalBufferInBusinessDays, logger);
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
                    _logOrDebug(logger, 'log', 'Remote server closed successfully');
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
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 * @param certPath - file path to store the cert
 * @param renewalBufferInBusinessDays - valid days before renewing the cert
 * @param logger - Optional param for enabling logging in the consuming apps
 * @param trustCertsOnRemoteFunc - function that gets the certificate from remote machine and trusts it on local machine
 * @param closeRemoteFunc - function that closes the remote machine connection.
 *
 * @private
 * @internal
 */
async function _trustRemoteMachine(hostname, port, certPath, renewalBufferInBusinessDays, logger, trustCertsOnRemoteFunc = trustCertsOnRemote, closeRemoteFunc = remote_utils_1.closeRemoteServer) {
    try {
        _logOrDebug(logger, 'log', 'Attempting to trust the remote certificate on this machine');
        // Trust the certs
        const { mustRenew } = await trustCertsOnRemoteFunc(hostname, port, certPath, renewalBufferInBusinessDays);
        _logOrDebug(logger, 'log', 'Certificate trusted successfully');
        // return the certificate renewal state to the consumer to handle the
        // renewal usecase.
        return mustRenew;
    }
    catch (err) {
        throw new Error(err);
    }
    finally {
        _logOrDebug(logger, 'log', 'Attempting to close the remote server');
        // Close the remote server and cleanup always.
        const remoteServerResponse = await closeRemoteFunc(hostname, port);
        debug(remoteServerResponse);
    }
}
exports._trustRemoteMachine = _trustRemoteMachine;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInNyYy9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsMkRBQTJEO0FBQzNEOzs7R0FHRzs7QUFFSCwyQkFPWTtBQUNaLCtCQUErQjtBQUMvQixxQ0FBcUM7QUFDckMsbURBQXVEO0FBQ3ZELGlDQUFpQztBQUNqQywyQ0FPcUI7QUFDckIsMkNBQTBDO0FBQzFDLG1FQUdpQztBQVd4QixvQkFaUCxpQ0FBUyxDQVlPO0FBVmxCLGlEQUd3QjtBQUN4QixxREFBcUQ7QUFDckQsaURBQXlFO0FBSzlCLDRCQUxaLGdDQUFpQixDQUtZO0FBSjVELDJDQUFpQztBQUNqQyx1Q0FBMkM7QUFDM0MsbUNBQTZFO0FBRzdFLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUVyQyxNQUFNLDZDQUE2QyxHQUFHLENBQUMsQ0FBQztBQStFeEQsTUFBTSxvQkFBb0IsR0FBZ0I7SUFDeEMsWUFBWSxFQUFFLEdBQUc7SUFDakIsZ0JBQWdCLEVBQUUsRUFBRTtDQUNyQixDQUFDO0FBNENLLEtBQUssVUFBVSxjQUFjLENBSWxDLFVBQWtCLEVBQ2xCLHlCQUF1QyxFQUN2QyxPQUFXLEVBQ1gsa0JBQXVCO0lBRXZCLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyx5QkFBeUIsQ0FBQyxFQUFFO1FBQzVDLE9BQU8sa0JBQWtCLENBQ3ZCLFVBQVUsRUFDVix5QkFBeUIsRUFDekIsT0FBTyxFQUNQLGtCQUFrQixDQUNuQixDQUFDO0tBQ0g7U0FBTTtRQUNMLE9BQU8sa0JBQWtCLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztLQUN4RTtBQUNILENBQUM7QUFuQkQsd0NBbUJDO0FBRUQsU0FBUyx3QkFBd0IsQ0FDL0IsR0FBVyxFQUNYLDJCQUFtQztJQUVuQyxNQUFNLFFBQVEsR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUM7SUFD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QyxVQUFVLENBQUMsQ0FBQyxDQUFDO0FBQ3pDLENBQUM7QUFGRCxvQ0FFQztBQUVEOzs7O0dBSUc7QUFDSSxLQUFLLFVBQVUseUJBQXlCLENBQzdDLFVBQWtCO0lBRWxCLEtBQUssQ0FBQyxtQ0FBbUMsVUFBVSxFQUFFLENBQUMsQ0FBQztJQUN2RCxNQUFNLGNBQWMsR0FBRyxxQkFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ2pELE1BQU0sY0FBYyxHQUFHLHlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3JELElBQUksZUFBVSxDQUFDLGNBQWMsQ0FBQyxFQUFFO1FBQzlCLEtBQUssQ0FBQywwQkFBMEIsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUM5QyxrQkFBa0I7UUFDbEIsS0FBSyxDQUFDLGlCQUFpQixVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sc0NBQXVCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDMUMsdUJBQXVCO1FBQ3ZCLEtBQUssQ0FDSCw2QkFBNkIsVUFBVSxNQUNyQyxhQUFRLENBQUMsY0FBYyxDQUFDLENBQUMsSUFDM0IsRUFBRSxDQUNILENBQUM7UUFDRixZQUFZLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDekIsS0FBSyxDQUNILDRCQUE0QixVQUFVLE1BQU0sZUFBVSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQ3pFLENBQUM7S0FDSDs7UUFBTSxLQUFLLENBQUMsMEJBQTBCLFVBQVUsRUFBRSxDQUFDLENBQUM7SUFDckQsS0FBSyxDQUFDLDZDQUE2QyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBQ25FLENBQUM7QUF2QkQsOERBdUJDIiwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50LWRpc2FibGUgQHR5cGVzY3JpcHQtZXNsaW50L25vLW1pc3VzZWQtcHJvbWlzZXMgKi9cbi8qKlxuICogQHBhY2thZ2VEb2N1bWVudGF0aW9uXG4gKiBVdGlsaXRpZXMgZm9yIHNhZmVseSBnZW5lcmF0aW5nIGxvY2FsbHktdHJ1c3RlZCBhbmQgbWFjaGluZS1zcGVjaWZpYyBYLjUwOSBjZXJ0aWZpY2F0ZXMgZm9yIGxvY2FsIGRldmVsb3BtZW50XG4gKi9cblxuaW1wb3J0IHtcbiAgcmVhZEZpbGVTeW5jIGFzIHJlYWRGaWxlLFxuICByZWFkZGlyU3luYyBhcyByZWFkZGlyLFxuICBleGlzdHNTeW5jIGFzIGV4aXN0cyxcbiAgZXhpc3RzU3luYyxcbiAgd3JpdGVGaWxlU3luYyxcbiAgc3RhdFN5bmNcbn0gZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgZXhlY2EgZnJvbSAnZXhlY2EnO1xuaW1wb3J0ICogYXMgY3JlYXRlRGVidWcgZnJvbSAnZGVidWcnO1xuaW1wb3J0IHsgc3luYyBhcyBjb21tYW5kRXhpc3RzIH0gZnJvbSAnY29tbWFuZC1leGlzdHMnO1xuaW1wb3J0ICogYXMgcmltcmFmIGZyb20gJ3JpbXJhZic7XG5pbXBvcnQge1xuICBpc01hYyxcbiAgaXNMaW51eCxcbiAgaXNXaW5kb3dzLFxuICBkb21haW5zRGlyLFxuICByb290Q0FLZXlQYXRoLFxuICByb290Q0FDZXJ0UGF0aFxufSBmcm9tICcuL2NvbnN0YW50cyc7XG5pbXBvcnQgY3VycmVudFBsYXRmb3JtIGZyb20gJy4vcGxhdGZvcm1zJztcbmltcG9ydCBpbnN0YWxsQ2VydGlmaWNhdGVBdXRob3JpdHksIHtcbiAgZW5zdXJlQ0FDZXJ0UmVhZGFibGUsXG4gIHVuaW5zdGFsbFxufSBmcm9tICcuL2NlcnRpZmljYXRlLWF1dGhvcml0eSc7XG5pbXBvcnQge1xuICBnZW5lcmF0ZURvbWFpbkNlcnRpZmljYXRlLFxuICByZXZva2VEb21haW5DZXJ0aWZpY2F0ZVxufSBmcm9tICcuL2NlcnRpZmljYXRlcyc7XG5pbXBvcnQgVUksIHsgVXNlckludGVyZmFjZSB9IGZyb20gJy4vdXNlci1pbnRlcmZhY2UnO1xuaW1wb3J0IHsgZ2V0UmVtb3RlQ2VydGlmaWNhdGUsIGNsb3NlUmVtb3RlU2VydmVyIH0gZnJvbSAnLi9yZW1vdGUtdXRpbHMnO1xuaW1wb3J0IHsgcGtpIH0gZnJvbSAnbm9kZS1mb3JnZSc7XG5pbXBvcnQgeyBzdWJCdXNpbmVzc0RheXMgfSBmcm9tICdkYXRlLWZucyc7XG5pbXBvcnQgeyBwYXRoRm9yRG9tYWluLCBrZXlQYXRoRm9yRG9tYWluLCBjZXJ0UGF0aEZvckRvbWFpbiB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IHsgTG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuZXhwb3J0IHsgdW5pbnN0YWxsLCBVc2VySW50ZXJmYWNlLCBMb2dnZXIsIGNsb3NlUmVtb3RlU2VydmVyIH07XG5jb25zdCBkZWJ1ZyA9IGNyZWF0ZURlYnVnKCdkZXZjZXJ0Jyk7XG5cbmNvbnN0IFJFTUFJTklOR19CVVNJTkVTU19EQVlTX1ZBTElESVRZX0JFRk9SRV9SRU5FVyA9IDU7XG5cbi8qKlxuICogQ2VydGlmaWNhdGUgb3B0aW9uc1xuICogQHB1YmxpY1xuICovXG5leHBvcnQgaW50ZXJmYWNlIENlcnRPcHRpb25zIHtcbiAgLyoqIE51bWJlciBvZiBkYXlzIGJlZm9yZSB0aGUgQ0EgZXhwaXJlcyAqL1xuICBjYUNlcnRFeHBpcnk6IG51bWJlcjtcbiAgLyoqIE51bWJlciBvZiBkYXlzIGJlZm9yZSB0aGUgZG9tYWluIGNlcnRpZmljYXRlIGV4cGlyZXMgKi9cbiAgZG9tYWluQ2VydEV4cGlyeTogbnVtYmVyO1xufVxuLyoqXG4gKiBDZXJ0IGdlbmVyYXRpb24gb3B0aW9uc1xuICpcbiAqIEBwdWJsaWNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBPcHRpb25zIC8qIGV4dGVuZHMgUGFydGlhbDxJQ2FCdWZmZXJPcHRzICYgSUNhUGF0aE9wdHM+ICAqLyB7XG4gIC8qKiBSZXR1cm4gdGhlIENBIGNlcnRpZmljYXRlIGRhdGE/ICovXG4gIGdldENhQnVmZmVyPzogYm9vbGVhbjtcbiAgLyoqIFJldHVybiB0aGUgcGF0aCB0byB0aGUgQ0EgY2VydGlmaWNhdGU/ICovXG4gIGdldENhUGF0aD86IGJvb2xlYW47XG4gIC8qKiBJZiBgY2VydHV0aWxgIGlzIG5vdCBpbnN0YWxsZWQgYWxyZWFkeSAoZm9yIHVwZGF0aW5nIG5zcyBkYXRhYmFzZXM7IGUuZy4gZmlyZWZveCksIGRvIG5vdCBhdHRlbXB0IHRvIGluc3RhbGwgaXQgKi9cbiAgc2tpcENlcnR1dGlsSW5zdGFsbD86IGJvb2xlYW47XG4gIC8qKiBEbyBub3QgdXBkYXRlIHlvdXIgc3lzdGVtcyBob3N0IGZpbGUgd2l0aCB0aGUgZG9tYWluIG5hbWUgb2YgdGhlIGNlcnRpZmljYXRlICovXG4gIHNraXBIb3N0c0ZpbGU/OiBib29sZWFuO1xuICAvKiogVXNlciBpbnRlcmZhY2UgaG9va3MgKi9cbiAgdWk/OiBVc2VySW50ZXJmYWNlO1xuICAvKiogTnVtYmVyIG9mIGJ1c2luZXNzIGRheXMgYmVmb3JlIGRvbWFpbiBjZXJ0IGV4cGlyeSBiZWZvcmUgYXV0b21hdGljIHJldm9rZSBhbmQgcmVuZXcgKi9cbiAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzPzogbnVtYmVyO1xufVxuLyoqXG4gKiBUaGUgQ0EgcHVibGljIGtleSBhcyBhIGJ1ZmZlclxuICogQHB1YmxpY1xuICovXG5leHBvcnQgaW50ZXJmYWNlIENhQnVmZmVyIHtcbiAgLyoqIENBIHB1YmxpYyBrZXkgKi9cbiAgY2E6IEJ1ZmZlcjtcbn1cbi8qKlxuICogVGhlIGNlcnQgYXV0aG9yaXR5J3MgcGF0aCBvbiBkaXNrXG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ2FQYXRoIHtcbiAgLyoqIENBIGNlcnQgcGF0aCBvbiBkaXNrICovXG4gIGNhUGF0aDogc3RyaW5nO1xufVxuLyoqXG4gKiBEb21haW4gY2VydCBwdWJsaWMgYW5kIHByaXZhdGUga2V5cyBhcyBidWZmZXJzXG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRG9tYWluRGF0YSB7XG4gIC8qKiBwcml2YXRlIGtleSAqL1xuICBrZXk6IEJ1ZmZlcjtcbiAgLyoqIHB1YmxpYyBrZXkgKGNlcnQpICovXG4gIGNlcnQ6IEJ1ZmZlcjtcbn1cbi8qKlxuICogQSByZXR1cm4gdmFsdWUgY29udGFpbmluZyB0aGUgQ0EgcHVibGljIGtleVxuICogQHB1YmxpY1xuICovXG5leHBvcnQgdHlwZSBJUmV0dXJuQ2E8TyBleHRlbmRzIE9wdGlvbnM+ID0gT1snZ2V0Q2FCdWZmZXInXSBleHRlbmRzIHRydWVcbiAgPyBDYUJ1ZmZlclxuICA6IGZhbHNlO1xuLyoqXG4gKiBBIHJldHVybiB2YWx1ZSBjb250YWluaW5nIHRoZSBDQSBwYXRoIG9uIGRpc2tcbiAqIEBwdWJsaWNcbiAqL1xuZXhwb3J0IHR5cGUgSVJldHVybkNhUGF0aDxPIGV4dGVuZHMgT3B0aW9ucz4gPSBPWydnZXRDYVBhdGgnXSBleHRlbmRzIHRydWVcbiAgPyBDYVBhdGhcbiAgOiBmYWxzZTtcbi8qKlxuICogQSByZXR1cm4gdmFsdWUgY29udGFpbmluZyB0aGUgQ0EgcHVibGljIGtleSwgQ0EgcGF0aCBvbiBkaXNrLCBhbmQgZG9tYWluIGNlcnQgaW5mb1xuICogQHB1YmxpY1xuICovXG5leHBvcnQgdHlwZSBJUmV0dXJuRGF0YTxPIGV4dGVuZHMgT3B0aW9ucyA9IHt9PiA9IERvbWFpbkRhdGEgJlxuICBJUmV0dXJuQ2E8Tz4gJlxuICBJUmV0dXJuQ2FQYXRoPE8+O1xuXG5jb25zdCBERUZBVUxUX0NFUlRfT1BUSU9OUzogQ2VydE9wdGlvbnMgPSB7XG4gIGNhQ2VydEV4cGlyeTogMTgwLFxuICBkb21haW5DZXJ0RXhwaXJ5OiAzMFxufTtcblxuLyoqXG4gKiBSZXF1ZXN0IGFuIFNTTCBjZXJ0aWZpY2F0ZSBmb3IgdGhlIGdpdmVuIGFwcCBuYW1lIHNpZ25lZCBieSB0aGUgZGV2Y2VydCByb290XG4gKiBjZXJ0aWZpY2F0ZSBhdXRob3JpdHkuIElmIGRldmNlcnQgaGFzIHByZXZpb3VzbHkgZ2VuZXJhdGVkIGEgY2VydGlmaWNhdGUgZm9yXG4gKiB0aGF0IGFwcCBuYW1lIG9uIHRoaXMgbWFjaGluZSwgaXQgd2lsbCByZXVzZSB0aGF0IGNlcnRpZmljYXRlLlxuICpcbiAqIElmIHRoaXMgaXMgdGhlIGZpcnN0IHRpbWUgZGV2Y2VydCBpcyBiZWluZyBydW4gb24gdGhpcyBtYWNoaW5lLCBpdCB3aWxsXG4gKiBnZW5lcmF0ZSBhbmQgYXR0ZW1wdCB0byBpbnN0YWxsIGEgcm9vdCBjZXJ0aWZpY2F0ZSBhdXRob3JpdHkuXG4gKlxuICogSWYgYG9wdGlvbnMuZ2V0Q2FCdWZmZXJgIGlzIHRydWUsIHJldHVybiB2YWx1ZSB3aWxsIGluY2x1ZGUgdGhlIGNhIGNlcnRpZmljYXRlIGRhdGFcbiAqIGFzIFxceyBjYTogQnVmZmVyIFxcfVxuICpcbiAqIElmIGBvcHRpb25zLmdldENhUGF0aGAgaXMgdHJ1ZSwgcmV0dXJuIHZhbHVlIHdpbGwgaW5jbHVkZSB0aGUgY2EgY2VydGlmaWNhdGUgcGF0aFxuICogYXMgXFx7IGNhUGF0aDogc3RyaW5nIFxcfVxuICpcbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSBjb21tb25OYW1lIC0gY29tbW9uIG5hbWUgZm9yIGNlcnRpZmljYXRlXG4gKiBAcGFyYW0gYWx0ZXJuYXRpdmVOYW1lcyAtIGFsdGVybmF0ZSBuYW1lcyBmb3IgdGhlIGNlcnRpZmljYXRlXG4gKiBAcGFyYW0gb3B0aW9ucyAtIGNlcnQgZ2VuZXJhdGlvbiBvcHRpb25zXG4gKiBAcGFyYW0gcGFydGlhbENlcnRPcHRpb25zIC0gY2VydGlmaWNhdGUgb3B0aW9uc1xuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2VydGlmaWNhdGVGb3I8XG4gIE8gZXh0ZW5kcyBPcHRpb25zLFxuICBDTyBleHRlbmRzIFBhcnRpYWw8Q2VydE9wdGlvbnM+XG4+KFxuICBjb21tb25OYW1lOiBzdHJpbmcsXG4gIGFsdGVybmF0aXZlTmFtZXM6IHN0cmluZ1tdLFxuICBvcHRpb25zPzogTyxcbiAgcGFydGlhbENlcnRPcHRpb25zPzogQ09cbik6IFByb21pc2U8SVJldHVybkRhdGE8Tz4+O1xuXG4vKipcbiAqIHtAaW5oZXJpdGRvYyAoY2VydGlmaWNhdGVGb3I6MSl9XG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjZXJ0aWZpY2F0ZUZvcjxcbiAgTyBleHRlbmRzIE9wdGlvbnMsXG4gIENPIGV4dGVuZHMgUGFydGlhbDxDZXJ0T3B0aW9ucz5cbj4oXG4gIGNvbW1vbk5hbWU6IHN0cmluZyxcbiAgb3B0aW9ucz86IE8sXG4gIHBhcnRpYWxDZXJ0T3B0aW9ucz86IENPXG4pOiBQcm9taXNlPElSZXR1cm5EYXRhPE8+PjtcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjZXJ0aWZpY2F0ZUZvcjxcbiAgTyBleHRlbmRzIE9wdGlvbnMsXG4gIENPIGV4dGVuZHMgUGFydGlhbDxDZXJ0T3B0aW9ucz5cbj4oXG4gIGNvbW1vbk5hbWU6IHN0cmluZyxcbiAgb3B0aW9uc09yQWx0ZXJuYXRpdmVOYW1lczogc3RyaW5nW10gfCBPLFxuICBvcHRpb25zPzogTyxcbiAgcGFydGlhbENlcnRPcHRpb25zPzogQ09cbik6IFByb21pc2U8SVJldHVybkRhdGE8Tz4+IHtcbiAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9uc09yQWx0ZXJuYXRpdmVOYW1lcykpIHtcbiAgICByZXR1cm4gY2VydGlmaWNhdGVGb3JJbXBsKFxuICAgICAgY29tbW9uTmFtZSxcbiAgICAgIG9wdGlvbnNPckFsdGVybmF0aXZlTmFtZXMsXG4gICAgICBvcHRpb25zLFxuICAgICAgcGFydGlhbENlcnRPcHRpb25zXG4gICAgKTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gY2VydGlmaWNhdGVGb3JJbXBsKGNvbW1vbk5hbWUsIFtdLCBvcHRpb25zLCBwYXJ0aWFsQ2VydE9wdGlvbnMpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldEV4cGlyZUFuZFJlbmV3YWxEYXRlcyhcbiAgY3J0OiBzdHJpbmcsXG4gIHJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5czogbnVtYmVyXG4pOiB7IGV4cGlyZUF0OiBEYXRlOyByZW5ld0J5OiBEYXRlIH0ge1xuICBjb25zdCBleHBpcmVBdCA9IF9nZXRFeHBpcmVEYXRlKGNydCk7XG4gIGNvbnN0IHJlbmV3QnkgPSBzdWJCdXNpbmVzc0RheXMoZXhwaXJlQXQsIHJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5cyk7XG4gIHJldHVybiB7IGV4cGlyZUF0LCByZW5ld0J5IH07XG59XG5cbmZ1bmN0aW9uIGdldENlcnRQb3J0aW9uT2ZQZW1TdHJpbmcoY3J0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBiZWdpblN0ciA9ICctLS0tLUJFR0lOIENFUlRJRklDQVRFLS0tLS0nO1xuICBjb25zdCBlbmRTdHIgPSAnLS0tLS1FTkQgQ0VSVElGSUNBVEUtLS0tLSc7XG4gIGNvbnN0IGJlZ2luID0gY3J0LmluZGV4T2YoYmVnaW5TdHIpO1xuICBjb25zdCBlbmQgPSBjcnQuaW5kZXhPZihlbmRTdHIpO1xuICBpZiAoYmVnaW4gPCAwIHx8IGVuZCA8IDApXG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYEltcHJvcGVybHkgZm9ybWF0dGVkIFBFTSBmaWxlLiBFeHBlY3RlZCB0byBmaW5kICR7YmVnaW5TdHJ9IGFuZCAke2VuZFN0cn1cblwiJHtjcnR9XCJgXG4gICAgKTtcblxuICBjb25zdCBjZXJ0Q29udGVudCA9IGNydC5zdWJzdHIoYmVnaW4sIGVuZCAtIGJlZ2luICsgZW5kU3RyLmxlbmd0aCk7XG4gIHJldHVybiBjZXJ0Q29udGVudDtcbn1cblxuZnVuY3Rpb24gX2dldEV4cGlyZURhdGUoY3J0OiBzdHJpbmcpOiBEYXRlIHtcbiAgY29uc3QgY2VydEluZm8gPSBwa2kuY2VydGlmaWNhdGVGcm9tUGVtKGNydCk7XG4gIGNvbnN0IHsgbm90QWZ0ZXIgfSA9IGNlcnRJbmZvLnZhbGlkaXR5O1xuICByZXR1cm4gbm90QWZ0ZXI7XG59XG5cbmZ1bmN0aW9uIHNob3VsZFJlbmV3KFxuICBjcnQ6IHN0cmluZyxcbiAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzOiBudW1iZXJcbik6IGJvb2xlYW4ge1xuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICBjb25zdCB7IGV4cGlyZUF0LCByZW5ld0J5IH0gPSBnZXRFeHBpcmVBbmRSZW5ld2FsRGF0ZXMoXG4gICAgY3J0LFxuICAgIHJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5c1xuICApO1xuICBkZWJ1ZyhcbiAgICBgZXZhbHVhdGluZyBjZXJ0IHJlbmV3YWxcXG4tIG5vdzpcXHQke25vdy50b0RhdGVTdHJpbmcoKX1cXG4tIHJlbmV3IGF0OlxcdCR7cmVuZXdCeS50b0RhdGVTdHJpbmcoKX1cXG4tIGV4cGlyZSBhdDpcXHQke2V4cGlyZUF0LnRvRGF0ZVN0cmluZygpfWBcbiAgKTtcbiAgcmV0dXJuIG5vdy52YWx1ZU9mKCkgPj0gcmVuZXdCeS52YWx1ZU9mKCk7XG59XG5cbi8qKlxuICogR2V0IHRoZSBleHBpcmF0aW9uIGFuZCByZWNvbW1lbmRlZCByZW5ld2FsIGRhdGVzLCBmb3IgdGhlIGxhdGVzdCBpc3N1ZWRcbiAqIGNlcnQgZm9yIGEgZ2l2ZW4gY29tbW9uX25hbWVcbiAqXG4gKiBAYWxwaGFcbiAqIEBwYXJhbSBjb21tb25OYW1lIC0gY29tbW9uX25hbWUgb2YgY2VydCB3aG9zZSBleHBpcmF0aW9uIGluZm8gaXMgZGVzaXJlZFxuICogQHBhcmFtIHJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5cyAtIG51bWJlciBvZiBidXNpbmVzcyBkYXlzIGJlZm9yZSBjZXJ0IGV4cGlyYXRpb24sIHRvIHN0YXJ0IGluZGljYXRpbmcgdGhhdCBpdCBzaG91bGQgYmUgcmVuZXdlZFxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2VydEV4cGlyYXRpb25JbmZvKFxuICBjb21tb25OYW1lOiBzdHJpbmcsXG4gIHJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5cyA9IFJFTUFJTklOR19CVVNJTkVTU19EQVlTX1ZBTElESVRZX0JFRk9SRV9SRU5FV1xuKTogeyBtdXN0UmVuZXc6IGJvb2xlYW47IHJlbmV3Qnk6IERhdGU7IGV4cGlyZUF0OiBEYXRlIH0ge1xuICBjb25zdCBkb21haW5DZXJ0UGF0aCA9IHBhdGhGb3JEb21haW4oY29tbW9uTmFtZSwgYGNlcnRpZmljYXRlLmNydGApO1xuICBpZiAoIWV4aXN0cyhkb21haW5DZXJ0UGF0aCkpXG4gICAgdGhyb3cgbmV3IEVycm9yKGBjZXJ0IGZvciAke2NvbW1vbk5hbWV9IHdhcyBub3QgZm91bmRgKTtcbiAgY29uc3QgZG9tYWluQ2VydCA9IHJlYWRGaWxlKGRvbWFpbkNlcnRQYXRoKS50b1N0cmluZygpO1xuICBpZiAoIWRvbWFpbkNlcnQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIGNlcnRpZmljYXRlIGZvciAke2NvbW1vbk5hbWV9IGV4aXN0c2ApO1xuICB9XG4gIGNvbnN0IGNydCA9IGdldENlcnRQb3J0aW9uT2ZQZW1TdHJpbmcoZG9tYWluQ2VydCk7XG4gIGNvbnN0IHsgZXhwaXJlQXQsIHJlbmV3QnkgfSA9IGdldEV4cGlyZUFuZFJlbmV3YWxEYXRlcyhcbiAgICBjcnQsXG4gICAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzXG4gICk7XG4gIGNvbnN0IG11c3RSZW5ldyA9IHNob3VsZFJlbmV3KGNydCwgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzKTtcbiAgcmV0dXJuIHsgbXVzdFJlbmV3LCBleHBpcmVBdCwgcmVuZXdCeSB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBjZXJ0aWZpY2F0ZUZvckltcGw8XG4gIE8gZXh0ZW5kcyBPcHRpb25zLFxuICBDTyBleHRlbmRzIFBhcnRpYWw8Q2VydE9wdGlvbnM+XG4+KFxuICBjb21tb25OYW1lOiBzdHJpbmcsXG4gIGFsdGVybmF0aXZlTmFtZXM6IHN0cmluZ1tdLFxuICBvcHRpb25zOiBPID0ge30gYXMgTyxcbiAgcGFydGlhbENlcnRPcHRpb25zOiBDTyA9IHt9IGFzIENPXG4pOiBQcm9taXNlPElSZXR1cm5EYXRhPE8+PiB7XG4gIGRlYnVnKFxuICAgIGBDZXJ0aWZpY2F0ZSByZXF1ZXN0ZWQgZm9yICR7Y29tbW9uTmFtZX0uIFNraXBwaW5nIGNlcnR1dGlsIGluc3RhbGw6ICR7Qm9vbGVhbihcbiAgICAgIG9wdGlvbnMuc2tpcENlcnR1dGlsSW5zdGFsbFxuICAgICl9LiBTa2lwcGluZyBob3N0cyBmaWxlOiAke0Jvb2xlYW4ob3B0aW9ucy5za2lwSG9zdHNGaWxlKX1gXG4gICk7XG4gIGNvbnN0IGNlcnRPcHRpb25zOiBDZXJ0T3B0aW9ucyA9IHtcbiAgICAuLi5ERUZBVUxUX0NFUlRfT1BUSU9OUyxcbiAgICAuLi5wYXJ0aWFsQ2VydE9wdGlvbnNcbiAgfTtcbiAgaWYgKG9wdGlvbnMudWkpIHtcbiAgICBPYmplY3QuYXNzaWduKFVJLCBvcHRpb25zLnVpKTtcbiAgfVxuXG4gIGlmICghaXNNYWMgJiYgIWlzTGludXggJiYgIWlzV2luZG93cykge1xuICAgIHRocm93IG5ldyBFcnJvcihgUGxhdGZvcm0gbm90IHN1cHBvcnRlZDogXCIke3Byb2Nlc3MucGxhdGZvcm19XCJgKTtcbiAgfVxuXG4gIGlmICghY29tbWFuZEV4aXN0cygnb3BlbnNzbCcpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgJ09wZW5TU0wgbm90IGZvdW5kOiBPcGVuU1NMIGlzIHJlcXVpcmVkIHRvIGdlbmVyYXRlIFNTTCBjZXJ0aWZpY2F0ZXMgLSBtYWtlIHN1cmUgaXQgaXMgaW5zdGFsbGVkIGFuZCBhdmFpbGFibGUgaW4geW91ciBQQVRIJ1xuICAgICk7XG4gIH1cblxuICBjb25zdCBkb21haW5LZXlQYXRoID0ga2V5UGF0aEZvckRvbWFpbihjb21tb25OYW1lKTtcbiAgY29uc3QgZG9tYWluQ2VydFBhdGggPSBjZXJ0UGF0aEZvckRvbWFpbihjb21tb25OYW1lKTtcblxuICBpZiAoIWV4aXN0cyhyb290Q0FLZXlQYXRoKSkge1xuICAgIGRlYnVnKFxuICAgICAgJ1Jvb3QgQ0EgaXMgbm90IGluc3RhbGxlZCB5ZXQsIHNvIGl0IG11c3QgYmUgb3VyIGZpcnN0IHJ1bi4gSW5zdGFsbGluZyByb290IENBIC4uLidcbiAgICApO1xuICAgIGF3YWl0IGluc3RhbGxDZXJ0aWZpY2F0ZUF1dGhvcml0eShvcHRpb25zLCBjZXJ0T3B0aW9ucyk7XG4gIH0gZWxzZSBpZiAob3B0aW9ucy5nZXRDYUJ1ZmZlciB8fCBvcHRpb25zLmdldENhUGF0aCkge1xuICAgIGRlYnVnKFxuICAgICAgJ1Jvb3QgQ0EgaXMgbm90IHJlYWRhYmxlLCBidXQgaXQgcHJvYmFibHkgaXMgYmVjYXVzZSBhbiBlYXJsaWVyIHZlcnNpb24gb2YgZGV2Y2VydCBsb2NrZWQgaXQuIFRyeWluZyB0byBmaXguLi4nXG4gICAgKTtcbiAgICBhd2FpdCBlbnN1cmVDQUNlcnRSZWFkYWJsZShvcHRpb25zLCBjZXJ0T3B0aW9ucyk7XG4gIH1cblxuICBpZiAoIWV4aXN0cyhkb21haW5DZXJ0UGF0aCkpIHtcbiAgICBkZWJ1ZyhcbiAgICAgIGBDYW4ndCBmaW5kIGNlcnRpZmljYXRlIGZpbGUgZm9yICR7Y29tbW9uTmFtZX0sIHNvIGl0IG11c3QgYmUgdGhlIGZpcnN0IHJlcXVlc3QgZm9yICR7Y29tbW9uTmFtZX0uIEdlbmVyYXRpbmcgYW5kIGNhY2hpbmcgLi4uYFxuICAgICk7XG4gICAgYXdhaXQgZ2VuZXJhdGVEb21haW5DZXJ0aWZpY2F0ZShjb21tb25OYW1lLCBhbHRlcm5hdGl2ZU5hbWVzLCBjZXJ0T3B0aW9ucyk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgY2VydENvbnRlbnRzID0gZ2V0Q2VydFBvcnRpb25PZlBlbVN0cmluZyhcbiAgICAgIHJlYWRGaWxlKGRvbWFpbkNlcnRQYXRoKS50b1N0cmluZygpXG4gICAgKTtcbiAgICBjb25zdCBleHBpcmVEYXRlID0gX2dldEV4cGlyZURhdGUoY2VydENvbnRlbnRzKTtcbiAgICBpZiAoXG4gICAgICBzaG91bGRSZW5ldyhcbiAgICAgICAgY2VydENvbnRlbnRzLFxuICAgICAgICBvcHRpb25zLnJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5cyA/P1xuICAgICAgICAgIFJFTUFJTklOR19CVVNJTkVTU19EQVlTX1ZBTElESVRZX0JFRk9SRV9SRU5FV1xuICAgICAgKVxuICAgICkge1xuICAgICAgZGVidWcoXG4gICAgICAgIGBDZXJ0aWZpY2F0ZSBmb3IgJHtjb21tb25OYW1lfSB3YXMgY2xvc2UgdG8gZXhwaXJpbmcgKG9uICR7ZXhwaXJlRGF0ZS50b0RhdGVTdHJpbmcoKX0pLiBBIGZyZXNoIGNlcnRpZmljYXRlIHdpbGwgYmUgZ2VuZXJhdGVkIGZvciB5b3VgXG4gICAgICApO1xuICAgICAgYXdhaXQgcmVtb3ZlQW5kUmV2b2tlRG9tYWluQ2VydChjb21tb25OYW1lKTtcbiAgICAgIGF3YWl0IGdlbmVyYXRlRG9tYWluQ2VydGlmaWNhdGUoXG4gICAgICAgIGNvbW1vbk5hbWUsXG4gICAgICAgIGFsdGVybmF0aXZlTmFtZXMsXG4gICAgICAgIGNlcnRPcHRpb25zXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1ZyhcbiAgICAgICAgYENlcnRpZmljYXRlIGZvciAke2NvbW1vbk5hbWV9IHdhcyBub3QgY2xvc2UgdG8gZXhwaXJpbmcgKG9uICR7ZXhwaXJlRGF0ZS50b0RhdGVTdHJpbmcoKX0pLmBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFvcHRpb25zLnNraXBIb3N0c0ZpbGUpIHtcbiAgICBhd2FpdCBjdXJyZW50UGxhdGZvcm0uYWRkRG9tYWluVG9Ib3N0RmlsZUlmTWlzc2luZyhjb21tb25OYW1lKTtcbiAgfVxuXG4gIGRlYnVnKGBSZXR1cm5pbmcgZG9tYWluIGNlcnRpZmljYXRlYCk7XG5cbiAgY29uc3QgcmV0ID0ge1xuICAgIGtleTogcmVhZEZpbGUoZG9tYWluS2V5UGF0aCksXG4gICAgY2VydDogcmVhZEZpbGUoZG9tYWluQ2VydFBhdGgpXG4gIH0gYXMgSVJldHVybkRhdGE8Tz47XG4gIGlmIChvcHRpb25zLmdldENhQnVmZmVyKVxuICAgICgocmV0IGFzIHVua25vd24pIGFzIENhQnVmZmVyKS5jYSA9IHJlYWRGaWxlKHJvb3RDQUNlcnRQYXRoKTtcbiAgaWYgKG9wdGlvbnMuZ2V0Q2FQYXRoKSAoKHJldCBhcyB1bmtub3duKSBhcyBDYVBhdGgpLmNhUGF0aCA9IHJvb3RDQUNlcnRQYXRoO1xuXG4gIHJldHVybiByZXQ7XG59XG5cbmZ1bmN0aW9uIF9sb2dPckRlYnVnKFxuICBsb2dnZXI6IExvZ2dlciB8IHVuZGVmaW5lZCxcbiAgdHlwZTogJ2xvZycgfCAnd2FybicgfCAnZXJyb3InLFxuICBtZXNzYWdlOiBzdHJpbmdcbik6IHZvaWQge1xuICBpZiAobG9nZ2VyICYmIHR5cGUpIHtcbiAgICBsb2dnZXJbdHlwZV0obWVzc2FnZSk7XG4gIH0gZWxzZSB7XG4gICAgZGVidWcobWVzc2FnZSk7XG4gIH1cbn1cblxuLyoqXG4gKiBUcnVzdCB0aGUgY2VydGlmaWNhdGUgZm9yIGEgZ2l2ZW4gaG9zdG5hbWUgYW5kIHBvcnQgYW5kIGFkZFxuICogdGhlIHJldHVybmVkIGNlcnQgdG8gdGhlIGxvY2FsIHRydXN0IHN0b3JlLlxuICogQHBhcmFtIGhvc3RuYW1lIC0gaG9zdG5hbWUgb2YgdGhlIHJlbW90ZSBtYWNoaW5lXG4gKiBAcGFyYW0gcG9ydCAtIHBvcnQgdG8gY29ubmVjdCB0aGUgcmVtb3RlIG1hY2hpbmVcbiAqIEBwYXJhbSBjZXJ0UGF0aCAtIGZpbGUgcGF0aCB0byBzdG9yZSB0aGUgY2VydFxuICovXG5hc3luYyBmdW5jdGlvbiB0cnVzdENlcnRzT25SZW1vdGUoXG4gIGhvc3RuYW1lOiBzdHJpbmcsXG4gIHBvcnQ6IG51bWJlcixcbiAgY2VydFBhdGg6IHN0cmluZyxcbiAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzOiBudW1iZXIsXG4gIGdldFJlbW90ZUNlcnRzRnVuYyA9IGdldFJlbW90ZUNlcnRpZmljYXRlLFxuICBjbG9zZVJlbW90ZUZ1bmMgPSBjbG9zZVJlbW90ZVNlcnZlclxuKTogUHJvbWlzZTx7IG11c3RSZW5ldzogYm9vbGVhbiB9PiB7XG4gIC8vIEdldCB0aGUgcmVtb3RlIGNlcnRpZmljYXRlIGZyb20gdGhlIHNlcnZlclxuICBsZXQgbXVzdFJlbmV3ID0gZmFsc2U7XG4gIHRyeSB7XG4gICAgZGVidWcoJ2dldHRpbmcgY2VydCBmcm9tIHJlbW90ZSBtYWNoaW5lJyk7XG4gICAgY29uc3QgY2VydERhdGEgPSBhd2FpdCBnZXRSZW1vdGVDZXJ0c0Z1bmMoaG9zdG5hbWUsIHBvcnQpO1xuICAgIG11c3RSZW5ldyA9IHNob3VsZFJlbmV3KGNlcnREYXRhLCByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXMpO1xuICAgIGRlYnVnKGB3cml0aW5nIHRoZSBjZXJ0aWZpY2F0ZSBkYXRhIG9udG8gbG9jYWwgZmlsZSBwYXRoOiAke2NlcnRQYXRofWApO1xuICAgIC8vIFdyaXRlIHRoZSBjZXJ0aWZpY2F0ZSBkYXRhIG9uIHRoaXMgZmlsZS5cbiAgICB3cml0ZUZpbGVTeW5jKGNlcnRQYXRoLCBjZXJ0RGF0YSk7XG5cbiAgICAvLyBUcnVzdCB0aGUgcmVtb3RlIGNlcnQgb24geW91ciBsb2NhbCBib3hcbiAgICBhd2FpdCBjdXJyZW50UGxhdGZvcm0uYWRkVG9UcnVzdFN0b3JlcyhjZXJ0UGF0aCk7XG4gICAgZGVidWcoJ0NlcnRpZmljYXRlIHRydXN0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGNsb3NlUmVtb3RlRnVuYyhob3N0bmFtZSwgcG9ydCk7XG4gICAgdGhyb3cgbmV3IEVycm9yKGVycik7XG4gIH1cbiAgcmV0dXJuIHsgbXVzdFJlbmV3IH07XG59XG4vKipcbiAqIFRydXN0IHRoZSByZW1vdGUgaG9zdHMncyBjZXJ0aWZpY2F0ZSBvbiBsb2NhbCBtYWNoaW5lLlxuICogVGhpcyBmdW5jdGlvbiB3b3VsZCBzc2ggaW50byB0aGUgcmVtb3RlIGhvc3QsIGdldCB0aGUgY2VydGlmaWNhdGVcbiAqIGFuZCB0cnVzdCB0aGUgbG9jYWwgbWFjaGluZSBmcm9tIHdoZXJlIHRoaXMgZnVuY3Rpb24gaXMgZ2V0dGluZyBjYWxsZWQgZnJvbS5cbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSBob3N0bmFtZSAtIGhvc3RuYW1lIG9mIHRoZSByZW1vdGUgbWFjaGluZVxuICogQHBhcmFtIHBvcnQgLSBwb3J0IHRvIGNvbm5lY3QgdGhlIHJlbW90ZSBtYWNoaW5lXG4gKiBAcGFyYW0gY2VydFBhdGggLSBmaWxlIHBhdGggdG8gc3RvcmUgdGhlIGNlcnRcbiAqIEBwYXJhbSByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXMgLSB2YWxpZCBkYXlzIGJlZm9yZSByZW5ld2luZyB0aGUgY2VydFxuICogQHBhcmFtIGxvZ2dlciAtIE9wdGlvbmFsIHBhcmFtIGZvciBlbmFibGluZyBsb2dnaW5nIGluIHRoZSBjb25zdW1pbmcgYXBwc1xuICovXG5leHBvcnQgZnVuY3Rpb24gdHJ1c3RSZW1vdGVNYWNoaW5lKFxuICBob3N0bmFtZTogc3RyaW5nLFxuICBwb3J0OiBudW1iZXIsXG4gIGNlcnRQYXRoOiBzdHJpbmcsXG4gIHJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5cyA9IFJFTUFJTklOR19CVVNJTkVTU19EQVlTX1ZBTElESVRZX0JFRk9SRV9SRU5FVyxcbiAgbG9nZ2VyPzogTG9nZ2VyXG4pOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBfbG9nT3JEZWJ1Zyhsb2dnZXIsICdsb2cnLCBgQ29ubmVjdGluZyB0byByZW1vdGUgaG9zdCAke2hvc3RuYW1lfSB2aWEgc3NoYCk7XG4gICAgLy8gQ29ubmVjdCB0byByZW1vdGUgYm94IHZpYSBzc2guXG4gICAgY29uc3QgY2hpbGQgPSBleGVjYS5zaGVsbChcbiAgICAgIC8vIEBUT0RPIENoYW5nZSB0aGlzIHRvIG5weFxuICAgICAgYHNzaCAke2hvc3RuYW1lfSBucHggbWlrZS1ub3J0aC9kZXZjZXJ0I3N1Y2hpdGEvcmVtb3RlLWNvbm5lY3QgcmVtb3RlIC0tcG9ydD0ke3BvcnR9IGAsXG4gICAgICB7XG4gICAgICAgIGRldGFjaGVkOiBmYWxzZVxuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBUaHJvdyBhbnkgZXJyb3IgdGhhdCBtaWdodCBoYXZlIG9jY3VycmVkIG9uIHRoZSByZW1vdGUgc2lkZS5cbiAgICBpZiAoY2hpbGQgJiYgY2hpbGQuc3RkZXJyKSB7XG4gICAgICBjaGlsZC5zdGRlcnIub24oJ2RhdGEnLCAoZGF0YTogZXhlY2EuU3RkSU9PcHRpb24pID0+IHtcbiAgICAgICAgY29uc3Qgc3RkRXJyRGF0YSA9IGRhdGE/LnRvU3RyaW5nKCkudHJpbVJpZ2h0KCk7XG4gICAgICAgIGlmIChzdGRFcnJEYXRhPy50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlcnJvcicpKSB7XG4gICAgICAgICAgY2xvc2VSZW1vdGVTZXJ2ZXIoaG9zdG5hbWUsIHBvcnQpO1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihzdGRFcnJEYXRhKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIC8vIExpc3RlbiB0byB0aGUgc3Rkb3V0IHN0cmVhbSBhbmQgZGV0ZXJtaW5lIHRoZSBhcHByb3ByaWF0ZSBzdGVwcy5cbiAgICBpZiAoY2hpbGQgJiYgY2hpbGQuc3Rkb3V0KSB7XG4gICAgICBfbG9nT3JEZWJ1ZyhcbiAgICAgICAgbG9nZ2VyLFxuICAgICAgICAnbG9nJyxcbiAgICAgICAgYEF0dGVtcHRpbmcgdG8gc3RhcnQgdGhlIHNlcnZlciBhdCBwb3J0ICR7cG9ydH0uIFRoaXMgbWF5IHRha2UgYSB3aGlsZS4uLmBcbiAgICAgICk7XG4gICAgICBjaGlsZC5zdGRvdXQub24oJ2RhdGEnLCBhc3luYyAoZGF0YTogZXhlY2EuU3RkSU9PcHRpb24pID0+IHtcbiAgICAgICAgY29uc3Qgc3Rkb3V0RGF0YSA9IGRhdGE/LnRvU3RyaW5nKCkudHJpbVJpZ2h0KCk7XG4gICAgICAgIGlmIChzdGRvdXREYXRhPy5pbmNsdWRlcyhgU2VydmVyIHN0YXJ0ZWQgYXQgcG9ydDogJHtwb3J0fWApKSB7XG4gICAgICAgICAgX2xvZ09yRGVidWcoXG4gICAgICAgICAgICBsb2dnZXIsXG4gICAgICAgICAgICAnbG9nJyxcbiAgICAgICAgICAgIGBDb25uZWN0ZWQgdG8gcmVtb3RlIGhvc3QgJHtob3N0bmFtZX0gdmlhIHNzaCBzdWNjZXNzZnVsbHlgXG4gICAgICAgICAgKTtcbiAgICAgICAgICAvLyBPbmNlIGNlcnRzIGFyZSB0cnVzdGVkLCBjbG9zZSB0aGUgcmVtb3RlIHNlcnZlciBhbmQgY2xlYW51cC5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgbXVzdFJlbmV3ID0gYXdhaXQgX3RydXN0UmVtb3RlTWFjaGluZShcbiAgICAgICAgICAgICAgaG9zdG5hbWUsXG4gICAgICAgICAgICAgIHBvcnQsXG4gICAgICAgICAgICAgIGNlcnRQYXRoLFxuICAgICAgICAgICAgICByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXMsXG4gICAgICAgICAgICAgIGxvZ2dlclxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIC8vIHJldHVybiB0aGUgY2VydGlmaWNhdGUgcmVuZXdhbCBzdGF0ZSB0byB0aGUgY29uc3VtZXIgdG8gaGFuZGxlIHRoZVxuICAgICAgICAgICAgLy8gcmVuZXdhbCB1c2VjYXNlLlxuICAgICAgICAgICAgcmVzb2x2ZShtdXN0UmVuZXcpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNoaWxkLmtpbGwoKTtcbiAgICAgICAgfSBlbHNlIGlmIChzdGRvdXREYXRhPy5pbmNsdWRlcygnUHJvY2VzcyB0ZXJtaW5hdGVkJykpIHtcbiAgICAgICAgICBfbG9nT3JEZWJ1Zyhsb2dnZXIsICdsb2cnLCAnUmVtb3RlIHNlcnZlciBjbG9zZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZWplY3QoJ0Vycm9yIGV4ZWN1dGluZyBzaGVsbCBjb21tYW5kJyk7XG4gICAgfVxuICB9KTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gaG9zdG5hbWUgLSBob3N0bmFtZSBvZiB0aGUgcmVtb3RlIG1hY2hpbmVcbiAqIEBwYXJhbSBwb3J0IC0gcG9ydCB0byBjb25uZWN0IHRoZSByZW1vdGUgbWFjaGluZVxuICogQHBhcmFtIGNlcnRQYXRoIC0gZmlsZSBwYXRoIHRvIHN0b3JlIHRoZSBjZXJ0XG4gKiBAcGFyYW0gcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzIC0gdmFsaWQgZGF5cyBiZWZvcmUgcmVuZXdpbmcgdGhlIGNlcnRcbiAqIEBwYXJhbSBsb2dnZXIgLSBPcHRpb25hbCBwYXJhbSBmb3IgZW5hYmxpbmcgbG9nZ2luZyBpbiB0aGUgY29uc3VtaW5nIGFwcHNcbiAqIEBwYXJhbSB0cnVzdENlcnRzT25SZW1vdGVGdW5jIC0gZnVuY3Rpb24gdGhhdCBnZXRzIHRoZSBjZXJ0aWZpY2F0ZSBmcm9tIHJlbW90ZSBtYWNoaW5lIGFuZCB0cnVzdHMgaXQgb24gbG9jYWwgbWFjaGluZVxuICogQHBhcmFtIGNsb3NlUmVtb3RlRnVuYyAtIGZ1bmN0aW9uIHRoYXQgY2xvc2VzIHRoZSByZW1vdGUgbWFjaGluZSBjb25uZWN0aW9uLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIF90cnVzdFJlbW90ZU1hY2hpbmUoXG4gIGhvc3RuYW1lOiBzdHJpbmcsXG4gIHBvcnQ6IG51bWJlcixcbiAgY2VydFBhdGg6IHN0cmluZyxcbiAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzOiBudW1iZXIsXG4gIGxvZ2dlcj86IExvZ2dlcixcbiAgdHJ1c3RDZXJ0c09uUmVtb3RlRnVuYyA9IHRydXN0Q2VydHNPblJlbW90ZSxcbiAgY2xvc2VSZW1vdGVGdW5jID0gY2xvc2VSZW1vdGVTZXJ2ZXJcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICB0cnkge1xuICAgIF9sb2dPckRlYnVnKFxuICAgICAgbG9nZ2VyLFxuICAgICAgJ2xvZycsXG4gICAgICAnQXR0ZW1wdGluZyB0byB0cnVzdCB0aGUgcmVtb3RlIGNlcnRpZmljYXRlIG9uIHRoaXMgbWFjaGluZSdcbiAgICApO1xuICAgIC8vIFRydXN0IHRoZSBjZXJ0c1xuICAgIGNvbnN0IHsgbXVzdFJlbmV3IH0gPSBhd2FpdCB0cnVzdENlcnRzT25SZW1vdGVGdW5jKFxuICAgICAgaG9zdG5hbWUsXG4gICAgICBwb3J0LFxuICAgICAgY2VydFBhdGgsXG4gICAgICByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXNcbiAgICApO1xuICAgIF9sb2dPckRlYnVnKGxvZ2dlciwgJ2xvZycsICdDZXJ0aWZpY2F0ZSB0cnVzdGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgIC8vIHJldHVybiB0aGUgY2VydGlmaWNhdGUgcmVuZXdhbCBzdGF0ZSB0byB0aGUgY29uc3VtZXIgdG8gaGFuZGxlIHRoZVxuICAgIC8vIHJlbmV3YWwgdXNlY2FzZS5cbiAgICByZXR1cm4gbXVzdFJlbmV3O1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoZXJyKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBfbG9nT3JEZWJ1Zyhsb2dnZXIsICdsb2cnLCAnQXR0ZW1wdGluZyB0byBjbG9zZSB0aGUgcmVtb3RlIHNlcnZlcicpO1xuICAgIC8vIENsb3NlIHRoZSByZW1vdGUgc2VydmVyIGFuZCBjbGVhbnVwIGFsd2F5cy5cbiAgICBjb25zdCByZW1vdGVTZXJ2ZXJSZXNwb25zZSA9IGF3YWl0IGNsb3NlUmVtb3RlRnVuYyhob3N0bmFtZSwgcG9ydCk7XG4gICAgZGVidWcocmVtb3RlU2VydmVyUmVzcG9uc2UpO1xuICB9XG59XG4vKipcbiAqIFVudHJ1c3QgdGhlIGNlcnRpZmljYXRlIGZvciBhIGdpdmVuIGZpbGUgcGF0aC5cbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSBmaWxlUGF0aCAtIGZpbGUgcGF0aCBvZiB0aGUgY2VydFxuICovXG5leHBvcnQgZnVuY3Rpb24gdW50cnVzdE1hY2hpbmUoZmlsZVBhdGg6IHN0cmluZyk6IHZvaWQge1xuICBjdXJyZW50UGxhdGZvcm0ucmVtb3ZlRnJvbVRydXN0U3RvcmVzKGZpbGVQYXRoKTtcbn1cblxuLyoqXG4gKiBDaGVjayB3aGV0aGVyIGEgY2VydGlmaWNhdGUgd2l0aCBhIGdpdmVuIGNvbW1vbl9uYW1lIGhhcyBiZWVuIGluc3RhbGxlZFxuICpcbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSBjb21tb25OYW1lIC0gY29tbW9uTmFtZSBvZiBjZXJ0aWZpY2F0ZSB3aG9zZSBleGlzdGVuY2UgaXMgYmVpbmcgY2hlY2tlZFxuICovXG5leHBvcnQgZnVuY3Rpb24gaGFzQ2VydGlmaWNhdGVGb3IoY29tbW9uTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBleGlzdHMocGF0aEZvckRvbWFpbihjb21tb25OYW1lLCBgY2VydGlmaWNhdGUuY3J0YCkpO1xufVxuXG4vKipcbiAqIEdldCBhIGxpc3Qgb2YgZG9tYWlucyB0aGF0IGNlcnRpZmlhdGVzIGhhdmUgYmVlbiBnZW5lcmF0ZWQgZm9yXG4gKiBAYWxwaGFcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbmZpZ3VyZWREb21haW5zKCk6IHN0cmluZ1tdIHtcbiAgcmV0dXJuIHJlYWRkaXIoZG9tYWluc0Rpcik7XG59XG5cbi8qKlxuICogUmVtb3ZlIGEgY2VydGlmaWNhdGVcbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSBjb21tb25OYW1lIC0gY29tbW9uTmFtZSBvZiBjZXJ0IHRvIHJlbW92ZVxuICogQGRlcHJlY2F0ZWQgcGxlYXNlIHVzZSB7QGxpbmsgcmVtb3ZlQW5kUmV2b2tlRG9tYWluQ2VydCB8IHJlbW92ZUFuZFJldm9rZURvbWFpbkNlcnR9IHRvIGVuc3VyZSB0aGF0IHRoZSBPcGVuU1NMIGNlcnQgcmVtb3ZhbCBpcyBoYW5kbGVkIHByb3Blcmx5XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVEb21haW4oY29tbW9uTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gIHJpbXJhZi5zeW5jKHBhdGhGb3JEb21haW4oY29tbW9uTmFtZSkpO1xufVxuXG4vKipcbiAqIFJlbW92ZSBhIGNlcnRpZmljYXRlIGFuZCByZXZva2UgaXQgZnJvbSB0aGUgT3BlblNTTCBjZXJ0IGRhdGFiYXNlXG4gKiBAcHVibGljXG4gKiBAcGFyYW0gY29tbW9uTmFtZSAtIGNvbW1vbk5hbWUgb2YgY2VydCB0byByZW1vdmVcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlbW92ZUFuZFJldm9rZURvbWFpbkNlcnQoXG4gIGNvbW1vbk5hbWU6IHN0cmluZ1xuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGRlYnVnKGByZW1vdmluZyBkb21haW4gY2VydGlmaWNhdGUgZm9yICR7Y29tbW9uTmFtZX1gKTtcbiAgY29uc3QgY2VydEZvbGRlclBhdGggPSBwYXRoRm9yRG9tYWluKGNvbW1vbk5hbWUpO1xuICBjb25zdCBkb21haW5DZXJ0UGF0aCA9IGNlcnRQYXRoRm9yRG9tYWluKGNvbW1vbk5hbWUpO1xuICBpZiAoZXhpc3RzU3luYyhjZXJ0Rm9sZGVyUGF0aCkpIHtcbiAgICBkZWJ1ZyhgY2VydCBmb3VuZCBvbiBkaXNrIGZvciAke2NvbW1vbk5hbWV9YCk7XG4gICAgLy8gcmV2b2tlIHRoZSBjZXJ0XG4gICAgZGVidWcoYHJldm9raW5nIGNlcnQgJHtjb21tb25OYW1lfWApO1xuICAgIGF3YWl0IHJldm9rZURvbWFpbkNlcnRpZmljYXRlKGNvbW1vbk5hbWUpO1xuICAgIC8vIGRlbGV0ZSB0aGUgY2VydCBmaWxlXG4gICAgZGVidWcoXG4gICAgICBgZGVsZXRpbmcgY2VydCBvbiBkaXNrIGZvciAke2NvbW1vbk5hbWV9IC0gJHtcbiAgICAgICAgc3RhdFN5bmMoZG9tYWluQ2VydFBhdGgpLnNpemVcbiAgICAgIH1gXG4gICAgKTtcbiAgICByZW1vdmVEb21haW4oY29tbW9uTmFtZSk7XG4gICAgZGVidWcoXG4gICAgICBgZGVsZXRlZCBjZXJ0IG9uIGRpc2sgZm9yICR7Y29tbW9uTmFtZX0gLSAke2V4aXN0c1N5bmMoZG9tYWluQ2VydFBhdGgpfWBcbiAgICApO1xuICB9IGVsc2UgZGVidWcoYGNlcnQgbm90IGZvdW5kIG9uIGRpc2sgJHtjb21tb25OYW1lfWApO1xuICBkZWJ1ZyhgY29tcGxldGVkIHJlbW92aW5nIGRvbWFpbiBjZXJ0aWZpY2F0ZSBmb3IgJHtjb21tb25OYW1lfWApO1xufVxuIl19