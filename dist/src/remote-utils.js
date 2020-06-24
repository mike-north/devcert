"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = require("node-fetch");
const constants_1 = require("../src/constants");
const https_1 = require("https");
const fs = require("fs");
/**
 * Returns the remote box's certificate
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 *
 * @public
 */
async function getRemoteCertificate(hostname, port) {
    const agent = new https_1.Agent({
        ca: fs.readFileSync(constants_1.rootCACertPath, { encoding: 'utf-8' })
    });
    const response = await node_fetch_1.default(`https://${hostname}:${port}/get_remote_certificate`, { agent });
    return await response.text();
}
exports.getRemoteCertificate = getRemoteCertificate;
/**
 * Closes the remote server
 * @param hostname - hostname of the remote machine
 * @param port - port to connect the remote machine
 *
 * @public
 */
async function closeRemoteServer(hostname, port) {
    try {
        const agent = new https_1.Agent({
            ca: fs.readFileSync(constants_1.rootCACertPath, { encoding: 'utf-8' })
        });
        const response = await node_fetch_1.default(`https://${hostname}:${port}/close_remote_server`, { agent });
        return await response.text();
    }
    catch (err) {
        throw new Error(err);
    }
}
exports.closeRemoteServer = closeRemoteServer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlLXV0aWxzLmpzIiwic291cmNlUm9vdCI6Ii4vIiwic291cmNlcyI6WyJzcmMvcmVtb3RlLXV0aWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsMkNBQStCO0FBQy9CLGdEQUFrRDtBQUNsRCxpQ0FBOEI7QUFDOUIseUJBQXlCO0FBRXpCOzs7Ozs7R0FNRztBQUNJLEtBQUssVUFBVSxvQkFBb0IsQ0FDeEMsUUFBZ0IsRUFDaEIsSUFBWTtJQUVaLE1BQU0sS0FBSyxHQUFHLElBQUksYUFBSyxDQUFDO1FBQ3RCLEVBQUUsRUFBRSxFQUFFLENBQUMsWUFBWSxDQUFDLDBCQUFjLEVBQUUsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLENBQUM7S0FDM0QsQ0FBQyxDQUFDO0lBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxvQkFBSyxDQUMxQixXQUFXLFFBQVEsSUFBSSxJQUFJLHlCQUF5QixFQUNwRCxFQUFFLEtBQUssRUFBRSxDQUNWLENBQUM7SUFDRixPQUFPLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO0FBQy9CLENBQUM7QUFaRCxvREFZQztBQUVEOzs7Ozs7R0FNRztBQUNJLEtBQUssVUFBVSxpQkFBaUIsQ0FDckMsUUFBZ0IsRUFDaEIsSUFBWTtJQUVaLElBQUk7UUFDRixNQUFNLEtBQUssR0FBRyxJQUFJLGFBQUssQ0FBQztZQUN0QixFQUFFLEVBQUUsRUFBRSxDQUFDLFlBQVksQ0FBQywwQkFBYyxFQUFFLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDO1NBQzNELENBQUMsQ0FBQztRQUNILE1BQU0sUUFBUSxHQUFHLE1BQU0sb0JBQUssQ0FDMUIsV0FBVyxRQUFRLElBQUksSUFBSSxzQkFBc0IsRUFDakQsRUFBRSxLQUFLLEVBQUUsQ0FDVixDQUFDO1FBQ0YsT0FBTyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztLQUM5QjtJQUFDLE9BQU8sR0FBRyxFQUFFO1FBQ1osTUFBTSxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztLQUN0QjtBQUNILENBQUM7QUFoQkQsOENBZ0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGZldGNoIGZyb20gJ25vZGUtZmV0Y2gnO1xuaW1wb3J0IHsgcm9vdENBQ2VydFBhdGggfSBmcm9tICcuLi9zcmMvY29uc3RhbnRzJztcbmltcG9ydCB7IEFnZW50IH0gZnJvbSAnaHR0cHMnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuXG4vKipcbiAqIFJldHVybnMgdGhlIHJlbW90ZSBib3gncyBjZXJ0aWZpY2F0ZVxuICogQHBhcmFtIGhvc3RuYW1lIC0gaG9zdG5hbWUgb2YgdGhlIHJlbW90ZSBtYWNoaW5lXG4gKiBAcGFyYW0gcG9ydCAtIHBvcnQgdG8gY29ubmVjdCB0aGUgcmVtb3RlIG1hY2hpbmVcbiAqXG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRSZW1vdGVDZXJ0aWZpY2F0ZShcbiAgaG9zdG5hbWU6IHN0cmluZyxcbiAgcG9ydDogbnVtYmVyXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCBhZ2VudCA9IG5ldyBBZ2VudCh7XG4gICAgY2E6IGZzLnJlYWRGaWxlU3luYyhyb290Q0FDZXJ0UGF0aCwgeyBlbmNvZGluZzogJ3V0Zi04JyB9KVxuICB9KTtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChcbiAgICBgaHR0cHM6Ly8ke2hvc3RuYW1lfToke3BvcnR9L2dldF9yZW1vdGVfY2VydGlmaWNhdGVgLFxuICAgIHsgYWdlbnQgfVxuICApO1xuICByZXR1cm4gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xufVxuXG4vKipcbiAqIENsb3NlcyB0aGUgcmVtb3RlIHNlcnZlclxuICogQHBhcmFtIGhvc3RuYW1lIC0gaG9zdG5hbWUgb2YgdGhlIHJlbW90ZSBtYWNoaW5lXG4gKiBAcGFyYW0gcG9ydCAtIHBvcnQgdG8gY29ubmVjdCB0aGUgcmVtb3RlIG1hY2hpbmVcbiAqXG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjbG9zZVJlbW90ZVNlcnZlcihcbiAgaG9zdG5hbWU6IHN0cmluZyxcbiAgcG9ydDogbnVtYmVyXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICB0cnkge1xuICAgIGNvbnN0IGFnZW50ID0gbmV3IEFnZW50KHtcbiAgICAgIGNhOiBmcy5yZWFkRmlsZVN5bmMocm9vdENBQ2VydFBhdGgsIHsgZW5jb2Rpbmc6ICd1dGYtOCcgfSlcbiAgICB9KTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKFxuICAgICAgYGh0dHBzOi8vJHtob3N0bmFtZX06JHtwb3J0fS9jbG9zZV9yZW1vdGVfc2VydmVyYCxcbiAgICAgIHsgYWdlbnQgfVxuICAgICk7XG4gICAgcmV0dXJuIGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGVycik7XG4gIH1cbn1cbiJdfQ==