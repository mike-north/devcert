const yargs = require('yargs');
const addRemoteCommand = require('./commands/remote');

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function main(_args) {
  let program = yargs
    .parserConfiguration({
      'strip-dashed': true,
      'strip-aliased': true
    })
    .pkgConf('devcert');
  program = addRemoteCommand(program);

  program
    .help()
    .showHelpOnFail(true)
    .command('*', false, {}, () => {
      program.showHelp();
      program.exit(1, new Error('unrecognized command'));
    })
    .demandCommand(1, 'you must specify which command to invoke')
    .wrap(null).argv;
}
