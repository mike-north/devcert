import { CertOptions } from './index';
/**
 * Generate a domain certificate signed by the devcert root CA. Domain
 * certificates are cached in their own directories under
 * CONFIG_ROOT/domains/<domain>, and reused on subsequent requests. Because the
 * individual domain certificates are signed by the devcert root CA (which was
 * added to the OS/browser trust stores), they are trusted.
 */
export declare function generateDomainCertificate(commonName: string, alternativeNames: string[], certOptions: CertOptions): Promise<void>;
/**
 * Revokes a domain certificate signed by the devcert root CA and deletes it.
 */
export declare function revokeDomainCertificate(commonName: string): Promise<void>;
export declare function generateKey(filename: string): void;
