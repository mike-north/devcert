"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const yargs = require("yargs");
const remote_1 = require("./commands/remote");
function main(_args) {
    let program = yargs
        .parserConfiguration({
        'strip-dashed': true,
        'strip-aliased': true
    })
        .pkgConf('devcert');
    program = remote_1.default(program);
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
exports.main = main;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbImNsaS9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUNBLCtCQUErQjtBQUMvQiw4Q0FBaUQ7QUFFakQsU0FBZ0IsSUFBSSxDQUFDLEtBQWU7SUFDbEMsSUFBSSxPQUFPLEdBQW1CLEtBQUs7U0FDaEMsbUJBQW1CLENBQUM7UUFDbkIsY0FBYyxFQUFFLElBQUk7UUFDcEIsZUFBZSxFQUFFLElBQUk7S0FDdEIsQ0FBQztTQUNELE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN0QixPQUFPLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLENBQUM7SUFFcEMsT0FBTztTQUNKLElBQUksRUFBRTtTQUNOLGNBQWMsQ0FBQyxJQUFJLENBQUM7U0FDcEIsT0FBTyxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRTtRQUM1QixPQUFPLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDbkIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsSUFBSSxLQUFLLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO0lBQ3JELENBQUMsQ0FBQztTQUNELGFBQWEsQ0FBQyxDQUFDLEVBQUUsMENBQTBDLENBQUM7U0FDNUQsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQztBQUNyQixDQUFDO0FBbEJELG9CQWtCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIF9jcmVhdGVEZWJ1ZyBmcm9tICdkZWJ1Zyc7XG5pbXBvcnQgKiBhcyB5YXJncyBmcm9tICd5YXJncyc7XG5pbXBvcnQgYWRkUmVtb3RlQ29tbWFuZCBmcm9tICcuL2NvbW1hbmRzL3JlbW90ZSc7XG5cbmV4cG9ydCBmdW5jdGlvbiBtYWluKF9hcmdzOiBzdHJpbmdbXSk6IHZvaWQge1xuICBsZXQgcHJvZ3JhbTogeWFyZ3MuQXJndjx7fT4gPSB5YXJnc1xuICAgIC5wYXJzZXJDb25maWd1cmF0aW9uKHtcbiAgICAgICdzdHJpcC1kYXNoZWQnOiB0cnVlLFxuICAgICAgJ3N0cmlwLWFsaWFzZWQnOiB0cnVlXG4gICAgfSlcbiAgICAucGtnQ29uZignZGV2Y2VydCcpO1xuICBwcm9ncmFtID0gYWRkUmVtb3RlQ29tbWFuZChwcm9ncmFtKTtcblxuICBwcm9ncmFtXG4gICAgLmhlbHAoKVxuICAgIC5zaG93SGVscE9uRmFpbCh0cnVlKVxuICAgIC5jb21tYW5kKCcqJywgZmFsc2UsIHt9LCAoKSA9PiB7XG4gICAgICBwcm9ncmFtLnNob3dIZWxwKCk7XG4gICAgICBwcm9ncmFtLmV4aXQoMSwgbmV3IEVycm9yKCd1bnJlY29nbml6ZWQgY29tbWFuZCcpKTtcbiAgICB9KVxuICAgIC5kZW1hbmRDb21tYW5kKDEsICd5b3UgbXVzdCBzcGVjaWZ5IHdoaWNoIGNvbW1hbmQgdG8gaW52b2tlJylcbiAgICAud3JhcChudWxsKS5hcmd2O1xufVxuIl19