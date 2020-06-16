#!/usr/bin/env node
//@ts-check

const yargs = require('yargs');

yargs
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
        require('../dist/remote');
      }
    }
  )
  .help()
  .showHelpOnFail(true)
  .demandCommand(2, 'you must specify which command to invoke')
  .wrap(null).argv;
