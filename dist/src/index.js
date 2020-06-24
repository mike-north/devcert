"use strict";
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
exports.getRemoteCertificate = remote_utils_1.getRemoteCertificate;
exports.closeRemoteServer = remote_utils_1.closeRemoteServer;
const node_forge_1 = require("node-forge");
const date_fns_1 = require("date-fns");
const utils_1 = require("./utils");
const types_1 = require("@mike-north/types");
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
 *
 * @public
 */
async function trustCertsOnRemote(hostname, port, certPath, renewalBufferInBusinessDays, getRemoteCertsFunc = remote_utils_1.getRemoteCertificate, closeRemoteFunc = remote_utils_1.closeRemoteServer) {
    // Get the remote certificate from the server
    try {
        debug('getting cert from remote machine');
        const certData = await getRemoteCertsFunc(hostname, port);
        const mustRenew = shouldRenew(certData, renewalBufferInBusinessDays);
        debug(`writing the certificate data onto local file path: ${certPath}`);
        // Write the certificate data on this file.
        fs_1.writeFileSync(certPath, certData);
        // Trust the remote cert on your local box
        await platforms_1.default.addToTrustStores(certPath);
        debug('Certificate trusted successfully');
        return { mustRenew };
    }
    catch (err) {
        closeRemoteFunc(hostname, port);
        throw new Error(err);
    }
}
exports.trustCertsOnRemote = trustCertsOnRemote;
/**
 * Trust the remote hosts's certificate on local machine.
 * This function would ssh into the remote host, get the certificate
 * and trust the local machine from where this function is getting called from.
 * @public
 * @param hostname - hostname of the remote machine
 * @param certPath - file path to store the cert
 * @param param2 - TrustRemoteOptions options
 */
// check for multiple invocations for ready for connection
async function trustRemoteMachine(hostname, certPath, { port = constants_1.DEFAULT_REMOTE_PORT, renewalBufferInBusinessDays = REMAINING_BUSINESS_DAYS_VALIDITY_BEFORE_RENEW, logger } = {}) {
    debug('fetching/generating domain cert data for connecting to remote');
    const returnInfo = new types_1.Deferred();
    const { cert, key } = await certificateFor('devcert-domain-cert', [hostname], {
        skipHostsFile: true
    });
    const certData = cert.toString();
    const keyData = key.toString();
    _logOrDebug(logger, 'log', `Connecting to remote host ${hostname} via ssh`);
    // Connect to remote box via ssh.
    const child = execa.shell(
    // @TODO Change this to npx
    `ssh ${hostname} node devcert/bin/devcert.js remote --port=${port} --cert='${JSON.stringify(certData)}' --key='${JSON.stringify(keyData)}'`, {
        detached: false
    });
    // Error handling for missing handles on child process.
    if (!child.stderr) {
        throw new Error('Missing stderr on child process');
    }
    if (!child.stdout) {
        throw new Error('Missing stdout on child process');
    }
    // Throw any error that might have occurred on the remote side.
    child.stderr.on('data', (data) => {
        if (data) {
            const stdErrData = data.toString().trimRight();
            debug(stdErrData);
            if (stdErrData.toLowerCase().includes('error')) {
                debug('Error thrown on the remote side. Closing Remote server');
                remote_utils_1.closeRemoteServer(hostname, port);
                throw new Error(stdErrData);
            }
        }
        else {
            debug('Stderr: {}');
        }
    });
    // Listen to the stdout stream and determine the appropriate steps.
    _logOrDebug(logger, 'log', `Attempting to start the server at port ${port}. This may take a while...`);
    child.stdout.on('data', (data) => {
        if (data) {
            const stdoutData = data.toString().trimRight();
            if (stdoutData.includes(`STATE: READY_FOR_CONNECTION`)) {
                _logOrDebug(logger, 'log', `Connected to remote host ${hostname} via ssh successfully`);
                // Once certs are trusted, close the remote server and cleanup.
                _trustRemoteMachine(hostname, certPath, {
                    port,
                    renewalBufferInBusinessDays,
                    logger
                })
                    .then(mustRenew => {
                    debug(`Certs trusted successfully, the value of mustRenew is ${mustRenew}`);
                    // return the certificate renewal state to the consumer to handle the
                    // renewal usecase.
                    child.kill();
                    debug('child process killed');
                    return { mustRenew };
                })
                    .catch(err => {
                    child.kill();
                    throw new Error(err);
                })
                    .then(returnInfo.resolve)
                    .catch(returnInfo.reject);
            }
            else if (stdoutData.includes('REMOTE_CONNECTION_CLOSED')) {
                _logOrDebug(logger, 'log', 'Remote server closed successfully');
            }
        }
        else {
            debug('stdout: {}');
        }
    });
    return await returnInfo.promise;
}
exports.trustRemoteMachine = trustRemoteMachine;
/**
 * For a given hostname and certpath,gets the certificate from the remote server,
 * stores it at the provided certPath,
 * trusts certificate from remote machine and closes the remote server.
 *
 * @param hostname - hostname of the remote machine
 * @param certPath - file path to store the cert
 * @param param2 - TrustRemoteOptions options
 *
 * @internal
 */
async function _trustRemoteMachine(hostname, certPath, { port = constants_1.DEFAULT_REMOTE_PORT, renewalBufferInBusinessDays = REMAINING_BUSINESS_DAYS_VALIDITY_BEFORE_RENEW, logger, trustCertsOnRemoteFunc = trustCertsOnRemote, closeRemoteFunc = remote_utils_1.closeRemoteServer } = {}) {
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
function untrustMachineByCertificate(certPath) {
    platforms_1.default.removeFromTrustStores(certPath);
}
exports.untrustMachineByCertificate = untrustMachineByCertificate;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInNyYy9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOztBQUVILDJCQU9ZO0FBQ1osK0JBQStCO0FBQy9CLHFDQUFxQztBQUNyQyxtREFBdUQ7QUFDdkQsaUNBQWlDO0FBQ2pDLDJDQVFxQjtBQUNyQiwyQ0FBMEM7QUFDMUMsbUVBR2lDO0FBYS9CLG9CQWRBLGlDQUFTLENBY0E7QUFaWCxpREFHd0I7QUFDeEIscURBQXFEO0FBQ3JELGlEQUF5RTtBQVd2RSwrQkFYTyxtQ0FBb0IsQ0FXUDtBQURwQiw0QkFWNkIsZ0NBQWlCLENBVTdCO0FBVG5CLDJDQUFpQztBQUNqQyx1Q0FBMkM7QUFDM0MsbUNBQTZFO0FBRTdFLDZDQUE2QztBQVE3QyxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUM7QUFFckMsTUFBTSw2Q0FBNkMsR0FBRyxDQUFDLENBQUM7QUErRXhELE1BQU0sb0JBQW9CLEdBQWdCO0lBQ3hDLFlBQVksRUFBRSxHQUFHO0lBQ2pCLGdCQUFnQixFQUFFLEVBQUU7Q0FDckIsQ0FBQztBQTRDSyxLQUFLLFVBQVUsY0FBYyxDQUlsQyxVQUFrQixFQUNsQix5QkFBdUMsRUFDdkMsT0FBVyxFQUNYLGtCQUF1QjtJQUV2QixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMseUJBQXlCLENBQUMsRUFBRTtRQUM1QyxPQUFPLGtCQUFrQixDQUN2QixVQUFVLEVBQ1YseUJBQXlCLEVBQ3pCLE9BQU8sRUFDUCxrQkFBa0IsQ0FDbkIsQ0FBQztLQUNIO1NBQU07UUFDTCxPQUFPLGtCQUFrQixDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLGtCQUFrQixDQUFDLENBQUM7S0FDeEU7QUFDSCxDQUFDO0FBbkJELHdDQW1CQztBQUVELFNBQVMsd0JBQXdCLENBQy9CLEdBQVcsRUFDWCwyQkFBbUM7SUFFbkMsTUFBTSxRQUFRLEdBQUcsY0FB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QUFVLENBQUMsQ0FBQyxDQUFDO0FBQ3pDLENBQUM7QUFGRCxvQ0FFQztBQUVEOzs7O0dBSUc7QUFDSSxLQUFLLFVBQVUseUJBQXlCLENBQzdDLFVBQWtCO0lBRWxCLEtBQUssQ0FBQyxtQ0FBbUMsVUFBVSxFQUFFLENBQUMsQ0FBQztJQUN2RCxNQUFNLGNBQWMsR0FBRyxxQkFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ2pELE1BQU0sY0FBYyxHQUFHLHlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3JELElBQUksZUFBVSxDQUFDLGNBQWMsQ0FBQyxFQUFFO1FBQzlCLEtBQUssQ0FBQywwQkFBMEIsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUM5QyxrQkFBa0I7UUFDbEIsS0FBSyxDQUFDLGlCQUFpQixVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sc0NBQXVCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDMUMsdUJBQXVCO1FBQ3ZCLEtBQUssQ0FDSCw2QkFBNkIsVUFBVSxNQUNyQyxhQUFRLENBQUMsY0FBYyxDQUFDLENBQUMsSUFDM0IsRUFBRSxDQUNILENBQUM7UUFDRixZQUFZLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDekIsS0FBSyxDQUNILDRCQUE0QixVQUFVLE1BQU0sZUFBVSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQ3pFLENBQUM7S0FDSDs7UUFBTSxLQUFLLENBQUMsMEJBQTBCLFVBQVUsRUFBRSxDQUFDLENBQUM7SUFDckQsS0FBSyxDQUFDLDZDQUE2QyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBQ25FLENBQUM7QUF2QkQsOERBdUJDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAcGFja2FnZURvY3VtZW50YXRpb25cbiAqIFV0aWxpdGllcyBmb3Igc2FmZWx5IGdlbmVyYXRpbmcgbG9jYWxseS10cnVzdGVkIGFuZCBtYWNoaW5lLXNwZWNpZmljIFguNTA5IGNlcnRpZmljYXRlcyBmb3IgbG9jYWwgZGV2ZWxvcG1lbnRcbiAqL1xuXG5pbXBvcnQge1xuICByZWFkRmlsZVN5bmMgYXMgcmVhZEZpbGUsXG4gIHJlYWRkaXJTeW5jIGFzIHJlYWRkaXIsXG4gIGV4aXN0c1N5bmMgYXMgZXhpc3RzLFxuICBleGlzdHNTeW5jLFxuICB3cml0ZUZpbGVTeW5jLFxuICBzdGF0U3luY1xufSBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBleGVjYSBmcm9tICdleGVjYSc7XG5pbXBvcnQgKiBhcyBjcmVhdGVEZWJ1ZyBmcm9tICdkZWJ1Zyc7XG5pbXBvcnQgeyBzeW5jIGFzIGNvbW1hbmRFeGlzdHMgfSBmcm9tICdjb21tYW5kLWV4aXN0cyc7XG5pbXBvcnQgKiBhcyByaW1yYWYgZnJvbSAncmltcmFmJztcbmltcG9ydCB7XG4gIGlzTWFjLFxuICBpc0xpbnV4LFxuICBpc1dpbmRvd3MsXG4gIGRvbWFpbnNEaXIsXG4gIHJvb3RDQUtleVBhdGgsXG4gIHJvb3RDQUNlcnRQYXRoLFxuICBERUZBVUxUX1JFTU9URV9QT1JUXG59IGZyb20gJy4vY29uc3RhbnRzJztcbmltcG9ydCBjdXJyZW50UGxhdGZvcm0gZnJvbSAnLi9wbGF0Zm9ybXMnO1xuaW1wb3J0IGluc3RhbGxDZXJ0aWZpY2F0ZUF1dGhvcml0eSwge1xuICBlbnN1cmVDQUNlcnRSZWFkYWJsZSxcbiAgdW5pbnN0YWxsXG59IGZyb20gJy4vY2VydGlmaWNhdGUtYXV0aG9yaXR5JztcbmltcG9ydCB7XG4gIGdlbmVyYXRlRG9tYWluQ2VydGlmaWNhdGUsXG4gIHJldm9rZURvbWFpbkNlcnRpZmljYXRlXG59IGZyb20gJy4vY2VydGlmaWNhdGVzJztcbmltcG9ydCBVSSwgeyBVc2VySW50ZXJmYWNlIH0gZnJvbSAnLi91c2VyLWludGVyZmFjZSc7XG5pbXBvcnQgeyBnZXRSZW1vdGVDZXJ0aWZpY2F0ZSwgY2xvc2VSZW1vdGVTZXJ2ZXIgfSBmcm9tICcuL3JlbW90ZS11dGlscyc7XG5pbXBvcnQgeyBwa2kgfSBmcm9tICdub2RlLWZvcmdlJztcbmltcG9ydCB7IHN1YkJ1c2luZXNzRGF5cyB9IGZyb20gJ2RhdGUtZm5zJztcbmltcG9ydCB7IHBhdGhGb3JEb21haW4sIGtleVBhdGhGb3JEb21haW4sIGNlcnRQYXRoRm9yRG9tYWluIH0gZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgeyBEZWZlcnJlZCB9IGZyb20gJ0BtaWtlLW5vcnRoL3R5cGVzJztcbmV4cG9ydCB7XG4gIHVuaW5zdGFsbCxcbiAgVXNlckludGVyZmFjZSxcbiAgTG9nZ2VyLFxuICBjbG9zZVJlbW90ZVNlcnZlcixcbiAgZ2V0UmVtb3RlQ2VydGlmaWNhdGVcbn07XG5jb25zdCBkZWJ1ZyA9IGNyZWF0ZURlYnVnKCdkZXZjZXJ0Jyk7XG5cbmNvbnN0IFJFTUFJTklOR19CVVNJTkVTU19EQVlTX1ZBTElESVRZX0JFRk9SRV9SRU5FVyA9IDU7XG5cbi8qKlxuICogQ2VydGlmaWNhdGUgb3B0aW9uc1xuICogQHB1YmxpY1xuICovXG5leHBvcnQgaW50ZXJmYWNlIENlcnRPcHRpb25zIHtcbiAgLyoqIE51bWJlciBvZiBkYXlzIGJlZm9yZSB0aGUgQ0EgZXhwaXJlcyAqL1xuICBjYUNlcnRFeHBpcnk6IG51bWJlcjtcbiAgLyoqIE51bWJlciBvZiBkYXlzIGJlZm9yZSB0aGUgZG9tYWluIGNlcnRpZmljYXRlIGV4cGlyZXMgKi9cbiAgZG9tYWluQ2VydEV4cGlyeTogbnVtYmVyO1xufVxuLyoqXG4gKiBDZXJ0IGdlbmVyYXRpb24gb3B0aW9uc1xuICpcbiAqIEBwdWJsaWNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBPcHRpb25zIC8qIGV4dGVuZHMgUGFydGlhbDxJQ2FCdWZmZXJPcHRzICYgSUNhUGF0aE9wdHM+ICAqLyB7XG4gIC8qKiBSZXR1cm4gdGhlIENBIGNlcnRpZmljYXRlIGRhdGE/ICovXG4gIGdldENhQnVmZmVyPzogYm9vbGVhbjtcbiAgLyoqIFJldHVybiB0aGUgcGF0aCB0byB0aGUgQ0EgY2VydGlmaWNhdGU/ICovXG4gIGdldENhUGF0aD86IGJvb2xlYW47XG4gIC8qKiBJZiBgY2VydHV0aWxgIGlzIG5vdCBpbnN0YWxsZWQgYWxyZWFkeSAoZm9yIHVwZGF0aW5nIG5zcyBkYXRhYmFzZXM7IGUuZy4gZmlyZWZveCksIGRvIG5vdCBhdHRlbXB0IHRvIGluc3RhbGwgaXQgKi9cbiAgc2tpcENlcnR1dGlsSW5zdGFsbD86IGJvb2xlYW47XG4gIC8qKiBEbyBub3QgdXBkYXRlIHlvdXIgc3lzdGVtcyBob3N0IGZpbGUgd2l0aCB0aGUgZG9tYWluIG5hbWUgb2YgdGhlIGNlcnRpZmljYXRlICovXG4gIHNraXBIb3N0c0ZpbGU/OiBib29sZWFuO1xuICAvKiogVXNlciBpbnRlcmZhY2UgaG9va3MgKi9cbiAgdWk/OiBVc2VySW50ZXJmYWNlO1xuICAvKiogTnVtYmVyIG9mIGJ1c2luZXNzIGRheXMgYmVmb3JlIGRvbWFpbiBjZXJ0IGV4cGlyeSBiZWZvcmUgYXV0b21hdGljIHJldm9rZSBhbmQgcmVuZXcgKi9cbiAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzPzogbnVtYmVyO1xufVxuLyoqXG4gKiBUaGUgQ0EgcHVibGljIGtleSBhcyBhIGJ1ZmZlclxuICogQHB1YmxpY1xuICovXG5leHBvcnQgaW50ZXJmYWNlIENhQnVmZmVyIHtcbiAgLyoqIENBIHB1YmxpYyBrZXkgKi9cbiAgY2E6IEJ1ZmZlcjtcbn1cbi8qKlxuICogVGhlIGNlcnQgYXV0aG9yaXR5J3MgcGF0aCBvbiBkaXNrXG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ2FQYXRoIHtcbiAgLyoqIENBIGNlcnQgcGF0aCBvbiBkaXNrICovXG4gIGNhUGF0aDogc3RyaW5nO1xufVxuLyoqXG4gKiBEb21haW4gY2VydCBwdWJsaWMgYW5kIHByaXZhdGUga2V5cyBhcyBidWZmZXJzXG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRG9tYWluRGF0YSB7XG4gIC8qKiBwcml2YXRlIGtleSAqL1xuICBrZXk6IEJ1ZmZlcjtcbiAgLyoqIHB1YmxpYyBrZXkgKGNlcnQpICovXG4gIGNlcnQ6IEJ1ZmZlcjtcbn1cbi8qKlxuICogQSByZXR1cm4gdmFsdWUgY29udGFpbmluZyB0aGUgQ0EgcHVibGljIGtleVxuICogQHB1YmxpY1xuICovXG5leHBvcnQgdHlwZSBJUmV0dXJuQ2E8TyBleHRlbmRzIE9wdGlvbnM+ID0gT1snZ2V0Q2FCdWZmZXInXSBleHRlbmRzIHRydWVcbiAgPyBDYUJ1ZmZlclxuICA6IGZhbHNlO1xuLyoqXG4gKiBBIHJldHVybiB2YWx1ZSBjb250YWluaW5nIHRoZSBDQSBwYXRoIG9uIGRpc2tcbiAqIEBwdWJsaWNcbiAqL1xuZXhwb3J0IHR5cGUgSVJldHVybkNhUGF0aDxPIGV4dGVuZHMgT3B0aW9ucz4gPSBPWydnZXRDYVBhdGgnXSBleHRlbmRzIHRydWVcbiAgPyBDYVBhdGhcbiAgOiBmYWxzZTtcbi8qKlxuICogQSByZXR1cm4gdmFsdWUgY29udGFpbmluZyB0aGUgQ0EgcHVibGljIGtleSwgQ0EgcGF0aCBvbiBkaXNrLCBhbmQgZG9tYWluIGNlcnQgaW5mb1xuICogQHB1YmxpY1xuICovXG5leHBvcnQgdHlwZSBJUmV0dXJuRGF0YTxPIGV4dGVuZHMgT3B0aW9ucyA9IHt9PiA9IERvbWFpbkRhdGEgJlxuICBJUmV0dXJuQ2E8Tz4gJlxuICBJUmV0dXJuQ2FQYXRoPE8+O1xuXG5jb25zdCBERUZBVUxUX0NFUlRfT1BUSU9OUzogQ2VydE9wdGlvbnMgPSB7XG4gIGNhQ2VydEV4cGlyeTogMTgwLFxuICBkb21haW5DZXJ0RXhwaXJ5OiAzMFxufTtcblxuLyoqXG4gKiBSZXF1ZXN0IGFuIFNTTCBjZXJ0aWZpY2F0ZSBmb3IgdGhlIGdpdmVuIGFwcCBuYW1lIHNpZ25lZCBieSB0aGUgZGV2Y2VydCByb290XG4gKiBjZXJ0aWZpY2F0ZSBhdXRob3JpdHkuIElmIGRldmNlcnQgaGFzIHByZXZpb3VzbHkgZ2VuZXJhdGVkIGEgY2VydGlmaWNhdGUgZm9yXG4gKiB0aGF0IGFwcCBuYW1lIG9uIHRoaXMgbWFjaGluZSwgaXQgd2lsbCByZXVzZSB0aGF0IGNlcnRpZmljYXRlLlxuICpcbiAqIElmIHRoaXMgaXMgdGhlIGZpcnN0IHRpbWUgZGV2Y2VydCBpcyBiZWluZyBydW4gb24gdGhpcyBtYWNoaW5lLCBpdCB3aWxsXG4gKiBnZW5lcmF0ZSBhbmQgYXR0ZW1wdCB0byBpbnN0YWxsIGEgcm9vdCBjZXJ0aWZpY2F0ZSBhdXRob3JpdHkuXG4gKlxuICogSWYgYG9wdGlvbnMuZ2V0Q2FCdWZmZXJgIGlzIHRydWUsIHJldHVybiB2YWx1ZSB3aWxsIGluY2x1ZGUgdGhlIGNhIGNlcnRpZmljYXRlIGRhdGFcbiAqIGFzIFxceyBjYTogQnVmZmVyIFxcfVxuICpcbiAqIElmIGBvcHRpb25zLmdldENhUGF0aGAgaXMgdHJ1ZSwgcmV0dXJuIHZhbHVlIHdpbGwgaW5jbHVkZSB0aGUgY2EgY2VydGlmaWNhdGUgcGF0aFxuICogYXMgXFx7IGNhUGF0aDogc3RyaW5nIFxcfVxuICpcbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSBjb21tb25OYW1lIC0gY29tbW9uIG5hbWUgZm9yIGNlcnRpZmljYXRlXG4gKiBAcGFyYW0gYWx0ZXJuYXRpdmVOYW1lcyAtIGFsdGVybmF0ZSBuYW1lcyBmb3IgdGhlIGNlcnRpZmljYXRlXG4gKiBAcGFyYW0gb3B0aW9ucyAtIGNlcnQgZ2VuZXJhdGlvbiBvcHRpb25zXG4gKiBAcGFyYW0gcGFydGlhbENlcnRPcHRpb25zIC0gY2VydGlmaWNhdGUgb3B0aW9uc1xuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2VydGlmaWNhdGVGb3I8XG4gIE8gZXh0ZW5kcyBPcHRpb25zLFxuICBDTyBleHRlbmRzIFBhcnRpYWw8Q2VydE9wdGlvbnM+XG4+KFxuICBjb21tb25OYW1lOiBzdHJpbmcsXG4gIGFsdGVybmF0aXZlTmFtZXM6IHN0cmluZ1tdLFxuICBvcHRpb25zPzogTyxcbiAgcGFydGlhbENlcnRPcHRpb25zPzogQ09cbik6IFByb21pc2U8SVJldHVybkRhdGE8Tz4+O1xuXG4vKipcbiAqIHtAaW5oZXJpdGRvYyAoY2VydGlmaWNhdGVGb3I6MSl9XG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjZXJ0aWZpY2F0ZUZvcjxcbiAgTyBleHRlbmRzIE9wdGlvbnMsXG4gIENPIGV4dGVuZHMgUGFydGlhbDxDZXJ0T3B0aW9ucz5cbj4oXG4gIGNvbW1vbk5hbWU6IHN0cmluZyxcbiAgb3B0aW9ucz86IE8sXG4gIHBhcnRpYWxDZXJ0T3B0aW9ucz86IENPXG4pOiBQcm9taXNlPElSZXR1cm5EYXRhPE8+PjtcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjZXJ0aWZpY2F0ZUZvcjxcbiAgTyBleHRlbmRzIE9wdGlvbnMsXG4gIENPIGV4dGVuZHMgUGFydGlhbDxDZXJ0T3B0aW9ucz5cbj4oXG4gIGNvbW1vbk5hbWU6IHN0cmluZyxcbiAgb3B0aW9uc09yQWx0ZXJuYXRpdmVOYW1lczogc3RyaW5nW10gfCBPLFxuICBvcHRpb25zPzogTyxcbiAgcGFydGlhbENlcnRPcHRpb25zPzogQ09cbik6IFByb21pc2U8SVJldHVybkRhdGE8Tz4+IHtcbiAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9uc09yQWx0ZXJuYXRpdmVOYW1lcykpIHtcbiAgICByZXR1cm4gY2VydGlmaWNhdGVGb3JJbXBsKFxuICAgICAgY29tbW9uTmFtZSxcbiAgICAgIG9wdGlvbnNPckFsdGVybmF0aXZlTmFtZXMsXG4gICAgICBvcHRpb25zLFxuICAgICAgcGFydGlhbENlcnRPcHRpb25zXG4gICAgKTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gY2VydGlmaWNhdGVGb3JJbXBsKGNvbW1vbk5hbWUsIFtdLCBvcHRpb25zLCBwYXJ0aWFsQ2VydE9wdGlvbnMpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldEV4cGlyZUFuZFJlbmV3YWxEYXRlcyhcbiAgY3J0OiBzdHJpbmcsXG4gIHJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5czogbnVtYmVyXG4pOiB7IGV4cGlyZUF0OiBEYXRlOyByZW5ld0J5OiBEYXRlIH0ge1xuICBjb25zdCBleHBpcmVBdCA9IF9nZXRFeHBpcmVEYXRlKGNydCk7XG4gIGNvbnN0IHJlbmV3QnkgPSBzdWJCdXNpbmVzc0RheXMoZXhwaXJlQXQsIHJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5cyk7XG4gIHJldHVybiB7IGV4cGlyZUF0LCByZW5ld0J5IH07XG59XG5cbmZ1bmN0aW9uIGdldENlcnRQb3J0aW9uT2ZQZW1TdHJpbmcoY3J0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBiZWdpblN0ciA9ICctLS0tLUJFR0lOIENFUlRJRklDQVRFLS0tLS0nO1xuICBjb25zdCBlbmRTdHIgPSAnLS0tLS1FTkQgQ0VSVElGSUNBVEUtLS0tLSc7XG4gIGNvbnN0IGJlZ2luID0gY3J0LmluZGV4T2YoYmVnaW5TdHIpO1xuICBjb25zdCBlbmQgPSBjcnQuaW5kZXhPZihlbmRTdHIpO1xuICBpZiAoYmVnaW4gPCAwIHx8IGVuZCA8IDApXG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYEltcHJvcGVybHkgZm9ybWF0dGVkIFBFTSBmaWxlLiBFeHBlY3RlZCB0byBmaW5kICR7YmVnaW5TdHJ9IGFuZCAke2VuZFN0cn1cblwiJHtjcnR9XCJgXG4gICAgKTtcblxuICBjb25zdCBjZXJ0Q29udGVudCA9IGNydC5zdWJzdHIoYmVnaW4sIGVuZCAtIGJlZ2luICsgZW5kU3RyLmxlbmd0aCk7XG4gIHJldHVybiBjZXJ0Q29udGVudDtcbn1cblxuZnVuY3Rpb24gX2dldEV4cGlyZURhdGUoY3J0OiBzdHJpbmcpOiBEYXRlIHtcbiAgY29uc3QgY2VydEluZm8gPSBwa2kuY2VydGlmaWNhdGVGcm9tUGVtKGNydCk7XG4gIGNvbnN0IHsgbm90QWZ0ZXIgfSA9IGNlcnRJbmZvLnZhbGlkaXR5O1xuICByZXR1cm4gbm90QWZ0ZXI7XG59XG5cbmZ1bmN0aW9uIHNob3VsZFJlbmV3KFxuICBjcnQ6IHN0cmluZyxcbiAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzOiBudW1iZXJcbik6IGJvb2xlYW4ge1xuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICBjb25zdCB7IGV4cGlyZUF0LCByZW5ld0J5IH0gPSBnZXRFeHBpcmVBbmRSZW5ld2FsRGF0ZXMoXG4gICAgY3J0LFxuICAgIHJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5c1xuICApO1xuICBkZWJ1ZyhcbiAgICBgZXZhbHVhdGluZyBjZXJ0IHJlbmV3YWxcXG4tIG5vdzpcXHQke25vdy50b0RhdGVTdHJpbmcoKX1cXG4tIHJlbmV3IGF0OlxcdCR7cmVuZXdCeS50b0RhdGVTdHJpbmcoKX1cXG4tIGV4cGlyZSBhdDpcXHQke2V4cGlyZUF0LnRvRGF0ZVN0cmluZygpfWBcbiAgKTtcbiAgcmV0dXJuIG5vdy52YWx1ZU9mKCkgPj0gcmVuZXdCeS52YWx1ZU9mKCk7XG59XG5cbi8qKlxuICogR2V0IHRoZSBleHBpcmF0aW9uIGFuZCByZWNvbW1lbmRlZCByZW5ld2FsIGRhdGVzLCBmb3IgdGhlIGxhdGVzdCBpc3N1ZWRcbiAqIGNlcnQgZm9yIGEgZ2l2ZW4gY29tbW9uX25hbWVcbiAqXG4gKiBAYWxwaGFcbiAqIEBwYXJhbSBjb21tb25OYW1lIC0gY29tbW9uX25hbWUgb2YgY2VydCB3aG9zZSBleHBpcmF0aW9uIGluZm8gaXMgZGVzaXJlZFxuICogQHBhcmFtIHJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5cyAtIG51bWJlciBvZiBidXNpbmVzcyBkYXlzIGJlZm9yZSBjZXJ0IGV4cGlyYXRpb24sIHRvIHN0YXJ0IGluZGljYXRpbmcgdGhhdCBpdCBzaG91bGQgYmUgcmVuZXdlZFxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2VydEV4cGlyYXRpb25JbmZvKFxuICBjb21tb25OYW1lOiBzdHJpbmcsXG4gIHJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5cyA9IFJFTUFJTklOR19CVVNJTkVTU19EQVlTX1ZBTElESVRZX0JFRk9SRV9SRU5FV1xuKTogeyBtdXN0UmVuZXc6IGJvb2xlYW47IHJlbmV3Qnk6IERhdGU7IGV4cGlyZUF0OiBEYXRlIH0ge1xuICBjb25zdCBkb21haW5DZXJ0UGF0aCA9IHBhdGhGb3JEb21haW4oY29tbW9uTmFtZSwgYGNlcnRpZmljYXRlLmNydGApO1xuICBpZiAoIWV4aXN0cyhkb21haW5DZXJ0UGF0aCkpXG4gICAgdGhyb3cgbmV3IEVycm9yKGBjZXJ0IGZvciAke2NvbW1vbk5hbWV9IHdhcyBub3QgZm91bmRgKTtcbiAgY29uc3QgZG9tYWluQ2VydCA9IHJlYWRGaWxlKGRvbWFpbkNlcnRQYXRoKS50b1N0cmluZygpO1xuICBpZiAoIWRvbWFpbkNlcnQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIGNlcnRpZmljYXRlIGZvciAke2NvbW1vbk5hbWV9IGV4aXN0c2ApO1xuICB9XG4gIGNvbnN0IGNydCA9IGdldENlcnRQb3J0aW9uT2ZQZW1TdHJpbmcoZG9tYWluQ2VydCk7XG4gIGNvbnN0IHsgZXhwaXJlQXQsIHJlbmV3QnkgfSA9IGdldEV4cGlyZUFuZFJlbmV3YWxEYXRlcyhcbiAgICBjcnQsXG4gICAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzXG4gICk7XG4gIGNvbnN0IG11c3RSZW5ldyA9IHNob3VsZFJlbmV3KGNydCwgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzKTtcbiAgcmV0dXJuIHsgbXVzdFJlbmV3LCBleHBpcmVBdCwgcmVuZXdCeSB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBjZXJ0aWZpY2F0ZUZvckltcGw8XG4gIE8gZXh0ZW5kcyBPcHRpb25zLFxuICBDTyBleHRlbmRzIFBhcnRpYWw8Q2VydE9wdGlvbnM+XG4+KFxuICBjb21tb25OYW1lOiBzdHJpbmcsXG4gIGFsdGVybmF0aXZlTmFtZXM6IHN0cmluZ1tdLFxuICBvcHRpb25zOiBPID0ge30gYXMgTyxcbiAgcGFydGlhbENlcnRPcHRpb25zOiBDTyA9IHt9IGFzIENPXG4pOiBQcm9taXNlPElSZXR1cm5EYXRhPE8+PiB7XG4gIGRlYnVnKFxuICAgIGBDZXJ0aWZpY2F0ZSByZXF1ZXN0ZWQgZm9yICR7Y29tbW9uTmFtZX0uIFNraXBwaW5nIGNlcnR1dGlsIGluc3RhbGw6ICR7Qm9vbGVhbihcbiAgICAgIG9wdGlvbnMuc2tpcENlcnR1dGlsSW5zdGFsbFxuICAgICl9LiBTa2lwcGluZyBob3N0cyBmaWxlOiAke0Jvb2xlYW4ob3B0aW9ucy5za2lwSG9zdHNGaWxlKX1gXG4gICk7XG4gIGNvbnN0IGNlcnRPcHRpb25zOiBDZXJ0T3B0aW9ucyA9IHtcbiAgICAuLi5ERUZBVUxUX0NFUlRfT1BUSU9OUyxcbiAgICAuLi5wYXJ0aWFsQ2VydE9wdGlvbnNcbiAgfTtcbiAgaWYgKG9wdGlvbnMudWkpIHtcbiAgICBPYmplY3QuYXNzaWduKFVJLCBvcHRpb25zLnVpKTtcbiAgfVxuXG4gIGlmICghaXNNYWMgJiYgIWlzTGludXggJiYgIWlzV2luZG93cykge1xuICAgIHRocm93IG5ldyBFcnJvcihgUGxhdGZvcm0gbm90IHN1cHBvcnRlZDogXCIke3Byb2Nlc3MucGxhdGZvcm19XCJgKTtcbiAgfVxuXG4gIGlmICghY29tbWFuZEV4aXN0cygnb3BlbnNzbCcpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgJ09wZW5TU0wgbm90IGZvdW5kOiBPcGVuU1NMIGlzIHJlcXVpcmVkIHRvIGdlbmVyYXRlIFNTTCBjZXJ0aWZpY2F0ZXMgLSBtYWtlIHN1cmUgaXQgaXMgaW5zdGFsbGVkIGFuZCBhdmFpbGFibGUgaW4geW91ciBQQVRIJ1xuICAgICk7XG4gIH1cblxuICBjb25zdCBkb21haW5LZXlQYXRoID0ga2V5UGF0aEZvckRvbWFpbihjb21tb25OYW1lKTtcbiAgY29uc3QgZG9tYWluQ2VydFBhdGggPSBjZXJ0UGF0aEZvckRvbWFpbihjb21tb25OYW1lKTtcblxuICBpZiAoIWV4aXN0cyhyb290Q0FLZXlQYXRoKSkge1xuICAgIGRlYnVnKFxuICAgICAgJ1Jvb3QgQ0EgaXMgbm90IGluc3RhbGxlZCB5ZXQsIHNvIGl0IG11c3QgYmUgb3VyIGZpcnN0IHJ1bi4gSW5zdGFsbGluZyByb290IENBIC4uLidcbiAgICApO1xuICAgIGF3YWl0IGluc3RhbGxDZXJ0aWZpY2F0ZUF1dGhvcml0eShvcHRpb25zLCBjZXJ0T3B0aW9ucyk7XG4gIH0gZWxzZSBpZiAob3B0aW9ucy5nZXRDYUJ1ZmZlciB8fCBvcHRpb25zLmdldENhUGF0aCkge1xuICAgIGRlYnVnKFxuICAgICAgJ1Jvb3QgQ0EgaXMgbm90IHJlYWRhYmxlLCBidXQgaXQgcHJvYmFibHkgaXMgYmVjYXVzZSBhbiBlYXJsaWVyIHZlcnNpb24gb2YgZGV2Y2VydCBsb2NrZWQgaXQuIFRyeWluZyB0byBmaXguLi4nXG4gICAgKTtcbiAgICBhd2FpdCBlbnN1cmVDQUNlcnRSZWFkYWJsZShvcHRpb25zLCBjZXJ0T3B0aW9ucyk7XG4gIH1cblxuICBpZiAoIWV4aXN0cyhkb21haW5DZXJ0UGF0aCkpIHtcbiAgICBkZWJ1ZyhcbiAgICAgIGBDYW4ndCBmaW5kIGNlcnRpZmljYXRlIGZpbGUgZm9yICR7Y29tbW9uTmFtZX0sIHNvIGl0IG11c3QgYmUgdGhlIGZpcnN0IHJlcXVlc3QgZm9yICR7Y29tbW9uTmFtZX0uIEdlbmVyYXRpbmcgYW5kIGNhY2hpbmcgLi4uYFxuICAgICk7XG4gICAgYXdhaXQgZ2VuZXJhdGVEb21haW5DZXJ0aWZpY2F0ZShjb21tb25OYW1lLCBhbHRlcm5hdGl2ZU5hbWVzLCBjZXJ0T3B0aW9ucyk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgY2VydENvbnRlbnRzID0gZ2V0Q2VydFBvcnRpb25PZlBlbVN0cmluZyhcbiAgICAgIHJlYWRGaWxlKGRvbWFpbkNlcnRQYXRoKS50b1N0cmluZygpXG4gICAgKTtcbiAgICBjb25zdCBleHBpcmVEYXRlID0gX2dldEV4cGlyZURhdGUoY2VydENvbnRlbnRzKTtcbiAgICBpZiAoXG4gICAgICBzaG91bGRSZW5ldyhcbiAgICAgICAgY2VydENvbnRlbnRzLFxuICAgICAgICBvcHRpb25zLnJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5cyA/P1xuICAgICAgICAgIFJFTUFJTklOR19CVVNJTkVTU19EQVlTX1ZBTElESVRZX0JFRk9SRV9SRU5FV1xuICAgICAgKVxuICAgICkge1xuICAgICAgZGVidWcoXG4gICAgICAgIGBDZXJ0aWZpY2F0ZSBmb3IgJHtjb21tb25OYW1lfSB3YXMgY2xvc2UgdG8gZXhwaXJpbmcgKG9uICR7ZXhwaXJlRGF0ZS50b0RhdGVTdHJpbmcoKX0pLiBBIGZyZXNoIGNlcnRpZmljYXRlIHdpbGwgYmUgZ2VuZXJhdGVkIGZvciB5b3VgXG4gICAgICApO1xuICAgICAgYXdhaXQgcmVtb3ZlQW5kUmV2b2tlRG9tYWluQ2VydChjb21tb25OYW1lKTtcbiAgICAgIGF3YWl0IGdlbmVyYXRlRG9tYWluQ2VydGlmaWNhdGUoXG4gICAgICAgIGNvbW1vbk5hbWUsXG4gICAgICAgIGFsdGVybmF0aXZlTmFtZXMsXG4gICAgICAgIGNlcnRPcHRpb25zXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1ZyhcbiAgICAgICAgYENlcnRpZmljYXRlIGZvciAke2NvbW1vbk5hbWV9IHdhcyBub3QgY2xvc2UgdG8gZXhwaXJpbmcgKG9uICR7ZXhwaXJlRGF0ZS50b0RhdGVTdHJpbmcoKX0pLmBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFvcHRpb25zLnNraXBIb3N0c0ZpbGUpIHtcbiAgICBhd2FpdCBjdXJyZW50UGxhdGZvcm0uYWRkRG9tYWluVG9Ib3N0RmlsZUlmTWlzc2luZyhjb21tb25OYW1lKTtcbiAgfVxuXG4gIGRlYnVnKGBSZXR1cm5pbmcgZG9tYWluIGNlcnRpZmljYXRlYCk7XG5cbiAgY29uc3QgcmV0ID0ge1xuICAgIGtleTogcmVhZEZpbGUoZG9tYWluS2V5UGF0aCksXG4gICAgY2VydDogcmVhZEZpbGUoZG9tYWluQ2VydFBhdGgpXG4gIH0gYXMgSVJldHVybkRhdGE8Tz47XG4gIGlmIChvcHRpb25zLmdldENhQnVmZmVyKVxuICAgICgocmV0IGFzIHVua25vd24pIGFzIENhQnVmZmVyKS5jYSA9IHJlYWRGaWxlKHJvb3RDQUNlcnRQYXRoKTtcbiAgaWYgKG9wdGlvbnMuZ2V0Q2FQYXRoKSAoKHJldCBhcyB1bmtub3duKSBhcyBDYVBhdGgpLmNhUGF0aCA9IHJvb3RDQUNlcnRQYXRoO1xuXG4gIHJldHVybiByZXQ7XG59XG5cbmZ1bmN0aW9uIF9sb2dPckRlYnVnKFxuICBsb2dnZXI6IExvZ2dlciB8IHVuZGVmaW5lZCxcbiAgdHlwZTogJ2xvZycgfCAnd2FybicgfCAnZXJyb3InLFxuICBtZXNzYWdlOiBzdHJpbmdcbik6IHZvaWQge1xuICBpZiAobG9nZ2VyICYmIHR5cGUpIHtcbiAgICBsb2dnZXJbdHlwZV0obWVzc2FnZSk7XG4gIH0gZWxzZSB7XG4gICAgZGVidWcobWVzc2FnZSk7XG4gIH1cbn1cbi8qKlxuICogUmVtb3RlIGNlcnRpZmljYXRlIHRydXN0IG9wdGlvbnNcbiAqXG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgVHJ1c3RSZW1vdGVPcHRpb25zIHtcbiAgLyoqXG4gICAqIHBvcnQgbnVtYmVyIGZvciB0aGUgcmVtb3RlIHNlcnZlci5cbiAgICovXG4gIHBvcnQ6IG51bWJlcjtcbiAgLyoqXG4gICAqIHJlbWFpbmluZyBidXNpbmVzcyBkYXlzIHZhbGlkaXR5LlxuICAgKi9cbiAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzOiBudW1iZXI7XG4gIC8qKlxuICAgKiBMb2dnZXIgaW50ZXJmYWNlIHRvIHN1cHBwb3J0IGxvZ2dpbmcgbWVjaGFuaXNtIG9uIHRoZSBvbnN1bWVyIHNpZGUuXG4gICAqL1xuICBsb2dnZXI/OiBMb2dnZXI7XG4gIC8qKlxuICAgKiBmdW5jdGlvbiB0byB0cnVzdCBjZXJ0cyBvbiByZW1vdGUuXG4gICAqL1xuICB0cnVzdENlcnRzT25SZW1vdGVGdW5jOiB0eXBlb2YgdHJ1c3RDZXJ0c09uUmVtb3RlO1xuICAvKipcbiAgICogZnVuY3Rpb24gdG8gY2xvc2UgdGhlIHJlbW90ZSBzZXJ2ZXIuXG4gICAqL1xuICBjbG9zZVJlbW90ZUZ1bmM6IHR5cGVvZiBjbG9zZVJlbW90ZVNlcnZlcjtcbn1cblxuLyoqXG4gKiBUcnVzdCB0aGUgY2VydGlmaWNhdGUgZm9yIGEgZ2l2ZW4gaG9zdG5hbWUgYW5kIHBvcnQgYW5kIGFkZFxuICogdGhlIHJldHVybmVkIGNlcnQgdG8gdGhlIGxvY2FsIHRydXN0IHN0b3JlLlxuICogQHBhcmFtIGhvc3RuYW1lIC0gaG9zdG5hbWUgb2YgdGhlIHJlbW90ZSBtYWNoaW5lXG4gKiBAcGFyYW0gcG9ydCAtIHBvcnQgdG8gY29ubmVjdCB0aGUgcmVtb3RlIG1hY2hpbmVcbiAqIEBwYXJhbSBjZXJ0UGF0aCAtIGZpbGUgcGF0aCB0byBzdG9yZSB0aGUgY2VydFxuICpcbiAqIEBwdWJsaWNcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRydXN0Q2VydHNPblJlbW90ZShcbiAgaG9zdG5hbWU6IHN0cmluZyxcbiAgcG9ydDogbnVtYmVyLFxuICBjZXJ0UGF0aDogc3RyaW5nLFxuICByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXM6IG51bWJlcixcbiAgZ2V0UmVtb3RlQ2VydHNGdW5jID0gZ2V0UmVtb3RlQ2VydGlmaWNhdGUsXG4gIGNsb3NlUmVtb3RlRnVuYyA9IGNsb3NlUmVtb3RlU2VydmVyXG4pOiBQcm9taXNlPHsgbXVzdFJlbmV3OiBib29sZWFuIH0+IHtcbiAgLy8gR2V0IHRoZSByZW1vdGUgY2VydGlmaWNhdGUgZnJvbSB0aGUgc2VydmVyXG4gIHRyeSB7XG4gICAgZGVidWcoJ2dldHRpbmcgY2VydCBmcm9tIHJlbW90ZSBtYWNoaW5lJyk7XG4gICAgY29uc3QgY2VydERhdGEgPSBhd2FpdCBnZXRSZW1vdGVDZXJ0c0Z1bmMoaG9zdG5hbWUsIHBvcnQpO1xuICAgIGNvbnN0IG11c3RSZW5ldyA9IHNob3VsZFJlbmV3KGNlcnREYXRhLCByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXMpO1xuICAgIGRlYnVnKGB3cml0aW5nIHRoZSBjZXJ0aWZpY2F0ZSBkYXRhIG9udG8gbG9jYWwgZmlsZSBwYXRoOiAke2NlcnRQYXRofWApO1xuICAgIC8vIFdyaXRlIHRoZSBjZXJ0aWZpY2F0ZSBkYXRhIG9uIHRoaXMgZmlsZS5cbiAgICB3cml0ZUZpbGVTeW5jKGNlcnRQYXRoLCBjZXJ0RGF0YSk7XG5cbiAgICAvLyBUcnVzdCB0aGUgcmVtb3RlIGNlcnQgb24geW91ciBsb2NhbCBib3hcbiAgICBhd2FpdCBjdXJyZW50UGxhdGZvcm0uYWRkVG9UcnVzdFN0b3JlcyhjZXJ0UGF0aCk7XG4gICAgZGVidWcoJ0NlcnRpZmljYXRlIHRydXN0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgcmV0dXJuIHsgbXVzdFJlbmV3IH07XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGNsb3NlUmVtb3RlRnVuYyhob3N0bmFtZSwgcG9ydCk7XG4gICAgdGhyb3cgbmV3IEVycm9yKGVycik7XG4gIH1cbn1cbi8qKlxuICogVHJ1c3QgdGhlIHJlbW90ZSBob3N0cydzIGNlcnRpZmljYXRlIG9uIGxvY2FsIG1hY2hpbmUuXG4gKiBUaGlzIGZ1bmN0aW9uIHdvdWxkIHNzaCBpbnRvIHRoZSByZW1vdGUgaG9zdCwgZ2V0IHRoZSBjZXJ0aWZpY2F0ZVxuICogYW5kIHRydXN0IHRoZSBsb2NhbCBtYWNoaW5lIGZyb20gd2hlcmUgdGhpcyBmdW5jdGlvbiBpcyBnZXR0aW5nIGNhbGxlZCBmcm9tLlxuICogQHB1YmxpY1xuICogQHBhcmFtIGhvc3RuYW1lIC0gaG9zdG5hbWUgb2YgdGhlIHJlbW90ZSBtYWNoaW5lXG4gKiBAcGFyYW0gY2VydFBhdGggLSBmaWxlIHBhdGggdG8gc3RvcmUgdGhlIGNlcnRcbiAqIEBwYXJhbSBwYXJhbTIgLSBUcnVzdFJlbW90ZU9wdGlvbnMgb3B0aW9uc1xuICovXG4vLyBjaGVjayBmb3IgbXVsdGlwbGUgaW52b2NhdGlvbnMgZm9yIHJlYWR5IGZvciBjb25uZWN0aW9uXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdHJ1c3RSZW1vdGVNYWNoaW5lKFxuICBob3N0bmFtZTogc3RyaW5nLFxuICBjZXJ0UGF0aDogc3RyaW5nLFxuICB7XG4gICAgcG9ydCA9IERFRkFVTFRfUkVNT1RFX1BPUlQsXG4gICAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzID0gUkVNQUlOSU5HX0JVU0lORVNTX0RBWVNfVkFMSURJVFlfQkVGT1JFX1JFTkVXLFxuICAgIGxvZ2dlclxuICB9OiBQYXJ0aWFsPFRydXN0UmVtb3RlT3B0aW9ucz4gPSB7fVxuKTogUHJvbWlzZTx7IG11c3RSZW5ldzogYm9vbGVhbiB9PiB7XG4gIGRlYnVnKCdmZXRjaGluZy9nZW5lcmF0aW5nIGRvbWFpbiBjZXJ0IGRhdGEgZm9yIGNvbm5lY3RpbmcgdG8gcmVtb3RlJyk7XG4gIGNvbnN0IHJldHVybkluZm8gPSBuZXcgRGVmZXJyZWQ8eyBtdXN0UmVuZXc6IGJvb2xlYW4gfT4oKTtcbiAgY29uc3QgeyBjZXJ0LCBrZXkgfSA9IGF3YWl0IGNlcnRpZmljYXRlRm9yKFxuICAgICdkZXZjZXJ0LWRvbWFpbi1jZXJ0JyxcbiAgICBbaG9zdG5hbWVdLFxuICAgIHtcbiAgICAgIHNraXBIb3N0c0ZpbGU6IHRydWVcbiAgICB9XG4gICk7XG4gIGNvbnN0IGNlcnREYXRhID0gY2VydC50b1N0cmluZygpO1xuICBjb25zdCBrZXlEYXRhID0ga2V5LnRvU3RyaW5nKCk7XG4gIF9sb2dPckRlYnVnKGxvZ2dlciwgJ2xvZycsIGBDb25uZWN0aW5nIHRvIHJlbW90ZSBob3N0ICR7aG9zdG5hbWV9IHZpYSBzc2hgKTtcbiAgLy8gQ29ubmVjdCB0byByZW1vdGUgYm94IHZpYSBzc2guXG4gIGNvbnN0IGNoaWxkID0gZXhlY2Euc2hlbGwoXG4gICAgLy8gQFRPRE8gQ2hhbmdlIHRoaXMgdG8gbnB4XG4gICAgYHNzaCAke2hvc3RuYW1lfSBub2RlIGRldmNlcnQvYmluL2RldmNlcnQuanMgcmVtb3RlIC0tcG9ydD0ke3BvcnR9IC0tY2VydD0nJHtKU09OLnN0cmluZ2lmeShcbiAgICAgIGNlcnREYXRhXG4gICAgKX0nIC0ta2V5PScke0pTT04uc3RyaW5naWZ5KGtleURhdGEpfSdgLFxuICAgIHtcbiAgICAgIGRldGFjaGVkOiBmYWxzZVxuICAgIH1cbiAgKTtcblxuICAvLyBFcnJvciBoYW5kbGluZyBmb3IgbWlzc2luZyBoYW5kbGVzIG9uIGNoaWxkIHByb2Nlc3MuXG4gIGlmICghY2hpbGQuc3RkZXJyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHN0ZGVyciBvbiBjaGlsZCBwcm9jZXNzJyk7XG4gIH1cbiAgaWYgKCFjaGlsZC5zdGRvdXQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ01pc3Npbmcgc3Rkb3V0IG9uIGNoaWxkIHByb2Nlc3MnKTtcbiAgfVxuXG4gIC8vIFRocm93IGFueSBlcnJvciB0aGF0IG1pZ2h0IGhhdmUgb2NjdXJyZWQgb24gdGhlIHJlbW90ZSBzaWRlLlxuICBjaGlsZC5zdGRlcnIub24oJ2RhdGEnLCAoZGF0YTogZXhlY2EuU3RkSU9PcHRpb24pID0+IHtcbiAgICBpZiAoZGF0YSkge1xuICAgICAgY29uc3Qgc3RkRXJyRGF0YSA9IGRhdGEudG9TdHJpbmcoKS50cmltUmlnaHQoKTtcbiAgICAgIGRlYnVnKHN0ZEVyckRhdGEpO1xuICAgICAgaWYgKHN0ZEVyckRhdGEudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZXJyb3InKSkge1xuICAgICAgICBkZWJ1ZygnRXJyb3IgdGhyb3duIG9uIHRoZSByZW1vdGUgc2lkZS4gQ2xvc2luZyBSZW1vdGUgc2VydmVyJyk7XG4gICAgICAgIGNsb3NlUmVtb3RlU2VydmVyKGhvc3RuYW1lLCBwb3J0KTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKHN0ZEVyckRhdGEpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1ZygnU3RkZXJyOiB7fScpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gTGlzdGVuIHRvIHRoZSBzdGRvdXQgc3RyZWFtIGFuZCBkZXRlcm1pbmUgdGhlIGFwcHJvcHJpYXRlIHN0ZXBzLlxuICBfbG9nT3JEZWJ1ZyhcbiAgICBsb2dnZXIsXG4gICAgJ2xvZycsXG4gICAgYEF0dGVtcHRpbmcgdG8gc3RhcnQgdGhlIHNlcnZlciBhdCBwb3J0ICR7cG9ydH0uIFRoaXMgbWF5IHRha2UgYSB3aGlsZS4uLmBcbiAgKTtcbiAgY2hpbGQuc3Rkb3V0Lm9uKCdkYXRhJywgKGRhdGE6IGV4ZWNhLlN0ZElPT3B0aW9uKSA9PiB7XG4gICAgaWYgKGRhdGEpIHtcbiAgICAgIGNvbnN0IHN0ZG91dERhdGEgPSBkYXRhLnRvU3RyaW5nKCkudHJpbVJpZ2h0KCk7XG4gICAgICBpZiAoc3Rkb3V0RGF0YS5pbmNsdWRlcyhgU1RBVEU6IFJFQURZX0ZPUl9DT05ORUNUSU9OYCkpIHtcbiAgICAgICAgX2xvZ09yRGVidWcoXG4gICAgICAgICAgbG9nZ2VyLFxuICAgICAgICAgICdsb2cnLFxuICAgICAgICAgIGBDb25uZWN0ZWQgdG8gcmVtb3RlIGhvc3QgJHtob3N0bmFtZX0gdmlhIHNzaCBzdWNjZXNzZnVsbHlgXG4gICAgICAgICk7XG4gICAgICAgIC8vIE9uY2UgY2VydHMgYXJlIHRydXN0ZWQsIGNsb3NlIHRoZSByZW1vdGUgc2VydmVyIGFuZCBjbGVhbnVwLlxuICAgICAgICBfdHJ1c3RSZW1vdGVNYWNoaW5lKGhvc3RuYW1lLCBjZXJ0UGF0aCwge1xuICAgICAgICAgIHBvcnQsXG4gICAgICAgICAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzLFxuICAgICAgICAgIGxvZ2dlclxuICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKG11c3RSZW5ldyA9PiB7XG4gICAgICAgICAgICBkZWJ1ZyhcbiAgICAgICAgICAgICAgYENlcnRzIHRydXN0ZWQgc3VjY2Vzc2Z1bGx5LCB0aGUgdmFsdWUgb2YgbXVzdFJlbmV3IGlzICR7bXVzdFJlbmV3fWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICAvLyByZXR1cm4gdGhlIGNlcnRpZmljYXRlIHJlbmV3YWwgc3RhdGUgdG8gdGhlIGNvbnN1bWVyIHRvIGhhbmRsZSB0aGVcbiAgICAgICAgICAgIC8vIHJlbmV3YWwgdXNlY2FzZS5cbiAgICAgICAgICAgIGNoaWxkLmtpbGwoKTtcbiAgICAgICAgICAgIGRlYnVnKCdjaGlsZCBwcm9jZXNzIGtpbGxlZCcpO1xuICAgICAgICAgICAgcmV0dXJuIHsgbXVzdFJlbmV3IH07XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGNoaWxkLmtpbGwoKTtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihlcnIpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmV0dXJuSW5mby5yZXNvbHZlKVxuICAgICAgICAgIC5jYXRjaChyZXR1cm5JbmZvLnJlamVjdCk7XG4gICAgICB9IGVsc2UgaWYgKHN0ZG91dERhdGEuaW5jbHVkZXMoJ1JFTU9URV9DT05ORUNUSU9OX0NMT1NFRCcpKSB7XG4gICAgICAgIF9sb2dPckRlYnVnKGxvZ2dlciwgJ2xvZycsICdSZW1vdGUgc2VydmVyIGNsb3NlZCBzdWNjZXNzZnVsbHknKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZGVidWcoJ3N0ZG91dDoge30nKTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBhd2FpdCByZXR1cm5JbmZvLnByb21pc2U7XG59XG5cbi8qKlxuICogRm9yIGEgZ2l2ZW4gaG9zdG5hbWUgYW5kIGNlcnRwYXRoLGdldHMgdGhlIGNlcnRpZmljYXRlIGZyb20gdGhlIHJlbW90ZSBzZXJ2ZXIsXG4gKiBzdG9yZXMgaXQgYXQgdGhlIHByb3ZpZGVkIGNlcnRQYXRoLFxuICogdHJ1c3RzIGNlcnRpZmljYXRlIGZyb20gcmVtb3RlIG1hY2hpbmUgYW5kIGNsb3NlcyB0aGUgcmVtb3RlIHNlcnZlci5cbiAqXG4gKiBAcGFyYW0gaG9zdG5hbWUgLSBob3N0bmFtZSBvZiB0aGUgcmVtb3RlIG1hY2hpbmVcbiAqIEBwYXJhbSBjZXJ0UGF0aCAtIGZpbGUgcGF0aCB0byBzdG9yZSB0aGUgY2VydFxuICogQHBhcmFtIHBhcmFtMiAtIFRydXN0UmVtb3RlT3B0aW9ucyBvcHRpb25zXG4gKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBfdHJ1c3RSZW1vdGVNYWNoaW5lKFxuICBob3N0bmFtZTogc3RyaW5nLFxuICBjZXJ0UGF0aDogc3RyaW5nLFxuICB7XG4gICAgcG9ydCA9IERFRkFVTFRfUkVNT1RFX1BPUlQsXG4gICAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzID0gUkVNQUlOSU5HX0JVU0lORVNTX0RBWVNfVkFMSURJVFlfQkVGT1JFX1JFTkVXLFxuICAgIGxvZ2dlcixcbiAgICB0cnVzdENlcnRzT25SZW1vdGVGdW5jID0gdHJ1c3RDZXJ0c09uUmVtb3RlLFxuICAgIGNsb3NlUmVtb3RlRnVuYyA9IGNsb3NlUmVtb3RlU2VydmVyXG4gIH06IFBhcnRpYWw8VHJ1c3RSZW1vdGVPcHRpb25zPiA9IHt9XG4pOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgdHJ5IHtcbiAgICBfbG9nT3JEZWJ1ZyhcbiAgICAgIGxvZ2dlcixcbiAgICAgICdsb2cnLFxuICAgICAgJ0F0dGVtcHRpbmcgdG8gdHJ1c3QgdGhlIHJlbW90ZSBjZXJ0aWZpY2F0ZSBvbiB0aGlzIG1hY2hpbmUnXG4gICAgKTtcbiAgICAvLyBUcnVzdCB0aGUgY2VydHNcbiAgICBjb25zdCB7IG11c3RSZW5ldyB9ID0gYXdhaXQgdHJ1c3RDZXJ0c09uUmVtb3RlRnVuYyhcbiAgICAgIGhvc3RuYW1lLFxuICAgICAgcG9ydCxcbiAgICAgIGNlcnRQYXRoLFxuICAgICAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzXG4gICAgKTtcbiAgICBfbG9nT3JEZWJ1Zyhsb2dnZXIsICdsb2cnLCAnQ2VydGlmaWNhdGUgdHJ1c3RlZCBzdWNjZXNzZnVsbHknKTtcbiAgICAvLyByZXR1cm4gdGhlIGNlcnRpZmljYXRlIHJlbmV3YWwgc3RhdGUgdG8gdGhlIGNvbnN1bWVyIHRvIGhhbmRsZSB0aGVcbiAgICAvLyByZW5ld2FsIHVzZWNhc2UuXG4gICAgcmV0dXJuIG11c3RSZW5ldztcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGVycik7XG4gIH0gZmluYWxseSB7XG4gICAgX2xvZ09yRGVidWcobG9nZ2VyLCAnbG9nJywgJ0F0dGVtcHRpbmcgdG8gY2xvc2UgdGhlIHJlbW90ZSBzZXJ2ZXInKTtcbiAgICAvLyBDbG9zZSB0aGUgcmVtb3RlIHNlcnZlciBhbmQgY2xlYW51cCBhbHdheXMuXG4gICAgY29uc3QgcmVtb3RlU2VydmVyUmVzcG9uc2UgPSBhd2FpdCBjbG9zZVJlbW90ZUZ1bmMoaG9zdG5hbWUsIHBvcnQpO1xuICAgIGRlYnVnKHJlbW90ZVNlcnZlclJlc3BvbnNlKTtcbiAgfVxufVxuLyoqXG4gKiBVbnRydXN0IHRoZSBjZXJ0aWZpY2F0ZSBmb3IgYSBnaXZlbiBmaWxlIHBhdGguXG4gKiBAcHVibGljXG4gKiBAcGFyYW0gZmlsZVBhdGggLSBmaWxlIHBhdGggb2YgdGhlIGNlcnRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVudHJ1c3RNYWNoaW5lQnlDZXJ0aWZpY2F0ZShjZXJ0UGF0aDogc3RyaW5nKTogdm9pZCB7XG4gIGN1cnJlbnRQbGF0Zm9ybS5yZW1vdmVGcm9tVHJ1c3RTdG9yZXMoY2VydFBhdGgpO1xufVxuXG4vKipcbiAqIENoZWNrIHdoZXRoZXIgYSBjZXJ0aWZpY2F0ZSB3aXRoIGEgZ2l2ZW4gY29tbW9uX25hbWUgaGFzIGJlZW4gaW5zdGFsbGVkXG4gKlxuICogQHB1YmxpY1xuICogQHBhcmFtIGNvbW1vbk5hbWUgLSBjb21tb25OYW1lIG9mIGNlcnRpZmljYXRlIHdob3NlIGV4aXN0ZW5jZSBpcyBiZWluZyBjaGVja2VkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoYXNDZXJ0aWZpY2F0ZUZvcihjb21tb25OYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIGV4aXN0cyhwYXRoRm9yRG9tYWluKGNvbW1vbk5hbWUsIGBjZXJ0aWZpY2F0ZS5jcnRgKSk7XG59XG5cbi8qKlxuICogR2V0IGEgbGlzdCBvZiBkb21haW5zIHRoYXQgY2VydGlmaWF0ZXMgaGF2ZSBiZWVuIGdlbmVyYXRlZCBmb3JcbiAqIEBhbHBoYVxuICovXG5leHBvcnQgZnVuY3Rpb24gY29uZmlndXJlZERvbWFpbnMoKTogc3RyaW5nW10ge1xuICByZXR1cm4gcmVhZGRpcihkb21haW5zRGlyKTtcbn1cblxuLyoqXG4gKiBSZW1vdmUgYSBjZXJ0aWZpY2F0ZVxuICogQHB1YmxpY1xuICogQHBhcmFtIGNvbW1vbk5hbWUgLSBjb21tb25OYW1lIG9mIGNlcnQgdG8gcmVtb3ZlXG4gKiBAZGVwcmVjYXRlZCBwbGVhc2UgdXNlIHtAbGluayByZW1vdmVBbmRSZXZva2VEb21haW5DZXJ0IHwgcmVtb3ZlQW5kUmV2b2tlRG9tYWluQ2VydH0gdG8gZW5zdXJlIHRoYXQgdGhlIE9wZW5TU0wgY2VydCByZW1vdmFsIGlzIGhhbmRsZWQgcHJvcGVybHlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZURvbWFpbihjb21tb25OYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgcmltcmFmLnN5bmMocGF0aEZvckRvbWFpbihjb21tb25OYW1lKSk7XG59XG5cbi8qKlxuICogUmVtb3ZlIGEgY2VydGlmaWNhdGUgYW5kIHJldm9rZSBpdCBmcm9tIHRoZSBPcGVuU1NMIGNlcnQgZGF0YWJhc2VcbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSBjb21tb25OYW1lIC0gY29tbW9uTmFtZSBvZiBjZXJ0IHRvIHJlbW92ZVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVtb3ZlQW5kUmV2b2tlRG9tYWluQ2VydChcbiAgY29tbW9uTmFtZTogc3RyaW5nXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgZGVidWcoYHJlbW92aW5nIGRvbWFpbiBjZXJ0aWZpY2F0ZSBmb3IgJHtjb21tb25OYW1lfWApO1xuICBjb25zdCBjZXJ0Rm9sZGVyUGF0aCA9IHBhdGhGb3JEb21haW4oY29tbW9uTmFtZSk7XG4gIGNvbnN0IGRvbWFpbkNlcnRQYXRoID0gY2VydFBhdGhGb3JEb21haW4oY29tbW9uTmFtZSk7XG4gIGlmIChleGlzdHNTeW5jKGNlcnRGb2xkZXJQYXRoKSkge1xuICAgIGRlYnVnKGBjZXJ0IGZvdW5kIG9uIGRpc2sgZm9yICR7Y29tbW9uTmFtZX1gKTtcbiAgICAvLyByZXZva2UgdGhlIGNlcnRcbiAgICBkZWJ1ZyhgcmV2b2tpbmcgY2VydCAke2NvbW1vbk5hbWV9YCk7XG4gICAgYXdhaXQgcmV2b2tlRG9tYWluQ2VydGlmaWNhdGUoY29tbW9uTmFtZSk7XG4gICAgLy8gZGVsZXRlIHRoZSBjZXJ0IGZpbGVcbiAgICBkZWJ1ZyhcbiAgICAgIGBkZWxldGluZyBjZXJ0IG9uIGRpc2sgZm9yICR7Y29tbW9uTmFtZX0gLSAke1xuICAgICAgICBzdGF0U3luYyhkb21haW5DZXJ0UGF0aCkuc2l6ZVxuICAgICAgfWBcbiAgICApO1xuICAgIHJlbW92ZURvbWFpbihjb21tb25OYW1lKTtcbiAgICBkZWJ1ZyhcbiAgICAgIGBkZWxldGVkIGNlcnQgb24gZGlzayBmb3IgJHtjb21tb25OYW1lfSAtICR7ZXhpc3RzU3luYyhkb21haW5DZXJ0UGF0aCl9YFxuICAgICk7XG4gIH0gZWxzZSBkZWJ1ZyhgY2VydCBub3QgZm91bmQgb24gZGlzayAke2NvbW1vbk5hbWV9YCk7XG4gIGRlYnVnKGBjb21wbGV0ZWQgcmVtb3ZpbmcgZG9tYWluIGNlcnRpZmljYXRlIGZvciAke2NvbW1vbk5hbWV9YCk7XG59XG4iXX0=