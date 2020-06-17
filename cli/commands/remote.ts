import * as yargs from 'yargs';
import { rootCACertPath } from '../../src/constants';
import express = require('express');
import * as fs from 'fs';

function addCleanCommand(y: yargs.Argv<{}>): yargs.Argv<{}> {
  return y
    .command(
      'remote [hostname]',
      'connect to remote server',
      yarg => {
        yarg
          .positional('hostname', {
            describe: 'hostname of remote machine'
          })
          .option('port', {
            describe: 'port number where the remote host should be connected',
            default: 3000
          });
      },
      argv => {
        const { hostname, port } = argv;
        if (hostname && port) {
          const app = express();
          app.get('/getRemoteCertificate', (req, res) => {
            if (fs.existsSync(rootCACertPath)) {
              res.send(fs.readFileSync(rootCACertPath, 'utf8'));
            }
          });

          const server = app.listen(port, () =>
            console.log(`Server started at port: ${port}`)
          );

          app.get('/closeRemoteServer', (req, res) => {
            res.send('Server closing');
            server.close(() => {
              console.log('Process terminated');
            });
          });
        }
      }
    )
    .check(({ hostname }) => {
      if (!hostname || (typeof hostname === 'string' && !hostname.trim())) {
        throw new Error('hostname is required');
      }
      return true;
    });
}

export default addCleanCommand;
