"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const tmp = require("tmp");
const createDebug = require("debug");
const path = require("path");
const sudo_prompt_1 = require("sudo-prompt");
const execa = require("execa");
const assert = require("assert");
const chalk = require("chalk");
const constants_1 = require("./constants");
const fs_1 = require("fs");
const debug = createDebug('devcert:util');
function openssl(cmd, description) {
    try {
        return run(`openssl ${cmd}`, {
            stdio: 'pipe',
            env: Object.assign({
                RANDFILE: path.join(constants_1.configPath('.rnd'))
            }, process.env)
        }).toString();
    }
    catch (err) {
        throw new Error(`OpenSSL errored while performing: ${description}\n${err}`);
    }
}
exports.openssl = openssl;
function run(cmd, options = {}) {
    debug(`exec: ${chalk.yellowBright(cmd)}`);
    return child_process_1.execSync(cmd, options).toString();
}
exports.run = run;
function waitForUser() {
    return new Promise(resolve => {
        process.stdin.resume();
        process.stdin.on('data', resolve);
    });
}
exports.waitForUser = waitForUser;
function reportableError(message) {
    return new Error(`${message} | This is a bug in devcert, please report the issue at https://github.com/davewasmer/devcert/issues`);
}
exports.reportableError = reportableError;
function tmpDir() {
    // discardDescriptor because windows complains the file is in use if we create a tmp file
    // and then shell out to a process that tries to use it
    return tmp.dirSync({ discardDescriptor: true });
}
exports.tmpDir = tmpDir;
function sudo(cmd) {
    return new Promise((resolve, reject) => {
        sudo_prompt_1.default.exec(cmd, { name: 'devcert' }, (err, stdout, stderr) => {
            const error = err ||
                (typeof stderr === 'string' &&
                    stderr.trim().length > 0 &&
                    new Error(stderr));
            error ? reject(error) : resolve(stdout);
        });
    });
}
exports.sudo = sudo;
function hasSudo() {
    try {
        execa.shellSync('sudo -n true');
        return true;
    }
    catch (e) {
        if (!(e && e.stderr.trim() === 'sudo: a password is required'))
            throw new Error(`Unexpected error while trying to detect sudo elevation: ${e}`);
        return false;
    }
}
exports.hasSudo = hasSudo;
function pathForDomain(domain, ...pathSegments) {
    assert(typeof constants_1.domainsDir === 'string', 'domainsDir must be a string');
    assert(constants_1.domainsDir.length > 0, 'domainsDir must be > 0 length');
    return path.join(constants_1.domainsDir, domain, ...pathSegments);
}
exports.pathForDomain = pathForDomain;
function certPathForDomain(commonName) {
    assert(typeof commonName === 'string', 'commonName must be a string');
    assert(commonName.length > 0, 'commonName must be > 0 length');
    return pathForDomain(commonName, `certificate.crt`);
}
exports.certPathForDomain = certPathForDomain;
function keyPathForDomain(commonName) {
    assert(typeof commonName === 'string', 'commonName must be a string');
    assert(commonName.length > 0, 'commonName must be > 0 length');
    return pathForDomain(commonName, `private-key.key`);
}
exports.keyPathForDomain = keyPathForDomain;
function hasCertificateFor(commonName) {
    assert(typeof commonName === 'string', 'commonName must be a string');
    assert(commonName.length > 0, 'commonName must be > 0 length');
    return fs_1.existsSync(certPathForDomain(commonName));
}
exports.hasCertificateFor = hasCertificateFor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInV0aWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsaURBQTBEO0FBQzFELDJCQUEyQjtBQUMzQixxQ0FBcUM7QUFDckMsNkJBQTZCO0FBQzdCLDZDQUFxQztBQUNyQywrQkFBK0I7QUFDL0IsaUNBQWlDO0FBQ2pDLCtCQUErQjtBQUUvQiwyQ0FBcUQ7QUFDckQsMkJBQWdDO0FBRWhDLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUUxQyxTQUFnQixPQUFPLENBQUMsR0FBVyxFQUFFLFdBQW1CO0lBQ3RELElBQUk7UUFDRixPQUFPLEdBQUcsQ0FBQyxXQUFXLEdBQUcsRUFBRSxFQUFFO1lBQzNCLEtBQUssRUFBRSxNQUFNO1lBQ2IsR0FBRyxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQ2hCO2dCQUNFLFFBQVEsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLHNCQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7YUFDeEMsRUFDRCxPQUFPLENBQUMsR0FBRyxDQUNaO1NBQ0YsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO0tBQ2Y7SUFBQyxPQUFPLEdBQUcsRUFBRTtRQUNaLE1BQU0sSUFBSSxLQUFLLENBQUMscUNBQXFDLFdBQVcsS0FBSyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0tBQzdFO0FBQ0gsQ0FBQztBQWRELDBCQWNDO0FBRUQsU0FBZ0IsR0FBRyxDQUFDLEdBQVcsRUFBRSxVQUEyQixFQUFFO0lBQzVELEtBQUssQ0FBQyxTQUFTLEtBQUssQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQzFDLE9BQU8sd0JBQVEsQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7QUFDM0MsQ0FBQztBQUhELGtCQUdDO0FBRUQsU0FBZ0IsV0FBVztJQUN6QixPQUFPLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxF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QUFhLENBQUMsVUFBVSxFQUFFLGlCQUFpQixDQUFDLENBQUM7QUFDdEQsQ0FBQztBQUpELDRDQUlDO0FBRUQsU0FBZ0IsaUJBQWlCLENBQUMsVUFBa0I7SUFDbEQsTUFBTSxDQUFDLE9BQU8sVUFBVSxLQUFLLFFBQVEsRUFBRSw2QkFBNkIsQ0FBQyxDQUFDO0lBQ3RFLE1BQU0sQ0FBQyxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDO0lBQy9ELE9BQU8sZUFBVSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFDbkQsQ0FBQztBQUpELDhDQUlDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgZXhlY1N5bmMsIEV4ZWNTeW5jT3B0aW9ucyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0ICogYXMgdG1wIGZyb20gJ3RtcCc7XG5pbXBvcnQgKiBhcyBjcmVhdGVEZWJ1ZyBmcm9tICdkZWJ1Zyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHN1ZG9Qcm9tcHQgZnJvbSAnc3Vkby1wcm9tcHQnO1xuaW1wb3J0ICogYXMgZXhlY2EgZnJvbSAnZXhlY2EnO1xuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBjaGFsayBmcm9tICdjaGFsayc7XG5cbmltcG9ydCB7IGNvbmZpZ1BhdGgsIGRvbWFpbnNEaXIgfSBmcm9tICcuL2NvbnN0YW50cyc7XG5pbXBvcnQgeyBleGlzdHNTeW5jIH0gZnJvbSAnZnMnO1xuXG5jb25zdCBkZWJ1ZyA9IGNyZWF0ZURlYnVnKCdkZXZjZXJ0OnV0aWwnKTtcblxuZXhwb3J0IGZ1bmN0aW9uIG9wZW5zc2woY21kOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcpOiBzdHJpbmcge1xuICB0cnkge1xuICAgIHJldHVybiBydW4oYG9wZW5zc2wgJHtjbWR9YCwge1xuICAgICAgc3RkaW86ICdwaXBlJyxcbiAgICAgIGVudjogT2JqZWN0LmFzc2lnbihcbiAgICAgICAge1xuICAgICAgICAgIFJBTkRGSUxFOiBwYXRoLmpvaW4oY29uZmlnUGF0aCgnLnJuZCcpKVxuICAgICAgICB9LFxuICAgICAgICBwcm9jZXNzLmVudlxuICAgICAgKVxuICAgIH0pLnRvU3RyaW5nKCk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHRocm93IG5ldyBFcnJvcihgT3BlblNTTCBlcnJvcmVkIHdoaWxlIHBlcmZvcm1pbmc6ICR7ZGVzY3JpcHRpb259XFxuJHtlcnJ9YCk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJ1bihjbWQ6IHN0cmluZywgb3B0aW9uczogRXhlY1N5bmNPcHRpb25zID0ge30pOiBzdHJpbmcge1xuICBkZWJ1ZyhgZXhlYzogJHtjaGFsay55ZWxsb3dCcmlnaHQoY21kKX1gKTtcbiAgcmV0dXJuIGV4ZWNTeW5jKGNtZCwgb3B0aW9ucykudG9TdHJpbmcoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdhaXRGb3JVc2VyKCk6IFByb21pc2U8dm9pZD4ge1xuICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgcHJvY2Vzcy5zdGRpbi5yZXN1bWUoKTtcbiAgICBwcm9jZXNzLnN0ZGluLm9uKCdkYXRhJywgcmVzb2x2ZSk7XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVwb3J0YWJsZUVycm9yKG1lc3NhZ2U6IHN0cmluZyk6IEVycm9yIHtcbiAgcmV0dXJuIG5ldyBFcnJvcihcbiAgICBgJHttZXNzYWdlfSB8IFRoaXMgaXMgYSBidWcgaW4gZGV2Y2VydCwgcGxlYXNlIHJlcG9ydCB0aGUgaXNzdWUgYXQgaHR0cHM6Ly9naXRodWIuY29tL2RhdmV3YXNtZXIvZGV2Y2VydC9pc3N1ZXNgXG4gICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0bXBEaXIoKTogdG1wLlN5bmNocm91bm91c1Jlc3VsdCB7XG4gIC8vIGRpc2NhcmREZXNjcmlwdG9yIGJlY2F1c2Ugd2luZG93cyBjb21wbGFpbnMgdGhlIGZpbGUgaXMgaW4gdXNlIGlmIHdlIGNyZWF0ZSBhIHRtcCBmaWxlXG4gIC8vIGFuZCB0aGVuIHNoZWxsIG91dCB0byBhIHByb2Nlc3MgdGhhdCB0cmllcyB0byB1c2UgaXRcbiAgcmV0dXJuIHRtcC5kaXJTeW5jKHsgZGlzY2FyZERlc2NyaXB0b3I6IHRydWUgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdWRvKGNtZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgc3Vkb1Byb21wdC5leGVjKFxuICAgICAgY21kLFxuICAgICAgeyBuYW1lOiAnZGV2Y2VydCcgfSxcbiAgICAgIChlcnI6IEVycm9yIHwgbnVsbCwgc3Rkb3V0OiBzdHJpbmcgfCBudWxsLCBzdGRlcnI6IHN0cmluZyB8IG51bGwpID0+IHtcbiAgICAgICAgY29uc3QgZXJyb3IgPVxuICAgICAgICAgIGVyciB8fFxuICAgICAgICAgICh0eXBlb2Ygc3RkZXJyID09PSAnc3RyaW5nJyAmJlxuICAgICAgICAgICAgc3RkZXJyLnRyaW0oKS5sZW5ndGggPiAwICYmXG4gICAgICAgICAgICBuZXcgRXJyb3Ioc3RkZXJyKSk7XG4gICAgICAgIGVycm9yID8gcmVqZWN0KGVycm9yKSA6IHJlc29sdmUoc3Rkb3V0KTtcbiAgICAgIH1cbiAgICApO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc1N1ZG8oKTogYm9vbGVhbiB7XG4gIHRyeSB7XG4gICAgZXhlY2Euc2hlbGxTeW5jKCdzdWRvIC1uIHRydWUnKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGlmICghKGUgJiYgZS5zdGRlcnIudHJpbSgpID09PSAnc3VkbzogYSBwYXNzd29yZCBpcyByZXF1aXJlZCcpKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgVW5leHBlY3RlZCBlcnJvciB3aGlsZSB0cnlpbmcgdG8gZGV0ZWN0IHN1ZG8gZWxldmF0aW9uOiAke2V9YFxuICAgICAgKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cbmV4cG9ydCBmdW5jdGlvbiBwYXRoRm9yRG9tYWluKFxuICBkb21haW46IHN0cmluZyxcbiAgLi4ucGF0aFNlZ21lbnRzOiBzdHJpbmdbXVxuKTogc3RyaW5nIHtcbiAgYXNzZXJ0KHR5cGVvZiBkb21haW5zRGlyID09PSAnc3RyaW5nJywgJ2RvbWFpbnNEaXIgbXVzdCBiZSBhIHN0cmluZycpO1xuICBhc3NlcnQoZG9tYWluc0Rpci5sZW5ndGggPiAwLCAnZG9tYWluc0RpciBtdXN0IGJlID4gMCBsZW5ndGgnKTtcbiAgcmV0dXJuIHBhdGguam9pbihkb21haW5zRGlyLCBkb21haW4sIC4uLnBhdGhTZWdtZW50cyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjZXJ0UGF0aEZvckRvbWFpbihjb21tb25OYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICBhc3NlcnQodHlwZW9mIGNvbW1vbk5hbWUgPT09ICdzdHJpbmcnLCAnY29tbW9uTmFtZSBtdXN0IGJlIGEgc3RyaW5nJyk7XG4gIGFzc2VydChjb21tb25OYW1lLmxlbmd0aCA+IDAsICdjb21tb25OYW1lIG11c3QgYmUgPiAwIGxlbmd0aCcpO1xuICByZXR1cm4gcGF0aEZvckRvbWFpbihjb21tb25OYW1lLCBgY2VydGlmaWNhdGUuY3J0YCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBrZXlQYXRoRm9yRG9tYWluKGNvbW1vbk5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIGFzc2VydCh0eXBlb2YgY29tbW9uTmFtZSA9PT0gJ3N0cmluZycsICdjb21tb25OYW1lIG11c3QgYmUgYSBzdHJpbmcnKTtcbiAgYXNzZXJ0KGNvbW1vbk5hbWUubGVuZ3RoID4gMCwgJ2NvbW1vbk5hbWUgbXVzdCBiZSA+IDAgbGVuZ3RoJyk7XG4gIHJldHVybiBwYXRoRm9yRG9tYWluKGNvbW1vbk5hbWUsIGBwcml2YXRlLWtleS5rZXlgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc0NlcnRpZmljYXRlRm9yKGNvbW1vbk5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBhc3NlcnQodHlwZW9mIGNvbW1vbk5hbWUgPT09ICdzdHJpbmcnLCAnY29tbW9uTmFtZSBtdXN0IGJlIGEgc3RyaW5nJyk7XG4gIGFzc2VydChjb21tb25OYW1lLmxlbmd0aCA+IDAsICdjb21tb25OYW1lIG11c3QgYmUgPiAwIGxlbmd0aCcpO1xuICByZXR1cm4gZXhpc3RzU3luYyhjZXJ0UGF0aEZvckRvbWFpbihjb21tb25OYW1lKSk7XG59XG4iXX0=