import { argv } from 'yargs';
import { rootCACertPath } from './constants';
import * as express from 'express';
import * as fs from 'fs';

const app = express();
const port = argv.port;

app.get('/get_remote_certificate', (req, res) => {
  if (fs.existsSync(rootCACertPath)) {
    res.send(fs.readFileSync(rootCACertPath, 'utf8'));
  }
});

const server = app.listen(port, () =>
  console.log(`Server started at port: ${port}`)
);

app.get('/close_remote_server', (req, res) => {
  res.send('Server closing');
  server.close(() => {
    console.log('Process terminated');
  });
});
