/**
 * @packageDocumentation
 * Utilities for safely generating locally-trusted and machine-specific X.509 certificates for local development
 */
/// <reference types="node" />
import { uninstall } from './certificate-authority';
import { UserInterface } from './user-interface';
export { uninstall, UserInterface };
/**
 * Certificate options
 * @public
 */
export interface CertOptions {
    /** Number of days before the CA expires */
    caCertExpiry: number;
    /** Number of days before the domain certificate expires */
    domainCertExpiry: number;
}
/**
 * Cert generation options
 *
 * @public
 */
export interface Options {
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
 * The CA public key as a buffer
 * @public
 */
export interface CaBuffer {
    /** CA public key */
    ca: Buffer;
}
/**
 * The cert authority's path on disk
 * @public
 */
export interface CaPath {
    /** CA cert path on disk */
    caPath: string;
}
/**
 * Domain cert public and private keys as buffers
 * @public
 */
export interface DomainData {
    /** private key */
    key: Buffer;
    /** public key (cert) */
    cert: Buffer;
}
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
 * Untrust the certificate for a given file path.
 * @public
 * @param filePath - file path of the cert
 */
export declare function untrustMachine(filePath: string): void;
/**
 * Check whether a certificate with a given common_name has been installed
 *
 * @public
 * @param commonName - commonName of certificate whose existence is being checked
 */
export declare function hasCertificateFor(commonName: string): boolean;
/**
 * Get a list of domains that certifiates have been generated for
 * @alpha
 */
export declare function configuredDomains(): string[];
/**
 * Remove a certificate
 * @public
 * @param commonName - commonName of cert to remove
 * @deprecated please use {@link removeAndRevokeDomainCert | removeAndRevokeDomainCert} to ensure that the OpenSSL cert removal is handled properly
 */
export declare function removeDomain(commonName: string): void;
/**
 * Remove a certificate and revoke it from the OpenSSL cert database
 * @public
 * @param commonName - commonName of cert to remove
 */
export declare function removeAndRevokeDomainCert(commonName: string): Promise<void>;
