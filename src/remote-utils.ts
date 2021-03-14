import fetch from 'node-fetch';
import { ROOT_CA_CERT_PATH } from '../src/constants';
import { Agent } from 'https';
import * as fs from 'fs';

/**
 * Returns the agent for fetch requests.
 */
function _getAgent(): Agent {
  if (!fs.existsSync(ROOT_CA_CERT_PATH)) {
    throw new Error(
      `Public certificate file ${ROOT_CA_CERT_PATH} does not exist.`
    );
  }
  const rootCACertData = fs.readFileSync(ROOT_CA_CERT_PATH, {
    encoding: 'utf-8'
  });

  return new Agent({
    ca: rootCACertData
  });
}

let _AGENT: Agent | null;

function getAgent(): Agent {
  if (!_AGENT) _AGENT = _getAgent();
  return _AGENT;
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
    { agent: getAgent() }
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
      { agent: getAgent() }
    );
    return await response.text();
  } catch (err) {
    throw new Error(
      `The remote devcert server had trouble shutting down.\n${err}`
    );
  }
}
