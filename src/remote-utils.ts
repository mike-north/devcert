import fetch from 'node-fetch';
import { rootCACertPath } from '../src/constants';
import { Agent } from 'https';
import * as fs from 'fs';

/**
 * Returns the agent for fetch requests.
 */
function _getAgent(): Agent {
  if (!fs.existsSync(rootCACertPath)) {
    throw new Error(
      `Public certificate file ${rootCACertPath} does not exist.`
    );
  }
  const rootCACertData = fs.readFileSync(rootCACertPath, { encoding: 'utf-8' });

  return new Agent({
    ca: rootCACertData
  });
}

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
  const response = await fetch(
    `https://${hostname}:${port}/get_remote_certificate`,
    { agent: _getAgent() }
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
      `https://${hostname}:${port}/close_remote_server`,
      { agent: _getAgent() }
    );
    return await response.text();
  } catch (err) {
    throw new Error(
      `The remote devcert server had trouble shutting down.\n${err}`
    );
  }
}
