import fetch from 'node-fetch';

/**
 * Returns the remote box's certificate
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 */
export async function getRemoteCertificate(
  hostname: string,
  port: number
): Promise<string> {
  const response = await fetch(
    `http://${hostname}:${port}/getRemoteCertificate`
  );
  return await response.text();
}

/**
 * Closes the remote server
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 *
 * @public
 */
export async function closeRemoteServer(
  hostname: string,
  port: number
): Promise<string> {
  try {
    const response = await fetch(
      `http://${hostname}:${port}/closeRemoteServer`
    );
    return await response.text();
  } catch (err) {
    throw new Error(err);
  }
}
