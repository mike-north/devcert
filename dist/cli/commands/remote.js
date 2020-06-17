"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const constants_1 = require("../../src/constants");
const express = require("express");
const fs = require("fs");
function addCleanCommand(y) {
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
exports.default = addCleanCommand;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlLmpzIiwic291cmNlUm9vdCI6Ii4vIiwic291cmNlcyI6WyJjbGkvY29tbWFuZHMvcmVtb3RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0EsbURBQXFEO0FBQ3JELG1DQUFvQztBQUNwQyx5QkFBeUI7QUFFekIsU0FBUyxlQUFlLENBQUMsQ0FBaUI7SUFDeEMsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUNkLFFBQVEsRUFDUiwwQkFBMEIsRUFDMUIsSUFBSSxDQUFDLEVBQUU7UUFDTCxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRTtZQUNsQixRQUFRLEVBQUUsdURBQXVEO1lBQ2pFLE9BQU8sRUFBRSxJQUFJO1NBQ2QsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxFQUNELElBQUksQ0FBQyxFQUFFO1FBQ0wsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQztRQUN0QixJQUFJLElBQUksRUFBRTtZQUNSLE1BQU0sR0FBRyxHQUFHLE9BQU8sRUFBRSxDQUFDO1lBQ3RCLEdBQUcsQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7Z0JBQzVDLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQywwQkFBYyxDQUFDLEVBQUU7b0JBQ2pDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQywwQkFBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7aUJBQ25EO1lBQ0gsQ0FBQyxDQUFDLENBQUM7WUFFSCxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FDbkMsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsSUFBSSxFQUFFLENBQUMsQ0FDL0MsQ0FBQztZQUVGLEdBQUcsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7Z0JBQ3pDLEdBQUcsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztnQkFDM0IsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUU7b0JBQ2hCLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQztnQkFDcEMsQ0FBQyxDQUFDLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztTQUNKO0lBQ0gsQ0FBQyxDQUNGLENBQUM7QUFDSixDQUFDO0FBRUQsa0JBQWUsZUFBZSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgeWFyZ3MgZnJvbSAneWFyZ3MnO1xuaW1wb3J0IHsgcm9vdENBQ2VydFBhdGggfSBmcm9tICcuLi8uLi9zcmMvY29uc3RhbnRzJztcbmltcG9ydCBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuXG5mdW5jdGlvbiBhZGRDbGVhbkNvbW1hbmQoeTogeWFyZ3MuQXJndjx7fT4pOiB5YXJncy5Bcmd2PHt9PiB7XG4gIHJldHVybiB5LmNvbW1hbmQoXG4gICAgJ3JlbW90ZScsXG4gICAgJ2Nvbm5lY3QgdG8gcmVtb3RlIHNlcnZlcicsXG4gICAgeWFyZyA9PiB7XG4gICAgICB5YXJnLm9wdGlvbigncG9ydCcsIHtcbiAgICAgICAgZGVzY3JpYmU6ICdwb3J0IG51bWJlciB3aGVyZSB0aGUgcmVtb3RlIGhvc3Qgc2hvdWxkIGJlIGNvbm5lY3RlZCcsXG4gICAgICAgIGRlZmF1bHQ6IDMwMDBcbiAgICAgIH0pO1xuICAgIH0sXG4gICAgYXJndiA9PiB7XG4gICAgICBjb25zdCB7IHBvcnQgfSA9IGFyZ3Y7XG4gICAgICBpZiAocG9ydCkge1xuICAgICAgICBjb25zdCBhcHAgPSBleHByZXNzKCk7XG4gICAgICAgIGFwcC5nZXQoJy9nZXRSZW1vdGVDZXJ0aWZpY2F0ZScsIChyZXEsIHJlcykgPT4ge1xuICAgICAgICAgIGlmIChmcy5leGlzdHNTeW5jKHJvb3RDQUNlcnRQYXRoKSkge1xuICAgICAgICAgICAgcmVzLnNlbmQoZnMucmVhZEZpbGVTeW5jKHJvb3RDQUNlcnRQYXRoLCAndXRmOCcpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHNlcnZlciA9IGFwcC5saXN0ZW4ocG9ydCwgKCkgPT5cbiAgICAgICAgICBjb25zb2xlLmxvZyhgU2VydmVyIHN0YXJ0ZWQgYXQgcG9ydDogJHtwb3J0fWApXG4gICAgICAgICk7XG5cbiAgICAgICAgYXBwLmdldCgnL2Nsb3NlUmVtb3RlU2VydmVyJywgKHJlcSwgcmVzKSA9PiB7XG4gICAgICAgICAgcmVzLnNlbmQoJ1NlcnZlciBjbG9zaW5nJyk7XG4gICAgICAgICAgc2VydmVyLmNsb3NlKCgpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdQcm9jZXNzIHRlcm1pbmF0ZWQnKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICApO1xufVxuXG5leHBvcnQgZGVmYXVsdCBhZGRDbGVhbkNvbW1hbmQ7XG4iXX0=