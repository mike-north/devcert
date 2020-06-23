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
 *
 * @internal
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
 * @param port - port to connect the remote machine
 * @param certPath - file path to store the cert
 * @param renewalBufferInBusinessDays - valid days before renewing the cert
 * @param logger - Optional param for enabling logging in the consuming apps
 */
function trustRemoteMachine(hostname, certPath, commonName, port = constants_1.DEFAULT_REMOTE_PORT, opts = {}) {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
    return new Promise(async (resolve, reject) => {
        const options = Object.assign({
            alternativeNames: [],
            renewalBufferInBusinessDays: REMAINING_BUSINESS_DAYS_VALIDITY_BEFORE_RENEW,
            trustCertsOnRemote,
            closeRemoteServer: remote_utils_1.closeRemoteServer
        }, opts);
        debug('getting local cert data for connecting to remote');
        const { cert, key } = await certificateFor(commonName, options.alternativeNames || [], { renewalBufferInBusinessDays: options.renewalBufferInBusinessDays }, options.certOptions);
        console.log('hey there', cert.toString());
        const logger = opts.logger;
        _logOrDebug(logger, 'log', `Connecting to remote host ${hostname} via ssh`);
        // Connect to remote box via ssh.
        const child = execa.shell(
        // @TODO Change this to npx
        `ssh ${hostname} npx mike-north/devcert#suchita/remote-connect remote --port=${port} --cert=${cert.toString()} --key=${key.toString()}`, {
            detached: false
        });
        // Throw any error that might have occurred on the remote side.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        if (child && child.stderr) {
            child.stderr.on('data', (data) => {
                var _a;
                if (data) {
                    const stdErrData = data.toString().trimRight();
                    console.log('hahahaha', stdErrData);
                    if ((_a = stdErrData) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('error')) {
                        debug('Error thrown on the remote side. Closing Remote server');
                        remote_utils_1.closeRemoteServer(hostname, port);
                        throw new Error(stdErrData);
                    }
                }
            });
        }
        // Listen to the stdout stream and determine the appropriate steps.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        if (child && child.stdout) {
            _logOrDebug(logger, 'log', `Attempting to start the server at port ${port}. This may take a while...`);
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            child.stdout.on('data', async (data) => {
                var _a, _b, _c;
                const stdoutData = (_a = data) === null || _a === void 0 ? void 0 : _a.toString().trimRight();
                if ((_b = stdoutData) === null || _b === void 0 ? void 0 : _b.includes(`STATE: READY_FOR_CONNECTION`)) {
                    _logOrDebug(logger, 'log', `Connected to remote host ${hostname} via ssh successfully`);
                    // Once certs are trusted, close the remote server and cleanup.
                    try {
                        const mustRenew = await _trustRemoteMachine(hostname, port, certPath, options.renewalBufferInBusinessDays ||
                            REMAINING_BUSINESS_DAYS_VALIDITY_BEFORE_RENEW, logger);
                        // return the certificate renewal state to the consumer to handle the
                        // renewal usecase.
                        resolve({ mustRenew });
                    }
                    catch (err) {
                        throw new Error(err);
                    }
                    child.kill();
                }
                else if ((_c = stdoutData) === null || _c === void 0 ? void 0 : _c.includes('REMOTE_CONNECTION_CLOSED')) {
                    _logOrDebug(logger, 'log', 'Remote server closed successfully');
                }
                else {
                    console.log(stdoutData, 'fghfghfghfghfghf');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInNyYy9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOztBQUVILDJCQU9ZO0FBQ1osK0JBQStCO0FBQy9CLHFDQUFxQztBQUNyQyxtREFBdUQ7QUFDdkQsaUNBQWlDO0FBQ2pDLDJDQVFxQjtBQUNyQiwyQ0FBMEM7QUFDMUMsbUVBR2lDO0FBV3hCLG9CQVpQLGlDQUFTLENBWU87QUFWbEIsaURBR3dCO0FBQ3hCLHFEQUFxRDtBQUNyRCxpREFBeUU7QUFLOUIsNEJBTFosZ0NBQWlCLENBS1k7QUFKNUQsMkNBQWlDO0FBQ2pDLHVDQUEyQztBQUMzQyxtQ0FBNkU7QUFHN0UsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBRXJDLE1BQU0sNkNBQTZDLEdBQUcsQ0FBQyxDQUFDO0FBK0V4RCxNQUFNLG9CQUFvQixHQUFnQjtJQUN4QyxZQUFZLEVBQUUsR0FBRztJQUNqQixnQkFBZ0IsRUFBRSxFQUFFO0NBQ3JCLENBQUM7QUE0Q0ssS0FBSyxVQUFVLGNBQWMsQ0FJbEMsVUFBa0IsRUFDbEIseUJBQXVDLEVBQ3ZDLE9BQVcsRUFDWCxrQkFBdUI7SUFFdkIsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLHlCQUF5QixDQUFDLEVBQUU7UUFDNUMsT0FBTyxrQkFBa0IsQ0FDdkIsVUFBVSxFQUNWLHlCQUF5QixFQUN6QixPQUFPLEVBQ1Asa0JBQWtCLENBQ25CLENBQUM7S0FDSDtTQUFNO1FBQ0wsT0FBTyxrQkFBa0IsQ0FBQyxVQUFVLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0tBQ3hFO0FBQ0gsQ0FBQztBQW5CRCx3Q0FtQkM7QUFFRCxTQUFTLHdCQUF3QixDQUMvQixHQUFXLEVBQ1gsMkJBQW1DO0lBRW5DLE1BQU0sUUFBUSxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNyQyxNQUFNLE9BQU8s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RCxNQUFNLGNBQWMsR0FBRyxxQkFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ2pELE1BQU0sY0FBYyxHQUFHLHlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3JELElBQUksZUFBVSxDQUFDLGNBQWMsQ0FBQyxFQUFFO1FBQzlCLEtBQUssQ0FBQywwQkFBMEIsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUM5QyxrQkFBa0I7UUFDbEIsS0FBSyxDQUFDLGlCQUFpQixVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sc0NBQXVCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDMUMsdUJBQXVCO1FBQ3ZCLEtBQUssQ0FDSCw2QkFBNkIsVUFBVSxNQUNyQyxhQUFRLENBQUMsY0FBYyxDQUFDLENBQUMsSUFDM0IsRUFBRSxDQUNILENBQUM7UUFDRixZQUFZLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDekIsS0FBSyxDQUNILDRCQUE0QixVQUFVLE1BQU0sZUFBVSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQ3pFLENBQUM7S0FDSDs7UUFBTSxLQUFLLENBQUMsMEJBQTBCLFVBQVUsRUFBRSxDQUFDLENBQUM7SUFDckQsS0FBSyxDQUFDLDZDQUE2QyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBQ25FLENBQUM7QUF2QkQsOERBdUJDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAcGFja2FnZURvY3VtZW50YXRpb25cbiAqIFV0aWxpdGllcyBmb3Igc2FmZWx5IGdlbmVyYXRpbmcgbG9jYWxseS10cnVzdGVkIGFuZCBtYWNoaW5lLXNwZWNpZmljIFguNTA5IGNlcnRpZmljYXRlcyBmb3IgbG9jYWwgZGV2ZWxvcG1lbnRcbiAqL1xuXG5pbXBvcnQge1xuICByZWFkRmlsZVN5bmMgYXMgcmVhZEZpbGUsXG4gIHJlYWRkaXJTeW5jIGFzIHJlYWRkaXIsXG4gIGV4aXN0c1N5bmMgYXMgZXhpc3RzLFxuICBleGlzdHNTeW5jLFxuICB3cml0ZUZpbGVTeW5jLFxuICBzdGF0U3luY1xufSBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBleGVjYSBmcm9tICdleGVjYSc7XG5pbXBvcnQgKiBhcyBjcmVhdGVEZWJ1ZyBmcm9tICdkZWJ1Zyc7XG5pbXBvcnQgeyBzeW5jIGFzIGNvbW1hbmRFeGlzdHMgfSBmcm9tICdjb21tYW5kLWV4aXN0cyc7XG5pbXBvcnQgKiBhcyByaW1yYWYgZnJvbSAncmltcmFmJztcbmltcG9ydCB7XG4gIGlzTWFjLFxuICBpc0xpbnV4LFxuICBpc1dpbmRvd3MsXG4gIGRvbWFpbnNEaXIsXG4gIHJvb3RDQUtleVBhdGgsXG4gIHJvb3RDQUNlcnRQYXRoLFxuICBERUZBVUxUX1JFTU9URV9QT1JUXG59IGZyb20gJy4vY29uc3RhbnRzJztcbmltcG9ydCBjdXJyZW50UGxhdGZvcm0gZnJvbSAnLi9wbGF0Zm9ybXMnO1xuaW1wb3J0IGluc3RhbGxDZXJ0aWZpY2F0ZUF1dGhvcml0eSwge1xuICBlbnN1cmVDQUNlcnRSZWFkYWJsZSxcbiAgdW5pbnN0YWxsXG59IGZyb20gJy4vY2VydGlmaWNhdGUtYXV0aG9yaXR5JztcbmltcG9ydCB7XG4gIGdlbmVyYXRlRG9tYWluQ2VydGlmaWNhdGUsXG4gIHJldm9rZURvbWFpbkNlcnRpZmljYXRlXG59IGZyb20gJy4vY2VydGlmaWNhdGVzJztcbmltcG9ydCBVSSwgeyBVc2VySW50ZXJmYWNlIH0gZnJvbSAnLi91c2VyLWludGVyZmFjZSc7XG5pbXBvcnQgeyBnZXRSZW1vdGVDZXJ0aWZpY2F0ZSwgY2xvc2VSZW1vdGVTZXJ2ZXIgfSBmcm9tICcuL3JlbW90ZS11dGlscyc7XG5pbXBvcnQgeyBwa2kgfSBmcm9tICdub2RlLWZvcmdlJztcbmltcG9ydCB7IHN1YkJ1c2luZXNzRGF5cyB9IGZyb20gJ2RhdGUtZm5zJztcbmltcG9ydCB7IHBhdGhGb3JEb21haW4sIGtleVBhdGhGb3JEb21haW4sIGNlcnRQYXRoRm9yRG9tYWluIH0gZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5leHBvcnQgeyB1bmluc3RhbGwsIFVzZXJJbnRlcmZhY2UsIExvZ2dlciwgY2xvc2VSZW1vdGVTZXJ2ZXIgfTtcbmNvbnN0IGRlYnVnID0gY3JlYXRlRGVidWcoJ2RldmNlcnQnKTtcblxuY29uc3QgUkVNQUlOSU5HX0JVU0lORVNTX0RBWVNfVkFMSURJVFlfQkVGT1JFX1JFTkVXID0gNTtcblxuLyoqXG4gKiBDZXJ0aWZpY2F0ZSBvcHRpb25zXG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ2VydE9wdGlvbnMge1xuICAvKiogTnVtYmVyIG9mIGRheXMgYmVmb3JlIHRoZSBDQSBleHBpcmVzICovXG4gIGNhQ2VydEV4cGlyeTogbnVtYmVyO1xuICAvKiogTnVtYmVyIG9mIGRheXMgYmVmb3JlIHRoZSBkb21haW4gY2VydGlmaWNhdGUgZXhwaXJlcyAqL1xuICBkb21haW5DZXJ0RXhwaXJ5OiBudW1iZXI7XG59XG4vKipcbiAqIENlcnQgZ2VuZXJhdGlvbiBvcHRpb25zXG4gKlxuICogQHB1YmxpY1xuICovXG5leHBvcnQgaW50ZXJmYWNlIE9wdGlvbnMgLyogZXh0ZW5kcyBQYXJ0aWFsPElDYUJ1ZmZlck9wdHMgJiBJQ2FQYXRoT3B0cz4gICovIHtcbiAgLyoqIFJldHVybiB0aGUgQ0EgY2VydGlmaWNhdGUgZGF0YT8gKi9cbiAgZ2V0Q2FCdWZmZXI/OiBib29sZWFuO1xuICAvKiogUmV0dXJuIHRoZSBwYXRoIHRvIHRoZSBDQSBjZXJ0aWZpY2F0ZT8gKi9cbiAgZ2V0Q2FQYXRoPzogYm9vbGVhbjtcbiAgLyoqIElmIGBjZXJ0dXRpbGAgaXMgbm90IGluc3RhbGxlZCBhbHJlYWR5IChmb3IgdXBkYXRpbmcgbnNzIGRhdGFiYXNlczsgZS5nLiBmaXJlZm94KSwgZG8gbm90IGF0dGVtcHQgdG8gaW5zdGFsbCBpdCAqL1xuICBza2lwQ2VydHV0aWxJbnN0YWxsPzogYm9vbGVhbjtcbiAgLyoqIERvIG5vdCB1cGRhdGUgeW91ciBzeXN0ZW1zIGhvc3QgZmlsZSB3aXRoIHRoZSBkb21haW4gbmFtZSBvZiB0aGUgY2VydGlmaWNhdGUgKi9cbiAgc2tpcEhvc3RzRmlsZT86IGJvb2xlYW47XG4gIC8qKiBVc2VyIGludGVyZmFjZSBob29rcyAqL1xuICB1aT86IFVzZXJJbnRlcmZhY2U7XG4gIC8qKiBOdW1iZXIgb2YgYnVzaW5lc3MgZGF5cyBiZWZvcmUgZG9tYWluIGNlcnQgZXhwaXJ5IGJlZm9yZSBhdXRvbWF0aWMgcmV2b2tlIGFuZCByZW5ldyAqL1xuICByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXM/OiBudW1iZXI7XG59XG4vKipcbiAqIFRoZSBDQSBwdWJsaWMga2V5IGFzIGEgYnVmZmVyXG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ2FCdWZmZXIge1xuICAvKiogQ0EgcHVibGljIGtleSAqL1xuICBjYTogQnVmZmVyO1xufVxuLyoqXG4gKiBUaGUgY2VydCBhdXRob3JpdHkncyBwYXRoIG9uIGRpc2tcbiAqIEBwdWJsaWNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBDYVBhdGgge1xuICAvKiogQ0EgY2VydCBwYXRoIG9uIGRpc2sgKi9cbiAgY2FQYXRoOiBzdHJpbmc7XG59XG4vKipcbiAqIERvbWFpbiBjZXJ0IHB1YmxpYyBhbmQgcHJpdmF0ZSBrZXlzIGFzIGJ1ZmZlcnNcbiAqIEBwdWJsaWNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBEb21haW5EYXRhIHtcbiAgLyoqIHByaXZhdGUga2V5ICovXG4gIGtleTogQnVmZmVyO1xuICAvKiogcHVibGljIGtleSAoY2VydCkgKi9cbiAgY2VydDogQnVmZmVyO1xufVxuLyoqXG4gKiBBIHJldHVybiB2YWx1ZSBjb250YWluaW5nIHRoZSBDQSBwdWJsaWMga2V5XG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCB0eXBlIElSZXR1cm5DYTxPIGV4dGVuZHMgT3B0aW9ucz4gPSBPWydnZXRDYUJ1ZmZlciddIGV4dGVuZHMgdHJ1ZVxuICA/IENhQnVmZmVyXG4gIDogZmFsc2U7XG4vKipcbiAqIEEgcmV0dXJuIHZhbHVlIGNvbnRhaW5pbmcgdGhlIENBIHBhdGggb24gZGlza1xuICogQHB1YmxpY1xuICovXG5leHBvcnQgdHlwZSBJUmV0dXJuQ2FQYXRoPE8gZXh0ZW5kcyBPcHRpb25zPiA9IE9bJ2dldENhUGF0aCddIGV4dGVuZHMgdHJ1ZVxuICA/IENhUGF0aFxuICA6IGZhbHNlO1xuLyoqXG4gKiBBIHJldHVybiB2YWx1ZSBjb250YWluaW5nIHRoZSBDQSBwdWJsaWMga2V5LCBDQSBwYXRoIG9uIGRpc2ssIGFuZCBkb21haW4gY2VydCBpbmZvXG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCB0eXBlIElSZXR1cm5EYXRhPE8gZXh0ZW5kcyBPcHRpb25zID0ge30+ID0gRG9tYWluRGF0YSAmXG4gIElSZXR1cm5DYTxPPiAmXG4gIElSZXR1cm5DYVBhdGg8Tz47XG5cbmNvbnN0IERFRkFVTFRfQ0VSVF9PUFRJT05TOiBDZXJ0T3B0aW9ucyA9IHtcbiAgY2FDZXJ0RXhwaXJ5OiAxODAsXG4gIGRvbWFpbkNlcnRFeHBpcnk6IDMwXG59O1xuXG4vKipcbiAqIFJlcXVlc3QgYW4gU1NMIGNlcnRpZmljYXRlIGZvciB0aGUgZ2l2ZW4gYXBwIG5hbWUgc2lnbmVkIGJ5IHRoZSBkZXZjZXJ0IHJvb3RcbiAqIGNlcnRpZmljYXRlIGF1dGhvcml0eS4gSWYgZGV2Y2VydCBoYXMgcHJldmlvdXNseSBnZW5lcmF0ZWQgYSBjZXJ0aWZpY2F0ZSBmb3JcbiAqIHRoYXQgYXBwIG5hbWUgb24gdGhpcyBtYWNoaW5lLCBpdCB3aWxsIHJldXNlIHRoYXQgY2VydGlmaWNhdGUuXG4gKlxuICogSWYgdGhpcyBpcyB0aGUgZmlyc3QgdGltZSBkZXZjZXJ0IGlzIGJlaW5nIHJ1biBvbiB0aGlzIG1hY2hpbmUsIGl0IHdpbGxcbiAqIGdlbmVyYXRlIGFuZCBhdHRlbXB0IHRvIGluc3RhbGwgYSByb290IGNlcnRpZmljYXRlIGF1dGhvcml0eS5cbiAqXG4gKiBJZiBgb3B0aW9ucy5nZXRDYUJ1ZmZlcmAgaXMgdHJ1ZSwgcmV0dXJuIHZhbHVlIHdpbGwgaW5jbHVkZSB0aGUgY2EgY2VydGlmaWNhdGUgZGF0YVxuICogYXMgXFx7IGNhOiBCdWZmZXIgXFx9XG4gKlxuICogSWYgYG9wdGlvbnMuZ2V0Q2FQYXRoYCBpcyB0cnVlLCByZXR1cm4gdmFsdWUgd2lsbCBpbmNsdWRlIHRoZSBjYSBjZXJ0aWZpY2F0ZSBwYXRoXG4gKiBhcyBcXHsgY2FQYXRoOiBzdHJpbmcgXFx9XG4gKlxuICogQHB1YmxpY1xuICogQHBhcmFtIGNvbW1vbk5hbWUgLSBjb21tb24gbmFtZSBmb3IgY2VydGlmaWNhdGVcbiAqIEBwYXJhbSBhbHRlcm5hdGl2ZU5hbWVzIC0gYWx0ZXJuYXRlIG5hbWVzIGZvciB0aGUgY2VydGlmaWNhdGVcbiAqIEBwYXJhbSBvcHRpb25zIC0gY2VydCBnZW5lcmF0aW9uIG9wdGlvbnNcbiAqIEBwYXJhbSBwYXJ0aWFsQ2VydE9wdGlvbnMgLSBjZXJ0aWZpY2F0ZSBvcHRpb25zXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjZXJ0aWZpY2F0ZUZvcjxcbiAgTyBleHRlbmRzIE9wdGlvbnMsXG4gIENPIGV4dGVuZHMgUGFydGlhbDxDZXJ0T3B0aW9ucz5cbj4oXG4gIGNvbW1vbk5hbWU6IHN0cmluZyxcbiAgYWx0ZXJuYXRpdmVOYW1lczogc3RyaW5nW10sXG4gIG9wdGlvbnM/OiBPLFxuICBwYXJ0aWFsQ2VydE9wdGlvbnM/OiBDT1xuKTogUHJvbWlzZTxJUmV0dXJuRGF0YTxPPj47XG5cbi8qKlxuICoge0Bpbmhlcml0ZG9jIChjZXJ0aWZpY2F0ZUZvcjoxKX1cbiAqIEBwdWJsaWNcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNlcnRpZmljYXRlRm9yPFxuICBPIGV4dGVuZHMgT3B0aW9ucyxcbiAgQ08gZXh0ZW5kcyBQYXJ0aWFsPENlcnRPcHRpb25zPlxuPihcbiAgY29tbW9uTmFtZTogc3RyaW5nLFxuICBvcHRpb25zPzogTyxcbiAgcGFydGlhbENlcnRPcHRpb25zPzogQ09cbik6IFByb21pc2U8SVJldHVybkRhdGE8Tz4+O1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNlcnRpZmljYXRlRm9yPFxuICBPIGV4dGVuZHMgT3B0aW9ucyxcbiAgQ08gZXh0ZW5kcyBQYXJ0aWFsPENlcnRPcHRpb25zPlxuPihcbiAgY29tbW9uTmFtZTogc3RyaW5nLFxuICBvcHRpb25zT3JBbHRlcm5hdGl2ZU5hbWVzOiBzdHJpbmdbXSB8IE8sXG4gIG9wdGlvbnM/OiBPLFxuICBwYXJ0aWFsQ2VydE9wdGlvbnM/OiBDT1xuKTogUHJvbWlzZTxJUmV0dXJuRGF0YTxPPj4ge1xuICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zT3JBbHRlcm5hdGl2ZU5hbWVzKSkge1xuICAgIHJldHVybiBjZXJ0aWZpY2F0ZUZvckltcGwoXG4gICAgICBjb21tb25OYW1lLFxuICAgICAgb3B0aW9uc09yQWx0ZXJuYXRpdmVOYW1lcyxcbiAgICAgIG9wdGlvbnMsXG4gICAgICBwYXJ0aWFsQ2VydE9wdGlvbnNcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBjZXJ0aWZpY2F0ZUZvckltcGwoY29tbW9uTmFtZSwgW10sIG9wdGlvbnMsIHBhcnRpYWxDZXJ0T3B0aW9ucyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0RXhwaXJlQW5kUmVuZXdhbERhdGVzKFxuICBjcnQ6IHN0cmluZyxcbiAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzOiBudW1iZXJcbik6IHsgZXhwaXJlQXQ6IERhdGU7IHJlbmV3Qnk6IERhdGUgfSB7XG4gIGNvbnN0IGV4cGlyZUF0ID0gX2dldEV4cGlyZURhdGUoY3J0KTtcbiAgY29uc3QgcmVuZXdCeSA9IHN1YkJ1c2luZXNzRGF5cyhleHBpcmVBdCwgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzKTtcbiAgcmV0dXJuIHsgZXhwaXJlQXQsIHJlbmV3QnkgfTtcbn1cblxuZnVuY3Rpb24gZ2V0Q2VydFBvcnRpb25PZlBlbVN0cmluZyhjcnQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGJlZ2luU3RyID0gJy0tLS0tQkVHSU4gQ0VSVElGSUNBVEUtLS0tLSc7XG4gIGNvbnN0IGVuZFN0ciA9ICctLS0tLUVORCBDRVJUSUZJQ0FURS0tLS0tJztcbiAgY29uc3QgYmVnaW4gPSBjcnQuaW5kZXhPZihiZWdpblN0cik7XG4gIGNvbnN0IGVuZCA9IGNydC5pbmRleE9mKGVuZFN0cik7XG4gIGlmIChiZWdpbiA8IDAgfHwgZW5kIDwgMClcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgSW1wcm9wZXJseSBmb3JtYXR0ZWQgUEVNIGZpbGUuIEV4cGVjdGVkIHRvIGZpbmQgJHtiZWdpblN0cn0gYW5kICR7ZW5kU3RyfVxuXCIke2NydH1cImBcbiAgICApO1xuXG4gIGNvbnN0IGNlcnRDb250ZW50ID0gY3J0LnN1YnN0cihiZWdpbiwgZW5kIC0gYmVnaW4gKyBlbmRTdHIubGVuZ3RoKTtcbiAgcmV0dXJuIGNlcnRDb250ZW50O1xufVxuXG5mdW5jdGlvbiBfZ2V0RXhwaXJlRGF0ZShjcnQ6IHN0cmluZyk6IERhdGUge1xuICBjb25zdCBjZXJ0SW5mbyA9IHBraS5jZXJ0aWZpY2F0ZUZyb21QZW0oY3J0KTtcbiAgY29uc3QgeyBub3RBZnRlciB9ID0gY2VydEluZm8udmFsaWRpdHk7XG4gIHJldHVybiBub3RBZnRlcjtcbn1cblxuZnVuY3Rpb24gc2hvdWxkUmVuZXcoXG4gIGNydDogc3RyaW5nLFxuICByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXM6IG51bWJlclxuKTogYm9vbGVhbiB7XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gIGNvbnN0IHsgZXhwaXJlQXQsIHJlbmV3QnkgfSA9IGdldEV4cGlyZUFuZFJlbmV3YWxEYXRlcyhcbiAgICBjcnQsXG4gICAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzXG4gICk7XG4gIGRlYnVnKFxuICAgIGBldmFsdWF0aW5nIGNlcnQgcmVuZXdhbFxcbi0gbm93OlxcdCR7bm93LnRvRGF0ZVN0cmluZygpfVxcbi0gcmVuZXcgYXQ6XFx0JHtyZW5ld0J5LnRvRGF0ZVN0cmluZygpfVxcbi0gZXhwaXJlIGF0OlxcdCR7ZXhwaXJlQXQudG9EYXRlU3RyaW5nKCl9YFxuICApO1xuICByZXR1cm4gbm93LnZhbHVlT2YoKSA+PSByZW5ld0J5LnZhbHVlT2YoKTtcbn1cblxuLyoqXG4gKiBHZXQgdGhlIGV4cGlyYXRpb24gYW5kIHJlY29tbWVuZGVkIHJlbmV3YWwgZGF0ZXMsIGZvciB0aGUgbGF0ZXN0IGlzc3VlZFxuICogY2VydCBmb3IgYSBnaXZlbiBjb21tb25fbmFtZVxuICpcbiAqIEBhbHBoYVxuICogQHBhcmFtIGNvbW1vbk5hbWUgLSBjb21tb25fbmFtZSBvZiBjZXJ0IHdob3NlIGV4cGlyYXRpb24gaW5mbyBpcyBkZXNpcmVkXG4gKiBAcGFyYW0gcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzIC0gbnVtYmVyIG9mIGJ1c2luZXNzIGRheXMgYmVmb3JlIGNlcnQgZXhwaXJhdGlvbiwgdG8gc3RhcnQgaW5kaWNhdGluZyB0aGF0IGl0IHNob3VsZCBiZSByZW5ld2VkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDZXJ0RXhwaXJhdGlvbkluZm8oXG4gIGNvbW1vbk5hbWU6IHN0cmluZyxcbiAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzID0gUkVNQUlOSU5HX0JVU0lORVNTX0RBWVNfVkFMSURJVFlfQkVGT1JFX1JFTkVXXG4pOiB7IG11c3RSZW5ldzogYm9vbGVhbjsgcmVuZXdCeTogRGF0ZTsgZXhwaXJlQXQ6IERhdGUgfSB7XG4gIGNvbnN0IGRvbWFpbkNlcnRQYXRoID0gcGF0aEZvckRvbWFpbihjb21tb25OYW1lLCBgY2VydGlmaWNhdGUuY3J0YCk7XG4gIGlmICghZXhpc3RzKGRvbWFpbkNlcnRQYXRoKSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoYGNlcnQgZm9yICR7Y29tbW9uTmFtZX0gd2FzIG5vdCBmb3VuZGApO1xuICBjb25zdCBkb21haW5DZXJ0ID0gcmVhZEZpbGUoZG9tYWluQ2VydFBhdGgpLnRvU3RyaW5nKCk7XG4gIGlmICghZG9tYWluQ2VydCkge1xuICAgIHRocm93IG5ldyBFcnJvcihgTm8gY2VydGlmaWNhdGUgZm9yICR7Y29tbW9uTmFtZX0gZXhpc3RzYCk7XG4gIH1cbiAgY29uc3QgY3J0ID0gZ2V0Q2VydFBvcnRpb25PZlBlbVN0cmluZyhkb21haW5DZXJ0KTtcbiAgY29uc3QgeyBleHBpcmVBdCwgcmVuZXdCeSB9ID0gZ2V0RXhwaXJlQW5kUmVuZXdhbERhdGVzKFxuICAgIGNydCxcbiAgICByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXNcbiAgKTtcbiAgY29uc3QgbXVzdFJlbmV3ID0gc2hvdWxkUmVuZXcoY3J0LCByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXMpO1xuICByZXR1cm4geyBtdXN0UmVuZXcsIGV4cGlyZUF0LCByZW5ld0J5IH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNlcnRpZmljYXRlRm9ySW1wbDxcbiAgTyBleHRlbmRzIE9wdGlvbnMsXG4gIENPIGV4dGVuZHMgUGFydGlhbDxDZXJ0T3B0aW9ucz5cbj4oXG4gIGNvbW1vbk5hbWU6IHN0cmluZyxcbiAgYWx0ZXJuYXRpdmVOYW1lczogc3RyaW5nW10sXG4gIG9wdGlvbnM6IE8gPSB7fSBhcyBPLFxuICBwYXJ0aWFsQ2VydE9wdGlvbnM6IENPID0ge30gYXMgQ09cbik6IFByb21pc2U8SVJldHVybkRhdGE8Tz4+IHtcbiAgZGVidWcoXG4gICAgYENlcnRpZmljYXRlIHJlcXVlc3RlZCBmb3IgJHtjb21tb25OYW1lfS4gU2tpcHBpbmcgY2VydHV0aWwgaW5zdGFsbDogJHtCb29sZWFuKFxuICAgICAgb3B0aW9ucy5za2lwQ2VydHV0aWxJbnN0YWxsXG4gICAgKX0uIFNraXBwaW5nIGhvc3RzIGZpbGU6ICR7Qm9vbGVhbihvcHRpb25zLnNraXBIb3N0c0ZpbGUpfWBcbiAgKTtcbiAgY29uc3QgY2VydE9wdGlvbnM6IENlcnRPcHRpb25zID0ge1xuICAgIC4uLkRFRkFVTFRfQ0VSVF9PUFRJT05TLFxuICAgIC4uLnBhcnRpYWxDZXJ0T3B0aW9uc1xuICB9O1xuICBpZiAob3B0aW9ucy51aSkge1xuICAgIE9iamVjdC5hc3NpZ24oVUksIG9wdGlvbnMudWkpO1xuICB9XG5cbiAgaWYgKCFpc01hYyAmJiAhaXNMaW51eCAmJiAhaXNXaW5kb3dzKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBQbGF0Zm9ybSBub3Qgc3VwcG9ydGVkOiBcIiR7cHJvY2Vzcy5wbGF0Zm9ybX1cImApO1xuICB9XG5cbiAgaWYgKCFjb21tYW5kRXhpc3RzKCdvcGVuc3NsJykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAnT3BlblNTTCBub3QgZm91bmQ6IE9wZW5TU0wgaXMgcmVxdWlyZWQgdG8gZ2VuZXJhdGUgU1NMIGNlcnRpZmljYXRlcyAtIG1ha2Ugc3VyZSBpdCBpcyBpbnN0YWxsZWQgYW5kIGF2YWlsYWJsZSBpbiB5b3VyIFBBVEgnXG4gICAgKTtcbiAgfVxuXG4gIGNvbnN0IGRvbWFpbktleVBhdGggPSBrZXlQYXRoRm9yRG9tYWluKGNvbW1vbk5hbWUpO1xuICBjb25zdCBkb21haW5DZXJ0UGF0aCA9IGNlcnRQYXRoRm9yRG9tYWluKGNvbW1vbk5hbWUpO1xuXG4gIGlmICghZXhpc3RzKHJvb3RDQUtleVBhdGgpKSB7XG4gICAgZGVidWcoXG4gICAgICAnUm9vdCBDQSBpcyBub3QgaW5zdGFsbGVkIHlldCwgc28gaXQgbXVzdCBiZSBvdXIgZmlyc3QgcnVuLiBJbnN0YWxsaW5nIHJvb3QgQ0EgLi4uJ1xuICAgICk7XG4gICAgYXdhaXQgaW5zdGFsbENlcnRpZmljYXRlQXV0aG9yaXR5KG9wdGlvbnMsIGNlcnRPcHRpb25zKTtcbiAgfSBlbHNlIGlmIChvcHRpb25zLmdldENhQnVmZmVyIHx8IG9wdGlvbnMuZ2V0Q2FQYXRoKSB7XG4gICAgZGVidWcoXG4gICAgICAnUm9vdCBDQSBpcyBub3QgcmVhZGFibGUsIGJ1dCBpdCBwcm9iYWJseSBpcyBiZWNhdXNlIGFuIGVhcmxpZXIgdmVyc2lvbiBvZiBkZXZjZXJ0IGxvY2tlZCBpdC4gVHJ5aW5nIHRvIGZpeC4uLidcbiAgICApO1xuICAgIGF3YWl0IGVuc3VyZUNBQ2VydFJlYWRhYmxlKG9wdGlvbnMsIGNlcnRPcHRpb25zKTtcbiAgfVxuXG4gIGlmICghZXhpc3RzKGRvbWFpbkNlcnRQYXRoKSkge1xuICAgIGRlYnVnKFxuICAgICAgYENhbid0IGZpbmQgY2VydGlmaWNhdGUgZmlsZSBmb3IgJHtjb21tb25OYW1lfSwgc28gaXQgbXVzdCBiZSB0aGUgZmlyc3QgcmVxdWVzdCBmb3IgJHtjb21tb25OYW1lfS4gR2VuZXJhdGluZyBhbmQgY2FjaGluZyAuLi5gXG4gICAgKTtcbiAgICBhd2FpdCBnZW5lcmF0ZURvbWFpbkNlcnRpZmljYXRlKGNvbW1vbk5hbWUsIGFsdGVybmF0aXZlTmFtZXMsIGNlcnRPcHRpb25zKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBjZXJ0Q29udGVudHMgPSBnZXRDZXJ0UG9ydGlvbk9mUGVtU3RyaW5nKFxuICAgICAgcmVhZEZpbGUoZG9tYWluQ2VydFBhdGgpLnRvU3RyaW5nKClcbiAgICApO1xuICAgIGNvbnN0IGV4cGlyZURhdGUgPSBfZ2V0RXhwaXJlRGF0ZShjZXJ0Q29udGVudHMpO1xuICAgIGlmIChcbiAgICAgIHNob3VsZFJlbmV3KFxuICAgICAgICBjZXJ0Q29udGVudHMsXG4gICAgICAgIG9wdGlvbnMucmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzID8/XG4gICAgICAgICAgUkVNQUlOSU5HX0JVU0lORVNTX0RBWVNfVkFMSURJVFlfQkVGT1JFX1JFTkVXXG4gICAgICApXG4gICAgKSB7XG4gICAgICBkZWJ1ZyhcbiAgICAgICAgYENlcnRpZmljYXRlIGZvciAke2NvbW1vbk5hbWV9IHdhcyBjbG9zZSB0byBleHBpcmluZyAob24gJHtleHBpcmVEYXRlLnRvRGF0ZVN0cmluZygpfSkuIEEgZnJlc2ggY2VydGlmaWNhdGUgd2lsbCBiZSBnZW5lcmF0ZWQgZm9yIHlvdWBcbiAgICAgICk7XG4gICAgICBhd2FpdCByZW1vdmVBbmRSZXZva2VEb21haW5DZXJ0KGNvbW1vbk5hbWUpO1xuICAgICAgYXdhaXQgZ2VuZXJhdGVEb21haW5DZXJ0aWZpY2F0ZShcbiAgICAgICAgY29tbW9uTmFtZSxcbiAgICAgICAgYWx0ZXJuYXRpdmVOYW1lcyxcbiAgICAgICAgY2VydE9wdGlvbnNcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlYnVnKFxuICAgICAgICBgQ2VydGlmaWNhdGUgZm9yICR7Y29tbW9uTmFtZX0gd2FzIG5vdCBjbG9zZSB0byBleHBpcmluZyAob24gJHtleHBpcmVEYXRlLnRvRGF0ZVN0cmluZygpfSkuYFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBpZiAoIW9wdGlvbnMuc2tpcEhvc3RzRmlsZSkge1xuICAgIGF3YWl0IGN1cnJlbnRQbGF0Zm9ybS5hZGREb21haW5Ub0hvc3RGaWxlSWZNaXNzaW5nKGNvbW1vbk5hbWUpO1xuICB9XG5cbiAgZGVidWcoYFJldHVybmluZyBkb21haW4gY2VydGlmaWNhdGVgKTtcblxuICBjb25zdCByZXQgPSB7XG4gICAga2V5OiByZWFkRmlsZShkb21haW5LZXlQYXRoKSxcbiAgICBjZXJ0OiByZWFkRmlsZShkb21haW5DZXJ0UGF0aClcbiAgfSBhcyBJUmV0dXJuRGF0YTxPPjtcbiAgaWYgKG9wdGlvbnMuZ2V0Q2FCdWZmZXIpXG4gICAgKChyZXQgYXMgdW5rbm93bikgYXMgQ2FCdWZmZXIpLmNhID0gcmVhZEZpbGUocm9vdENBQ2VydFBhdGgpO1xuICBpZiAob3B0aW9ucy5nZXRDYVBhdGgpICgocmV0IGFzIHVua25vd24pIGFzIENhUGF0aCkuY2FQYXRoID0gcm9vdENBQ2VydFBhdGg7XG5cbiAgcmV0dXJuIHJldDtcbn1cblxuZnVuY3Rpb24gX2xvZ09yRGVidWcoXG4gIGxvZ2dlcjogTG9nZ2VyIHwgdW5kZWZpbmVkLFxuICB0eXBlOiAnbG9nJyB8ICd3YXJuJyB8ICdlcnJvcicsXG4gIG1lc3NhZ2U6IHN0cmluZ1xuKTogdm9pZCB7XG4gIGlmIChsb2dnZXIgJiYgdHlwZSkge1xuICAgIGxvZ2dlclt0eXBlXShtZXNzYWdlKTtcbiAgfSBlbHNlIHtcbiAgICBkZWJ1ZyhtZXNzYWdlKTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgVHJ1c3RSZW1vdGVPcHRpb25zIHtcbiAgYWx0ZXJuYXRpdmVOYW1lcz86IHN0cmluZ1tdO1xuICByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXM/OiBudW1iZXI7XG4gIGNlcnRPcHRpb25zPzogQ2VydE9wdGlvbnM7XG4gIGxvZ2dlcj86IExvZ2dlcjtcbiAgdHJ1c3RDZXJ0c09uUmVtb3RlRnVuYz86IHR5cGVvZiB0cnVzdENlcnRzT25SZW1vdGU7XG4gIGNsb3NlUmVtb3RlRnVuYz86IHR5cGVvZiBjbG9zZVJlbW90ZVNlcnZlcjtcbn1cblxuLyoqXG4gKiBUcnVzdCB0aGUgY2VydGlmaWNhdGUgZm9yIGEgZ2l2ZW4gaG9zdG5hbWUgYW5kIHBvcnQgYW5kIGFkZFxuICogdGhlIHJldHVybmVkIGNlcnQgdG8gdGhlIGxvY2FsIHRydXN0IHN0b3JlLlxuICogQHBhcmFtIGhvc3RuYW1lIC0gaG9zdG5hbWUgb2YgdGhlIHJlbW90ZSBtYWNoaW5lXG4gKiBAcGFyYW0gcG9ydCAtIHBvcnQgdG8gY29ubmVjdCB0aGUgcmVtb3RlIG1hY2hpbmVcbiAqIEBwYXJhbSBjZXJ0UGF0aCAtIGZpbGUgcGF0aCB0byBzdG9yZSB0aGUgY2VydFxuICpcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdHJ1c3RDZXJ0c09uUmVtb3RlKFxuICBob3N0bmFtZTogc3RyaW5nLFxuICBwb3J0OiBudW1iZXIsXG4gIGNlcnRQYXRoOiBzdHJpbmcsXG4gIHJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5czogbnVtYmVyLFxuICBnZXRSZW1vdGVDZXJ0c0Z1bmMgPSBnZXRSZW1vdGVDZXJ0aWZpY2F0ZSxcbiAgY2xvc2VSZW1vdGVGdW5jID0gY2xvc2VSZW1vdGVTZXJ2ZXJcbik6IFByb21pc2U8eyBtdXN0UmVuZXc6IGJvb2xlYW4gfT4ge1xuICAvLyBHZXQgdGhlIHJlbW90ZSBjZXJ0aWZpY2F0ZSBmcm9tIHRoZSBzZXJ2ZXJcbiAgdHJ5IHtcbiAgICBkZWJ1ZygnZ2V0dGluZyBjZXJ0IGZyb20gcmVtb3RlIG1hY2hpbmUnKTtcbiAgICBjb25zdCBjZXJ0RGF0YSA9IGF3YWl0IGdldFJlbW90ZUNlcnRzRnVuYyhob3N0bmFtZSwgcG9ydCk7XG4gICAgY29uc3QgbXVzdFJlbmV3ID0gc2hvdWxkUmVuZXcoY2VydERhdGEsIHJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5cyk7XG4gICAgZGVidWcoYHdyaXRpbmcgdGhlIGNlcnRpZmljYXRlIGRhdGEgb250byBsb2NhbCBmaWxlIHBhdGg6ICR7Y2VydFBhdGh9YCk7XG4gICAgLy8gV3JpdGUgdGhlIGNlcnRpZmljYXRlIGRhdGEgb24gdGhpcyBmaWxlLlxuICAgIHdyaXRlRmlsZVN5bmMoY2VydFBhdGgsIGNlcnREYXRhKTtcblxuICAgIC8vIFRydXN0IHRoZSByZW1vdGUgY2VydCBvbiB5b3VyIGxvY2FsIGJveFxuICAgIGF3YWl0IGN1cnJlbnRQbGF0Zm9ybS5hZGRUb1RydXN0U3RvcmVzKGNlcnRQYXRoKTtcbiAgICBkZWJ1ZygnQ2VydGlmaWNhdGUgdHJ1c3RlZCBzdWNjZXNzZnVsbHknKTtcbiAgICByZXR1cm4geyBtdXN0UmVuZXcgfTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY2xvc2VSZW1vdGVGdW5jKGhvc3RuYW1lLCBwb3J0KTtcbiAgICB0aHJvdyBuZXcgRXJyb3IoZXJyKTtcbiAgfVxufVxuLyoqXG4gKiBUcnVzdCB0aGUgcmVtb3RlIGhvc3RzJ3MgY2VydGlmaWNhdGUgb24gbG9jYWwgbWFjaGluZS5cbiAqIFRoaXMgZnVuY3Rpb24gd291bGQgc3NoIGludG8gdGhlIHJlbW90ZSBob3N0LCBnZXQgdGhlIGNlcnRpZmljYXRlXG4gKiBhbmQgdHJ1c3QgdGhlIGxvY2FsIG1hY2hpbmUgZnJvbSB3aGVyZSB0aGlzIGZ1bmN0aW9uIGlzIGdldHRpbmcgY2FsbGVkIGZyb20uXG4gKiBAcHVibGljXG4gKiBAcGFyYW0gaG9zdG5hbWUgLSBob3N0bmFtZSBvZiB0aGUgcmVtb3RlIG1hY2hpbmVcbiAqIEBwYXJhbSBwb3J0IC0gcG9ydCB0byBjb25uZWN0IHRoZSByZW1vdGUgbWFjaGluZVxuICogQHBhcmFtIGNlcnRQYXRoIC0gZmlsZSBwYXRoIHRvIHN0b3JlIHRoZSBjZXJ0XG4gKiBAcGFyYW0gcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzIC0gdmFsaWQgZGF5cyBiZWZvcmUgcmVuZXdpbmcgdGhlIGNlcnRcbiAqIEBwYXJhbSBsb2dnZXIgLSBPcHRpb25hbCBwYXJhbSBmb3IgZW5hYmxpbmcgbG9nZ2luZyBpbiB0aGUgY29uc3VtaW5nIGFwcHNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRydXN0UmVtb3RlTWFjaGluZShcbiAgaG9zdG5hbWU6IHN0cmluZyxcbiAgY2VydFBhdGg6IHN0cmluZyxcbiAgY29tbW9uTmFtZTogc3RyaW5nLFxuICBwb3J0ID0gREVGQVVMVF9SRU1PVEVfUE9SVCxcbiAgb3B0czogUGFydGlhbDxUcnVzdFJlbW90ZU9wdGlvbnM+ID0ge31cbik6IFByb21pc2U8eyBtdXN0UmVuZXc6IGJvb2xlYW4gfT4ge1xuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLW1pc3VzZWQtcHJvbWlzZXMsIG5vLWFzeW5jLXByb21pc2UtZXhlY3V0b3JcbiAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBvcHRpb25zOiBUcnVzdFJlbW90ZU9wdGlvbnMgPSBPYmplY3QuYXNzaWduKFxuICAgICAge1xuICAgICAgICBhbHRlcm5hdGl2ZU5hbWVzOiBbXSxcbiAgICAgICAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzOiBSRU1BSU5JTkdfQlVTSU5FU1NfREFZU19WQUxJRElUWV9CRUZPUkVfUkVORVcsXG4gICAgICAgIHRydXN0Q2VydHNPblJlbW90ZSxcbiAgICAgICAgY2xvc2VSZW1vdGVTZXJ2ZXJcbiAgICAgIH0sXG4gICAgICBvcHRzXG4gICAgKTtcblxuICAgIGRlYnVnKCdnZXR0aW5nIGxvY2FsIGNlcnQgZGF0YSBmb3IgY29ubmVjdGluZyB0byByZW1vdGUnKTtcbiAgICBjb25zdCB7IGNlcnQsIGtleSB9ID0gYXdhaXQgY2VydGlmaWNhdGVGb3IoXG4gICAgICBjb21tb25OYW1lLFxuICAgICAgb3B0aW9ucy5hbHRlcm5hdGl2ZU5hbWVzIHx8IFtdLFxuICAgICAgeyByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXM6IG9wdGlvbnMucmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzIH0sXG4gICAgICBvcHRpb25zLmNlcnRPcHRpb25zXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZygnaGV5IHRoZXJlJywgY2VydC50b1N0cmluZygpKTtcbiAgICBjb25zdCBsb2dnZXIgPSBvcHRzLmxvZ2dlcjtcbiAgICBfbG9nT3JEZWJ1Zyhsb2dnZXIsICdsb2cnLCBgQ29ubmVjdGluZyB0byByZW1vdGUgaG9zdCAke2hvc3RuYW1lfSB2aWEgc3NoYCk7XG4gICAgLy8gQ29ubmVjdCB0byByZW1vdGUgYm94IHZpYSBzc2guXG4gICAgY29uc3QgY2hpbGQgPSBleGVjYS5zaGVsbChcbiAgICAgIC8vIEBUT0RPIENoYW5nZSB0aGlzIHRvIG5weFxuICAgICAgYHNzaCAke2hvc3RuYW1lfSBucHggbWlrZS1ub3J0aC9kZXZjZXJ0I3N1Y2hpdGEvcmVtb3RlLWNvbm5lY3QgcmVtb3RlIC0tcG9ydD0ke3BvcnR9IC0tY2VydD0ke2NlcnQudG9TdHJpbmcoKX0gLS1rZXk9JHtrZXkudG9TdHJpbmcoKX1gLFxuICAgICAge1xuICAgICAgICBkZXRhY2hlZDogZmFsc2VcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gVGhyb3cgYW55IGVycm9yIHRoYXQgbWlnaHQgaGF2ZSBvY2N1cnJlZCBvbiB0aGUgcmVtb3RlIHNpZGUuXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1taXN1c2VkLXByb21pc2VzXG4gICAgaWYgKGNoaWxkICYmIGNoaWxkLnN0ZGVycikge1xuICAgICAgY2hpbGQuc3RkZXJyLm9uKCdkYXRhJywgKGRhdGE6IGV4ZWNhLlN0ZElPT3B0aW9uKSA9PiB7XG4gICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgY29uc3Qgc3RkRXJyRGF0YSA9IGRhdGEudG9TdHJpbmcoKS50cmltUmlnaHQoKTtcbiAgICAgICAgICBjb25zb2xlLmxvZygnaGFoYWhhaGEnLCBzdGRFcnJEYXRhKVxuICAgICAgICAgIGlmIChzdGRFcnJEYXRhPy50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdlcnJvcicpKSB7XG4gICAgICAgICAgICBkZWJ1ZygnRXJyb3IgdGhyb3duIG9uIHRoZSByZW1vdGUgc2lkZS4gQ2xvc2luZyBSZW1vdGUgc2VydmVyJyk7XG4gICAgICAgICAgICBjbG9zZVJlbW90ZVNlcnZlcihob3N0bmFtZSwgcG9ydCk7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3Ioc3RkRXJyRGF0YSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gICAgLy8gTGlzdGVuIHRvIHRoZSBzdGRvdXQgc3RyZWFtIGFuZCBkZXRlcm1pbmUgdGhlIGFwcHJvcHJpYXRlIHN0ZXBzLlxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tbWlzdXNlZC1wcm9taXNlc1xuICAgIGlmIChjaGlsZCAmJiBjaGlsZC5zdGRvdXQpIHtcbiAgICAgIF9sb2dPckRlYnVnKFxuICAgICAgICBsb2dnZXIsXG4gICAgICAgICdsb2cnLFxuICAgICAgICBgQXR0ZW1wdGluZyB0byBzdGFydCB0aGUgc2VydmVyIGF0IHBvcnQgJHtwb3J0fS4gVGhpcyBtYXkgdGFrZSBhIHdoaWxlLi4uYFxuICAgICAgKTtcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tbWlzdXNlZC1wcm9taXNlc1xuICAgICAgY2hpbGQuc3Rkb3V0Lm9uKCdkYXRhJywgYXN5bmMgKGRhdGE6IGV4ZWNhLlN0ZElPT3B0aW9uKSA9PiB7XG4gICAgICAgIGNvbnN0IHN0ZG91dERhdGEgPSBkYXRhPy50b1N0cmluZygpLnRyaW1SaWdodCgpO1xuICAgICAgICBpZiAoc3Rkb3V0RGF0YT8uaW5jbHVkZXMoYFNUQVRFOiBSRUFEWV9GT1JfQ09OTkVDVElPTmApKSB7XG4gICAgICAgICAgX2xvZ09yRGVidWcoXG4gICAgICAgICAgICBsb2dnZXIsXG4gICAgICAgICAgICAnbG9nJyxcbiAgICAgICAgICAgIGBDb25uZWN0ZWQgdG8gcmVtb3RlIGhvc3QgJHtob3N0bmFtZX0gdmlhIHNzaCBzdWNjZXNzZnVsbHlgXG4gICAgICAgICAgKTtcbiAgICAgICAgICAvLyBPbmNlIGNlcnRzIGFyZSB0cnVzdGVkLCBjbG9zZSB0aGUgcmVtb3RlIHNlcnZlciBhbmQgY2xlYW51cC5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgbXVzdFJlbmV3ID0gYXdhaXQgX3RydXN0UmVtb3RlTWFjaGluZShcbiAgICAgICAgICAgICAgaG9zdG5hbWUsXG4gICAgICAgICAgICAgIHBvcnQsXG4gICAgICAgICAgICAgIGNlcnRQYXRoLFxuICAgICAgICAgICAgICBvcHRpb25zLnJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5cyB8fFxuICAgICAgICAgICAgICAgIFJFTUFJTklOR19CVVNJTkVTU19EQVlTX1ZBTElESVRZX0JFRk9SRV9SRU5FVyxcbiAgICAgICAgICAgICAgbG9nZ2VyXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLy8gcmV0dXJuIHRoZSBjZXJ0aWZpY2F0ZSByZW5ld2FsIHN0YXRlIHRvIHRoZSBjb25zdW1lciB0byBoYW5kbGUgdGhlXG4gICAgICAgICAgICAvLyByZW5ld2FsIHVzZWNhc2UuXG4gICAgICAgICAgICByZXNvbHZlKHsgbXVzdFJlbmV3IH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNoaWxkLmtpbGwoKTtcbiAgICAgICAgfSBlbHNlIGlmIChzdGRvdXREYXRhPy5pbmNsdWRlcygnUkVNT1RFX0NPTk5FQ1RJT05fQ0xPU0VEJykpIHtcbiAgICAgICAgICBfbG9nT3JEZWJ1Zyhsb2dnZXIsICdsb2cnLCAnUmVtb3RlIHNlcnZlciBjbG9zZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc29sZS5sb2coc3Rkb3V0RGF0YSwgJ2ZnaGZnaGZnaGZnaGZnaGYnKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlamVjdCgnRXJyb3IgZXhlY3V0aW5nIHNoZWxsIGNvbW1hbmQnKTtcbiAgICB9XG4gIH0pO1xufVxuXG4vKipcbiAqIEBwYXJhbSBob3N0bmFtZSAtIGhvc3RuYW1lIG9mIHRoZSByZW1vdGUgbWFjaGluZVxuICogQHBhcmFtIHBvcnQgLSBwb3J0IHRvIGNvbm5lY3QgdGhlIHJlbW90ZSBtYWNoaW5lXG4gKiBAcGFyYW0gY2VydFBhdGggLSBmaWxlIHBhdGggdG8gc3RvcmUgdGhlIGNlcnRcbiAqIEBwYXJhbSByZW5ld2FsQnVmZmVySW5CdXNpbmVzc0RheXMgLSB2YWxpZCBkYXlzIGJlZm9yZSByZW5ld2luZyB0aGUgY2VydFxuICogQHBhcmFtIGxvZ2dlciAtIE9wdGlvbmFsIHBhcmFtIGZvciBlbmFibGluZyBsb2dnaW5nIGluIHRoZSBjb25zdW1pbmcgYXBwc1xuICogQHBhcmFtIHRydXN0Q2VydHNPblJlbW90ZUZ1bmMgLSBmdW5jdGlvbiB0aGF0IGdldHMgdGhlIGNlcnRpZmljYXRlIGZyb20gcmVtb3RlIG1hY2hpbmUgYW5kIHRydXN0cyBpdCBvbiBsb2NhbCBtYWNoaW5lXG4gKiBAcGFyYW0gY2xvc2VSZW1vdGVGdW5jIC0gZnVuY3Rpb24gdGhhdCBjbG9zZXMgdGhlIHJlbW90ZSBtYWNoaW5lIGNvbm5lY3Rpb24uXG4gKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBfdHJ1c3RSZW1vdGVNYWNoaW5lKFxuICBob3N0bmFtZTogc3RyaW5nLFxuICBwb3J0OiBudW1iZXIsXG4gIGNlcnRQYXRoOiBzdHJpbmcsXG4gIHJlbmV3YWxCdWZmZXJJbkJ1c2luZXNzRGF5czogbnVtYmVyLFxuICBsb2dnZXI/OiBMb2dnZXIsXG4gIHRydXN0Q2VydHNPblJlbW90ZUZ1bmMgPSB0cnVzdENlcnRzT25SZW1vdGUsXG4gIGNsb3NlUmVtb3RlRnVuYyA9IGNsb3NlUmVtb3RlU2VydmVyXG4pOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgdHJ5IHtcbiAgICBfbG9nT3JEZWJ1ZyhcbiAgICAgIGxvZ2dlcixcbiAgICAgICdsb2cnLFxuICAgICAgJ0F0dGVtcHRpbmcgdG8gdHJ1c3QgdGhlIHJlbW90ZSBjZXJ0aWZpY2F0ZSBvbiB0aGlzIG1hY2hpbmUnXG4gICAgKTtcbiAgICAvLyBUcnVzdCB0aGUgY2VydHNcbiAgICBjb25zdCB7IG11c3RSZW5ldyB9ID0gYXdhaXQgdHJ1c3RDZXJ0c09uUmVtb3RlRnVuYyhcbiAgICAgIGhvc3RuYW1lLFxuICAgICAgcG9ydCxcbiAgICAgIGNlcnRQYXRoLFxuICAgICAgcmVuZXdhbEJ1ZmZlckluQnVzaW5lc3NEYXlzXG4gICAgKTtcbiAgICBfbG9nT3JEZWJ1Zyhsb2dnZXIsICdsb2cnLCAnQ2VydGlmaWNhdGUgdHJ1c3RlZCBzdWNjZXNzZnVsbHknKTtcbiAgICAvLyByZXR1cm4gdGhlIGNlcnRpZmljYXRlIHJlbmV3YWwgc3RhdGUgdG8gdGhlIGNvbnN1bWVyIHRvIGhhbmRsZSB0aGVcbiAgICAvLyByZW5ld2FsIHVzZWNhc2UuXG4gICAgcmV0dXJuIG11c3RSZW5ldztcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGVycik7XG4gIH0gZmluYWxseSB7XG4gICAgX2xvZ09yRGVidWcobG9nZ2VyLCAnbG9nJywgJ0F0dGVtcHRpbmcgdG8gY2xvc2UgdGhlIHJlbW90ZSBzZXJ2ZXInKTtcbiAgICAvLyBDbG9zZSB0aGUgcmVtb3RlIHNlcnZlciBhbmQgY2xlYW51cCBhbHdheXMuXG4gICAgY29uc3QgcmVtb3RlU2VydmVyUmVzcG9uc2UgPSBhd2FpdCBjbG9zZVJlbW90ZUZ1bmMoaG9zdG5hbWUsIHBvcnQpO1xuICAgIGRlYnVnKHJlbW90ZVNlcnZlclJlc3BvbnNlKTtcbiAgfVxufVxuLyoqXG4gKiBVbnRydXN0IHRoZSBjZXJ0aWZpY2F0ZSBmb3IgYSBnaXZlbiBmaWxlIHBhdGguXG4gKiBAcHVibGljXG4gKiBAcGFyYW0gZmlsZVBhdGggLSBmaWxlIHBhdGggb2YgdGhlIGNlcnRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVudHJ1c3RNYWNoaW5lQnlDZXJ0aWZpY2F0ZShjZXJ0UGF0aDogc3RyaW5nKTogdm9pZCB7XG4gIGN1cnJlbnRQbGF0Zm9ybS5yZW1vdmVGcm9tVHJ1c3RTdG9yZXMoY2VydFBhdGgpO1xufVxuXG4vKipcbiAqIENoZWNrIHdoZXRoZXIgYSBjZXJ0aWZpY2F0ZSB3aXRoIGEgZ2l2ZW4gY29tbW9uX25hbWUgaGFzIGJlZW4gaW5zdGFsbGVkXG4gKlxuICogQHB1YmxpY1xuICogQHBhcmFtIGNvbW1vbk5hbWUgLSBjb21tb25OYW1lIG9mIGNlcnRpZmljYXRlIHdob3NlIGV4aXN0ZW5jZSBpcyBiZWluZyBjaGVja2VkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoYXNDZXJ0aWZpY2F0ZUZvcihjb21tb25OYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIGV4aXN0cyhwYXRoRm9yRG9tYWluKGNvbW1vbk5hbWUsIGBjZXJ0aWZpY2F0ZS5jcnRgKSk7XG59XG5cbi8qKlxuICogR2V0IGEgbGlzdCBvZiBkb21haW5zIHRoYXQgY2VydGlmaWF0ZXMgaGF2ZSBiZWVuIGdlbmVyYXRlZCBmb3JcbiAqIEBhbHBoYVxuICovXG5leHBvcnQgZnVuY3Rpb24gY29uZmlndXJlZERvbWFpbnMoKTogc3RyaW5nW10ge1xuICByZXR1cm4gcmVhZGRpcihkb21haW5zRGlyKTtcbn1cblxuLyoqXG4gKiBSZW1vdmUgYSBjZXJ0aWZpY2F0ZVxuICogQHB1YmxpY1xuICogQHBhcmFtIGNvbW1vbk5hbWUgLSBjb21tb25OYW1lIG9mIGNlcnQgdG8gcmVtb3ZlXG4gKiBAZGVwcmVjYXRlZCBwbGVhc2UgdXNlIHtAbGluayByZW1vdmVBbmRSZXZva2VEb21haW5DZXJ0IHwgcmVtb3ZlQW5kUmV2b2tlRG9tYWluQ2VydH0gdG8gZW5zdXJlIHRoYXQgdGhlIE9wZW5TU0wgY2VydCByZW1vdmFsIGlzIGhhbmRsZWQgcHJvcGVybHlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZURvbWFpbihjb21tb25OYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgcmltcmFmLnN5bmMocGF0aEZvckRvbWFpbihjb21tb25OYW1lKSk7XG59XG5cbi8qKlxuICogUmVtb3ZlIGEgY2VydGlmaWNhdGUgYW5kIHJldm9rZSBpdCBmcm9tIHRoZSBPcGVuU1NMIGNlcnQgZGF0YWJhc2VcbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSBjb21tb25OYW1lIC0gY29tbW9uTmFtZSBvZiBjZXJ0IHRvIHJlbW92ZVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVtb3ZlQW5kUmV2b2tlRG9tYWluQ2VydChcbiAgY29tbW9uTmFtZTogc3RyaW5nXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgZGVidWcoYHJlbW92aW5nIGRvbWFpbiBjZXJ0aWZpY2F0ZSBmb3IgJHtjb21tb25OYW1lfWApO1xuICBjb25zdCBjZXJ0Rm9sZGVyUGF0aCA9IHBhdGhGb3JEb21haW4oY29tbW9uTmFtZSk7XG4gIGNvbnN0IGRvbWFpbkNlcnRQYXRoID0gY2VydFBhdGhGb3JEb21haW4oY29tbW9uTmFtZSk7XG4gIGlmIChleGlzdHNTeW5jKGNlcnRGb2xkZXJQYXRoKSkge1xuICAgIGRlYnVnKGBjZXJ0IGZvdW5kIG9uIGRpc2sgZm9yICR7Y29tbW9uTmFtZX1gKTtcbiAgICAvLyByZXZva2UgdGhlIGNlcnRcbiAgICBkZWJ1ZyhgcmV2b2tpbmcgY2VydCAke2NvbW1vbk5hbWV9YCk7XG4gICAgYXdhaXQgcmV2b2tlRG9tYWluQ2VydGlmaWNhdGUoY29tbW9uTmFtZSk7XG4gICAgLy8gZGVsZXRlIHRoZSBjZXJ0IGZpbGVcbiAgICBkZWJ1ZyhcbiAgICAgIGBkZWxldGluZyBjZXJ0IG9uIGRpc2sgZm9yICR7Y29tbW9uTmFtZX0gLSAke1xuICAgICAgICBzdGF0U3luYyhkb21haW5DZXJ0UGF0aCkuc2l6ZVxuICAgICAgfWBcbiAgICApO1xuICAgIHJlbW92ZURvbWFpbihjb21tb25OYW1lKTtcbiAgICBkZWJ1ZyhcbiAgICAgIGBkZWxldGVkIGNlcnQgb24gZGlzayBmb3IgJHtjb21tb25OYW1lfSAtICR7ZXhpc3RzU3luYyhkb21haW5DZXJ0UGF0aCl9YFxuICAgICk7XG4gIH0gZWxzZSBkZWJ1ZyhgY2VydCBub3QgZm91bmQgb24gZGlzayAke2NvbW1vbk5hbWV9YCk7XG4gIGRlYnVnKGBjb21wbGV0ZWQgcmVtb3ZpbmcgZG9tYWluIGNlcnRpZmljYXRlIGZvciAke2NvbW1vbk5hbWV9YCk7XG59XG4iXX0=