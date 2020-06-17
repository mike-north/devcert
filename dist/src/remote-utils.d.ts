/**
 * Returns the remote box's certificate
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 */
export declare function getRemoteCertificate(hostname: string, port: number): Promise<string>;
/**
 * Closes the remote server
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 */
export declare function closeRemoteServer(hostname: string, port: number): Promise<string>;
