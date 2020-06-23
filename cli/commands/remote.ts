import * as yargs from 'yargs';
import { rootCACertPath, DEFAULT_REMOTE_PORT } from '../../src/constants';
import * as express from 'express';
import * as https from 'https';
import * as fs from 'fs';

function assertIsPositiveInteger(
  arg: unknown,
  label: string
): asserts arg is number {
  if (
    typeof arg !== 'number' &&
    arg !== parseInt('' + arg) &&
    typeof arg === 'number' &&
    arg <= 0
  )
    throw new Error(
      `expected ${label} to be a positive integer. Found: ${JSON.stringify(
        arg
      )}`
    );
}

function assertIsString(arg: unknown, label: string): asserts arg is string {
  if (typeof arg !== 'string')
    throw new Error(
      `expected ${label} to be a string. Found: ${JSON.stringify(arg)}`
    );
}

function addRemoteCommand(y: yargs.Argv<{}>): yargs.Argv<{}> {
  return y.command(
    'remote',
    'connect to the remote machine to facilitate trusting the certs',
    yarg => {
      yarg.option('port', {
        describe: 'port number where the remote host should be connected',
        default: DEFAULT_REMOTE_PORT
      });
      yarg.option('cert', {
        describe: 'certificate details',
        required: true
      });
      yarg.option('key', {
        describe: 'private key details',
        required: true
      });
    },
    argv => {
      const { port, cert, key } = argv;
      console.log('the redatatatata', cert)
      assertIsPositiveInteger(port, 'port');
      assertIsString(cert, 'cert');
      assertIsString(key, 'key');
      const app = express();
      const credentials = { key, cert };
      console.log('ceredentialsss', key);
      app.get('/get_remote_certificate', (req, res) => {
        if (fs.existsSync(rootCACertPath)) {
          res.send(fs.readFileSync(rootCACertPath, 'utf8'));
        }
      });

      const httpsServer = https.createServer(credentials, app);
      const server = httpsServer.listen(port, () =>
        console.log(`Server started at port: ${port}\n
        ---\n
        STATE: READY_FOR_CONNECTION\n
        ---\n`)
      );

      app.get('/close_remote_server', (req, res) => {
        res.send(`Closing remote server`);
        server.close(() => {
          console.log(`Remote server closed successfully\n
          ---\n
          STATE: REMOTE_CONNECTION_CLOSED\n
          ---\n`);
        });
      });
    }
  );
}

export default addRemoteCommand;
