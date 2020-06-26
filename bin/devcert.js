#!/usr/bin/env node
//@ts-check

const { join } = require('path');

require('yargs')
  .commandDir(join(__dirname, '../dist/src/cli/commands'))
  .help().argv;
