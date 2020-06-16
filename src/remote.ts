import { argv } from 'yargs';
import { rootCACertPath } from './constants';
import express = require('express');
import * as fs from 'fs';

const app = express();
const port = argv.port;

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
