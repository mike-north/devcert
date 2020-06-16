import fetch from 'node-fetch';

/**
 * Returns the remote box's certificate
 * @param hostname
 * @param port
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
 * @param hostname
 * @param port
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
    return Promise.resolve(err);
  }
}
