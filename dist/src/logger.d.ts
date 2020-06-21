/**
 * @public
 */
export interface Logger {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
}
