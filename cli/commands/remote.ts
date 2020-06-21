import * as yargs from 'yargs';
import { rootCACertPath } from '../../src/constants';
import express = require('express');
import * as fs from 'fs';

function addRemoteCommand(y: yargs.Argv<{}>): yargs.Argv<{}> {
  return y.command(
    'remote',
    'connect to remote server',
    yarg => {
      yarg.option('port', {
        describe: 'port number where the remote host should be connected',
        default: 3000
      });
    },
    argv => {
      const { port } = argv;
      if (port) {
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
  );
}

export default addRemoteCommand;
