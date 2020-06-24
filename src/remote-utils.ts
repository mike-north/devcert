import fetch from 'node-fetch';
import { rootCACertPath } from '../src/constants';
import { Agent } from 'https';
import * as fs from 'fs';

/**
 * Returns the remote box's certificate
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 *
 * @public
 */
export async function getRemoteCertificate(
  hostname: string,
  port: number
): Promise<string> {
  const agent = new Agent({
    ca: fs.readFileSync(rootCACertPath, { encoding: 'utf-8' })
  });
  const response = await fetch(
    `https://${hostname}:${port}/get_remote_certificate`,
    { agent }
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
    const agent = new Agent({
      ca: fs.readFileSync(rootCACertPath, { encoding: 'utf-8' })
    });
    const response = await fetch(
      `https://${hostname}:${port}/close_remote_server`,
      { agent }
    );
    return await response.text();
  } catch (err) {
    throw new Error(err);
  }
}
