/**
 * @packageDocumentation
 * Utilities for safely generating locally-trusted and machine-specific X.509 certificates for local development
 */

/// <reference types="node" />

/**
 * The CA public key as a buffer
 * @public
 */
export declare interface CaBuffer {
    /** CA public key */
    ca: Buffer;
}

/**
 * The cert authority's path on disk
 * @public
 */
export declare interface CaPath {
    /** CA cert path on disk */
    caPath: string;
}

/**
 * Request an SSL certificate for the given app name signed by the devcert root
 * certificate authority. If devcert has previously generated a certificate for
 * that app name on this machine, it will reuse that certificate.
 *
 * If this is the first time devcert is being run on this machine, it will
 * generate and attempt to install a root certificate authority.
 *
 * If `options.getCaBuffer` is true, return value will include the ca certificate data
 * as \{ ca: Buffer \}
 *
 * If `options.getCaPath` is true, return value will include the ca certificate path
 * as \{ caPath: string \}
 *
 * @public
 * @param commonName - common name for certificate
 * @param alternativeNames - alternate names for the certificate
 * @param options - cert generation options
 * @param partialCertOptions - certificate options
 */
export declare function certificateFor<O extends Options, CO extends Partial<CertOptions>>(commonName: string, alternativeNames: string[], options?: O, partialCertOptions?: CO): Promise<IReturnData<O>>;

/**
 * {@inheritdoc (certificateFor:1)}
 * @public
 */
export declare function certificateFor<O extends Options, CO extends Partial<CertOptions>>(commonName: string, options?: O, partialCertOptions?: CO): Promise<IReturnData<O>>;

/**
 * Certificate options
 * @public
 */
export declare interface CertOptions {
    /** Number of days before the CA expires */
    caCertExpiry: number;
    /** Number of days before the domain certificate expires */
    domainCertExpiry: number;
}

/**
 * Closes the remote server
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 */
declare function closeRemoteServer(hostname: string, port: number): Promise<string>;

/**
 * Get a list of domains that certifiates have been generated for
 * @alpha
 */
export declare function configuredDomains(): string[];

/**
 * Domain cert public and private keys as buffers
 * @public
 */
export declare interface DomainData {
    /** private key */
    key: Buffer;
    /** public key (cert) */
    cert: Buffer;
}

/**
 * Get the expiration and recommended renewal dates, for the latest issued
 * cert for a given common_name
 *
 * @alpha
 * @param commonName - common_name of cert whose expiration info is desired
 * @param renewalBufferInBusinessDays - number of business days before cert expiration, to start indicating that it should be renewed
 */
export declare function getCertExpirationInfo(commonName: string, renewalBufferInBusinessDays?: number): {
    mustRenew: boolean;
    renewBy: Date;
    expireAt: Date;
};

/**
 * Returns the remote box's certificate
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 */
declare function getRemoteCertificate(hostname: string, port: number): Promise<string>;

/**
 * Check whether a certificate with a given common_name has been installed
 *
 * @public
 * @param commonName - commonName of certificate whose existence is being checked
 */
export declare function hasCertificateFor(commonName: string): boolean;

/**
 * A return value containing the CA public key
 * @public
 */
export declare type IReturnCa<O extends Options> = O['getCaBuffer'] extends true ? CaBuffer : false;

/**
 * A return value containing the CA path on disk
 * @public
 */
export declare type IReturnCaPath<O extends Options> = O['getCaPath'] extends true ? CaPath : false;

/**
 * A return value containing the CA public key, CA path on disk, and domain cert info
 * @public
 */
export declare type IReturnData<O extends Options = {}> = DomainData & IReturnCa<O> & IReturnCaPath<O>;

/**
 * Cert generation options
 *
 * @public
 */
export declare interface Options {
    /** Return the CA certificate data? */
    getCaBuffer?: boolean;
    /** Return the path to the CA certificate? */
    getCaPath?: boolean;
    /** If `certutil` is not installed already (for updating nss databases; e.g. firefox), do not attempt to install it */
    skipCertutilInstall?: boolean;
    /** Do not update your systems host file with the domain name of the certificate */
    skipHostsFile?: boolean;
    /** User interface hooks */
    ui?: UserInterface;
    /** Number of business days before domain cert expiry before automatic revoke and renew */
    renewalBufferInBusinessDays?: number;
}

/**
 * Remove a certificate and revoke it from the OpenSSL cert database
 * @public
 * @param commonName - commonName of cert to remove
 */
export declare function removeAndRevokeDomainCert(commonName: string): Promise<void>;

/**
 * Remove a certificate
 * @public
 * @param commonName - commonName of cert to remove
 * @deprecated please use {@link removeAndRevokeDomainCert | removeAndRevokeDomainCert} to ensure that the OpenSSL cert removal is handled properly
 */
export declare function removeDomain(commonName: string): void;

/**
 * Trust the certificate for a given hostname and port and add
 * the returned cert to the local trust store.
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 * @param certPath - file path to store the cert
 */
declare function trustCertsOnRemote(hostname: string, port: number, certPath: string, renewalBufferInBusinessDays: number, getRemoteCertsFunc?: typeof getRemoteCertificate, closeRemoteFunc?: typeof closeRemoteServer): Promise<{
    mustRenew: boolean;
}>;

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
export declare function trustRemoteMachine(hostname: string, port: number, certPath: string, renewalBufferInBusinessDays?: number): Promise<boolean>;

/**
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 * @param certPath - file path to store the cert
 * @param renewalBufferInBusinessDays - valid days before renewing the cert
 * @param trustCertsOnRemoteFunc - function that gets the certificate from remote machine and trusts it on local machine
 * @param closeRemoteFunc - function that closes the remote machine connection.
 *
 * @private
 * @internal
 */
export declare function _trustRemoteMachine(hostname: string, port: number, certPath: string, renewalBufferInBusinessDays: number, trustCertsOnRemoteFunc?: typeof trustCertsOnRemote, closeRemoteFunc?: typeof closeRemoteServer): Promise<boolean>;

/**
 * Remove as much of the devcert files and state as we can. This is necessary
 * when generating a new root certificate, and should be available to API
 * consumers as well.
 *
 * Not all of it will be removable. If certutil is not installed, we'll leave
 * Firefox alone. We try to remove files with maximum permissions, and if that
 * fails, we'll silently fail.
 *
 * It's also possible that the command to untrust will not work, and we'll
 * silently fail that as well; with no existing certificates anymore, the
 * security exposure there is minimal.
 *
 * @public
 */
export declare function uninstall(): void;

/**
 * Untrust the certificate for a given file path.
 * @public
 * @param filePath - file path of the cert
 */
export declare function untrustMachine(filePath: string): void;

/**
 * A representation of several parts of the local system that the user interacts with
 * @public
 */
export declare interface UserInterface {
    /** Get the disk encryption password (windows only) */
    getWindowsEncryptionPassword(): string | Promise<string>;
    /** Deliver a warning to the user without using certutil (linux only) */
    warnChromeOnLinuxWithoutCertutil(): void | Promise<void>;
    /** Close firefox */
    closeFirefoxBeforeContinuing(): void | Promise<void>;
    /** Begin the process of approving a cert through firefix */
    startFirefoxWizard(certificateHost: string): void | Promise<void>;
    /** Load the cert approval page in the user's local firefox */
    firefoxWizardPromptPage(certificateURL: string): string | Promise<string>;
    /** Wait for the user to complete the firefox cert approval wizard */
    waitForFirefoxWizard(): void | Promise<void>;
}

export { }
