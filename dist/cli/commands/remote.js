"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const constants_1 = require("../../src/constants");
const express = require("express");
const fs = require("fs");
function addRemoteCommand(y) {
    return y.command('remote', 'connect to remote server', yarg => {
        yarg.option('port', {
            describe: 'port number where the remote host should be connected',
            default: 3000
        });
    }, argv => {
        const { port } = argv;
        if (port) {
            const app = express();
            app.get('/getRemoteCertificate', (req, res) => {
                if (fs.existsSync(constants_1.rootCACertPath)) {
                    res.send(fs.readFileSync(constants_1.rootCACertPath, 'utf8'));
                }
            });
            const server = app.listen(port, () => console.log(`Server started at port: ${port}`));
            app.get('/closeRemoteServer', (req, res) => {
                res.send('Server closing');
                server.close(() => {
                    console.log('Process terminated');
                });
            });
        }
    });
}
exports.default = addRemoteCommand;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlLmpzIiwic291cmNlUm9vdCI6Ii4vIiwic291cmNlcyI6WyJjbGkvY29tbWFuZHMvcmVtb3RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0EsbURBQXFEO0FBQ3JELG1DQUFvQztBQUNwQyx5QkFBeUI7QUFFekIsU0FBUyxnQkFBZ0IsQ0FBQyxDQUFpQjtJQUN6QyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQ2QsUUFBUSxFQUNSLDBCQUEwQixFQUMxQixJQUFJLENBQUMsRUFBRTtRQUNMLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFO1lBQ2xCLFFBQVEsRUFBRSx1REFBdUQ7WUFDakUsT0FBTyxFQUFFLElBQUk7U0FDZCxDQUFDLENBQUM7SUFDTCxDQUFDLEVBQ0QsSUFBSSxDQUFDLEVBQUU7UUFDTCxNQUFNLEVBQUUsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQ3RCLElBQUksSUFBSSxFQUFFO1lBQ1IsTUFBTSxHQUFHLEdBQUcsT0FBTyxFQUFFLENBQUM7WUFDdEIsR0FBRyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtnQkFDNUMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLDBCQUFjLENBQUMsRUFBRTtvQkFDakMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLDBCQUFjLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztpQkFDbkQ7WUFDSCxDQUFDLENBQUMsQ0FBQztZQUVILE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUNuQyxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixJQUFJLEVBQUUsQ0FBQyxDQUMvQyxDQUFDO1lBRUYsR0FBRyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtnQkFDekMsR0FBRyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUMzQixNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRTtvQkFDaEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO2dCQUNwQyxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1NBQ0o7SUFDSCxDQUFDLENBQ0YsQ0FBQztBQUNKLENBQUM7QUFFRCxrQkFBZSxnQkFBZ0IsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIHlhcmdzIGZyb20gJ3lhcmdzJztcbmltcG9ydCB7IHJvb3RDQUNlcnRQYXRoIH0gZnJvbSAnLi4vLi4vc3JjL2NvbnN0YW50cyc7XG5pbXBvcnQgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKTtcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcblxuZnVuY3Rpb24gYWRkUmVtb3RlQ29tbWFuZCh5OiB5YXJncy5Bcmd2PHt9Pik6IHlhcmdzLkFyZ3Y8e30+IHtcbiAgcmV0dXJuIHkuY29tbWFuZChcbiAgICAncmVtb3RlJyxcbiAgICAnY29ubmVjdCB0byByZW1vdGUgc2VydmVyJyxcbiAgICB5YXJnID0+IHtcbiAgICAgIHlhcmcub3B0aW9uKCdwb3J0Jywge1xuICAgICAgICBkZXNjcmliZTogJ3BvcnQgbnVtYmVyIHdoZXJlIHRoZSByZW1vdGUgaG9zdCBzaG91bGQgYmUgY29ubmVjdGVkJyxcbiAgICAgICAgZGVmYXVsdDogMzAwMFxuICAgICAgfSk7XG4gICAgfSxcbiAgICBhcmd2ID0+IHtcbiAgICAgIGNvbnN0IHsgcG9ydCB9ID0gYXJndjtcbiAgICAgIGlmIChwb3J0KSB7XG4gICAgICAgIGNvbnN0IGFwcCA9IGV4cHJlc3MoKTtcbiAgICAgICAgYXBwLmdldCgnL2dldFJlbW90ZUNlcnRpZmljYXRlJywgKHJlcSwgcmVzKSA9PiB7XG4gICAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMocm9vdENBQ2VydFBhdGgpKSB7XG4gICAgICAgICAgICByZXMuc2VuZChmcy5yZWFkRmlsZVN5bmMocm9vdENBQ2VydFBhdGgsICd1dGY4JykpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3Qgc2VydmVyID0gYXBwLmxpc3Rlbihwb3J0LCAoKSA9PlxuICAgICAgICAgIGNvbnNvbGUubG9nKGBTZXJ2ZXIgc3RhcnRlZCBhdCBwb3J0OiAke3BvcnR9YClcbiAgICAgICAgKTtcblxuICAgICAgICBhcHAuZ2V0KCcvY2xvc2VSZW1vdGVTZXJ2ZXInLCAocmVxLCByZXMpID0+IHtcbiAgICAgICAgICByZXMuc2VuZCgnU2VydmVyIGNsb3NpbmcnKTtcbiAgICAgICAgICBzZXJ2ZXIuY2xvc2UoKCkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ1Byb2Nlc3MgdGVybWluYXRlZCcpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGFkZFJlbW90ZUNvbW1hbmQ7XG4iXX0=