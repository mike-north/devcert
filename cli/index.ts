import * as _createDebug from 'debug';
import * as yargs from 'yargs';
import addRemoteCommand from './commands/remote';

export function main(_args: string[]): void {
  let program: yargs.Argv<{}> = yargs
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
