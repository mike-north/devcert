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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInNyYy91dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLGlEQUEwRDtBQUMxRCwyQkFBMkI7QUFDM0IscUNBQXFDO0FBQ3JDLDZCQUE2QjtBQUM3Qiw2Q0FBcUM7QUFDckMsK0JBQStCO0FBQy9CLGlDQUFpQztBQUNqQywrQkFBK0I7QUFFL0IsMkNBQXFEO0FBQ3JELDJCQUFnQztBQUVoQyxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsY0FBYyxDQUFDLENBQUM7QUFFMUMsU0FBZ0IsT0FBTyxDQUFDLEdBQVcsRUFBRSxXQUFtQjtJQUN0RCxJQUFJO1FBQ0YsT0FBTyxHQUFHLENBQUMsV0FBVyxHQUFHLEVBQUUsRUFBRTtZQUMzQixLQUFLLEVBQUUsTUFBTTtZQUNiLEdBQUcsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUNoQjtnQkFDRSxRQUFRLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxzQkFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2FBQ3hDLEVBQ0QsT0FBTyxDQUFDLEdBQUcsQ0FDWjtTQUNGLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztLQUNmO0lBQUMsT0FBTyxHQUFHLEVBQUU7UUFDWixNQUFNLElBQUksS0FBSyxDQUFDLHFDQUFxQyxXQUFXLEtBQUssR0FBRyxFQUFFLENBQUMsQ0FBQztLQUM3RTtBQUNILENBQUM7QUFkRCwwQkFjQztBQUVELFNBQWdCLEdBQUcsQ0FBQyxHQUFXLEVBQUUsVUFBMkIsRUFBRTtJQUM1RCxLQUFLLENBQUMsU0FBUyxLQUFLLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUMxQyxPQUFPLHdCQUFRLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO0FBQzNDLENBQUM7QUFIRCxrQkFHQztBQUVELFNBQWdCLFdBQVc7SUFDekIsT0FBTyxJQUFJLE9BQU8sQ0FBQyxPQUFPLENB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QU8sYUFBYSxDQUFDLFVBQVUsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0FBQ3RELENBQUM7QUFKRCw0Q0FJQztBQUVELFNBQWdCLGlCQUFpQixDQUFDLFVBQWtCO0lBQ2xELE1BQU0sQ0FBQyxPQUFPLFVBQVUsS0FBSyxRQUFRLEVBQUUsNkJBQTZCLENBQUMsQ0FBQztJQUN0RSxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsK0JBQStCLENBQUMsQ0FBQztJQUMvRCxPQUFPLGVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0FBQ25ELENBQUM7QUFKRCw4Q0FJQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGV4ZWNTeW5jLCBFeGVjU3luY09wdGlvbnMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCAqIGFzIHRtcCBmcm9tICd0bXAnO1xuaW1wb3J0ICogYXMgY3JlYXRlRGVidWcgZnJvbSAnZGVidWcnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCBzdWRvUHJvbXB0IGZyb20gJ3N1ZG8tcHJvbXB0JztcbmltcG9ydCAqIGFzIGV4ZWNhIGZyb20gJ2V4ZWNhJztcbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgY2hhbGsgZnJvbSAnY2hhbGsnO1xuXG5pbXBvcnQgeyBjb25maWdQYXRoLCBkb21haW5zRGlyIH0gZnJvbSAnLi9jb25zdGFudHMnO1xuaW1wb3J0IHsgZXhpc3RzU3luYyB9IGZyb20gJ2ZzJztcblxuY29uc3QgZGVidWcgPSBjcmVhdGVEZWJ1ZygnZGV2Y2VydDp1dGlsJyk7XG5cbmV4cG9ydCBmdW5jdGlvbiBvcGVuc3NsKGNtZDogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nKTogc3RyaW5nIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gcnVuKGBvcGVuc3NsICR7Y21kfWAsIHtcbiAgICAgIHN0ZGlvOiAncGlwZScsXG4gICAgICBlbnY6IE9iamVjdC5hc3NpZ24oXG4gICAgICAgIHtcbiAgICAgICAgICBSQU5ERklMRTogcGF0aC5qb2luKGNvbmZpZ1BhdGgoJy5ybmQnKSlcbiAgICAgICAgfSxcbiAgICAgICAgcHJvY2Vzcy5lbnZcbiAgICAgIClcbiAgICB9KS50b1N0cmluZygpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYE9wZW5TU0wgZXJyb3JlZCB3aGlsZSBwZXJmb3JtaW5nOiAke2Rlc2NyaXB0aW9ufVxcbiR7ZXJyfWApO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBydW4oY21kOiBzdHJpbmcsIG9wdGlvbnM6IEV4ZWNTeW5jT3B0aW9ucyA9IHt9KTogc3RyaW5nIHtcbiAgZGVidWcoYGV4ZWM6ICR7Y2hhbGsueWVsbG93QnJpZ2h0KGNtZCl9YCk7XG4gIHJldHVybiBleGVjU3luYyhjbWQsIG9wdGlvbnMpLnRvU3RyaW5nKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YWl0Rm9yVXNlcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgIHByb2Nlc3Muc3RkaW4ucmVzdW1lKCk7XG4gICAgcHJvY2Vzcy5zdGRpbi5vbignZGF0YScsIHJlc29sdmUpO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlcG9ydGFibGVFcnJvcihtZXNzYWdlOiBzdHJpbmcpOiBFcnJvciB7XG4gIHJldHVybiBuZXcgRXJyb3IoXG4gICAgYCR7bWVzc2FnZX0gfCBUaGlzIGlzIGEgYnVnIGluIGRldmNlcnQsIHBsZWFzZSByZXBvcnQgdGhlIGlzc3VlIGF0IGh0dHBzOi8vZ2l0aHViLmNvbS9kYXZld2FzbWVyL2RldmNlcnQvaXNzdWVzYFxuICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG1wRGlyKCk6IHRtcC5TeW5jaHJvdW5vdXNSZXN1bHQge1xuICAvLyBkaXNjYXJkRGVzY3JpcHRvciBiZWNhdXNlIHdpbmRvd3MgY29tcGxhaW5zIHRoZSBmaWxlIGlzIGluIHVzZSBpZiB3ZSBjcmVhdGUgYSB0bXAgZmlsZVxuICAvLyBhbmQgdGhlbiBzaGVsbCBvdXQgdG8gYSBwcm9jZXNzIHRoYXQgdHJpZXMgdG8gdXNlIGl0XG4gIHJldHVybiB0bXAuZGlyU3luYyh7IGRpc2NhcmREZXNjcmlwdG9yOiB0cnVlIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3VkbyhjbWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIHN1ZG9Qcm9tcHQuZXhlYyhcbiAgICAgIGNtZCxcbiAgICAgIHsgbmFtZTogJ2RldmNlcnQnIH0sXG4gICAgICAoZXJyOiBFcnJvciB8IG51bGwsIHN0ZG91dDogc3RyaW5nIHwgbnVsbCwgc3RkZXJyOiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gICAgICAgIGNvbnN0IGVycm9yID1cbiAgICAgICAgICBlcnIgfHxcbiAgICAgICAgICAodHlwZW9mIHN0ZGVyciA9PT0gJ3N0cmluZycgJiZcbiAgICAgICAgICAgIHN0ZGVyci50cmltKCkubGVuZ3RoID4gMCAmJlxuICAgICAgICAgICAgbmV3IEVycm9yKHN0ZGVycikpO1xuICAgICAgICBlcnJvciA/IHJlamVjdChlcnJvcikgOiByZXNvbHZlKHN0ZG91dCk7XG4gICAgICB9XG4gICAgKTtcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNTdWRvKCk6IGJvb2xlYW4ge1xuICB0cnkge1xuICAgIGV4ZWNhLnNoZWxsU3luYygnc3VkbyAtbiB0cnVlJyk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBpZiAoIShlICYmIGUuc3RkZXJyLnRyaW0oKSA9PT0gJ3N1ZG86IGEgcGFzc3dvcmQgaXMgcmVxdWlyZWQnKSlcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYFVuZXhwZWN0ZWQgZXJyb3Igd2hpbGUgdHJ5aW5nIHRvIGRldGVjdCBzdWRvIGVsZXZhdGlvbjogJHtlfWBcbiAgICAgICk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5leHBvcnQgZnVuY3Rpb24gcGF0aEZvckRvbWFpbihcbiAgZG9tYWluOiBzdHJpbmcsXG4gIC4uLnBhdGhTZWdtZW50czogc3RyaW5nW11cbik6IHN0cmluZyB7XG4gIGFzc2VydCh0eXBlb2YgZG9tYWluc0RpciA9PT0gJ3N0cmluZycsICdkb21haW5zRGlyIG11c3QgYmUgYSBzdHJpbmcnKTtcbiAgYXNzZXJ0KGRvbWFpbnNEaXIubGVuZ3RoID4gMCwgJ2RvbWFpbnNEaXIgbXVzdCBiZSA+IDAgbGVuZ3RoJyk7XG4gIHJldHVybiBwYXRoLmpvaW4oZG9tYWluc0RpciwgZG9tYWluLCAuLi5wYXRoU2VnbWVudHMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2VydFBhdGhGb3JEb21haW4oY29tbW9uTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgYXNzZXJ0KHR5cGVvZiBjb21tb25OYW1lID09PSAnc3RyaW5nJywgJ2NvbW1vbk5hbWUgbXVzdCBiZSBhIHN0cmluZycpO1xuICBhc3NlcnQoY29tbW9uTmFtZS5sZW5ndGggPiAwLCAnY29tbW9uTmFtZSBtdXN0IGJlID4gMCBsZW5ndGgnKTtcbiAgcmV0dXJuIHBhdGhGb3JEb21haW4oY29tbW9uTmFtZSwgYGNlcnRpZmljYXRlLmNydGApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24ga2V5UGF0aEZvckRvbWFpbihjb21tb25OYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICBhc3NlcnQodHlwZW9mIGNvbW1vbk5hbWUgPT09ICdzdHJpbmcnLCAnY29tbW9uTmFtZSBtdXN0IGJlIGEgc3RyaW5nJyk7XG4gIGFzc2VydChjb21tb25OYW1lLmxlbmd0aCA+IDAsICdjb21tb25OYW1lIG11c3QgYmUgPiAwIGxlbmd0aCcpO1xuICByZXR1cm4gcGF0aEZvckRvbWFpbihjb21tb25OYW1lLCBgcHJpdmF0ZS1rZXkua2V5YCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNDZXJ0aWZpY2F0ZUZvcihjb21tb25OYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgYXNzZXJ0KHR5cGVvZiBjb21tb25OYW1lID09PSAnc3RyaW5nJywgJ2NvbW1vbk5hbWUgbXVzdCBiZSBhIHN0cmluZycpO1xuICBhc3NlcnQoY29tbW9uTmFtZS5sZW5ndGggPiAwLCAnY29tbW9uTmFtZSBtdXN0IGJlID4gMCBsZW5ndGgnKTtcbiAgcmV0dXJuIGV4aXN0c1N5bmMoY2VydFBhdGhGb3JEb21haW4oY29tbW9uTmFtZSkpO1xufVxuIl19