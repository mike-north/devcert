/**
 * Returns the remote box's certificate
 * @param hostname
 * @param port
 */
export declare function getRemoteCertificate(hostname: string, port: number): Promise<string>;
/**
 * Closes the remote server
 * @param hostname
 * @param port
 */
export declare function closeRemoteServer(hostname: string, port: number): Promise<string>;
