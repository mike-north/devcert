"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const constants_1 = require("../../src/constants");
const express = require("express");
const fs = require("fs");
function addCleanCommand(y) {
    return y.command('remote', 'connect to remote server', {}, argv => {
        const app = express();
        const port = argv.port;
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
    });
}
exports.default = addCleanCommand;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlLmpzIiwic291cmNlUm9vdCI6Ii4vIiwic291cmNlcyI6WyJjbGkvY29tbWFuZHMvcmVtb3RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0EsbURBQXFEO0FBQ3JELG1DQUFvQztBQUNwQyx5QkFBeUI7QUFFekIsU0FBUyxlQUFlLENBQUMsQ0FBaUI7SUFDeEMsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSwwQkFBMEIsRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUU7UUFDaEUsTUFBTSxHQUFHLEdBQUcsT0FBTyxFQUFFLENBQUM7UUFDdEIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztRQUV2QixHQUFHLENBQUMsR0FBRyxDQUFDLHVCQUF1QixFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFO1lBQzVDLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQywwQkFBYyxDQUFDLEVBQUU7Z0JBQ2pDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQywwQkFBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7YUFDbkQ7UUFDSCxDQUFDLENBQUMsQ0FBQztRQUVILE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUNuQyxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixJQUFJLEVBQUUsQ0FBQyxDQUMvQyxDQUFDO1FBRUYsR0FBRyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtZQUN6QyxHQUFHLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7WUFDM0IsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUU7Z0JBQ2hCLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQztZQUNwQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQsa0JBQWUsZUFBZSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgeWFyZ3MgZnJvbSAneWFyZ3MnO1xuaW1wb3J0IHsgcm9vdENBQ2VydFBhdGggfSBmcm9tICcuLi8uLi9zcmMvY29uc3RhbnRzJztcbmltcG9ydCBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuXG5mdW5jdGlvbiBhZGRDbGVhbkNvbW1hbmQoeTogeWFyZ3MuQXJndjx7fT4pOiB5YXJncy5Bcmd2PHt9PiB7XG4gIHJldHVybiB5LmNvbW1hbmQoJ3JlbW90ZScsICdjb25uZWN0IHRvIHJlbW90ZSBzZXJ2ZXInLCB7fSwgYXJndiA9PiB7XG4gICAgY29uc3QgYXBwID0gZXhwcmVzcygpO1xuICAgIGNvbnN0IHBvcnQgPSBhcmd2LnBvcnQ7XG5cbiAgICBhcHAuZ2V0KCcvZ2V0UmVtb3RlQ2VydGlmaWNhdGUnLCAocmVxLCByZXMpID0+IHtcbiAgICAgIGlmIChmcy5leGlzdHNTeW5jKHJvb3RDQUNlcnRQYXRoKSkge1xuICAgICAgICByZXMuc2VuZChmcy5yZWFkRmlsZVN5bmMocm9vdENBQ2VydFBhdGgsICd1dGY4JykpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2VydmVyID0gYXBwLmxpc3Rlbihwb3J0LCAoKSA9PlxuICAgICAgY29uc29sZS5sb2coYFNlcnZlciBzdGFydGVkIGF0IHBvcnQ6ICR7cG9ydH1gKVxuICAgICk7XG5cbiAgICBhcHAuZ2V0KCcvY2xvc2VSZW1vdGVTZXJ2ZXInLCAocmVxLCByZXMpID0+IHtcbiAgICAgIHJlcy5zZW5kKCdTZXJ2ZXIgY2xvc2luZycpO1xuICAgICAgc2VydmVyLmNsb3NlKCgpID0+IHtcbiAgICAgICAgY29uc29sZS5sb2coJ1Byb2Nlc3MgdGVybWluYXRlZCcpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5leHBvcnQgZGVmYXVsdCBhZGRDbGVhbkNvbW1hbmQ7XG4iXX0=