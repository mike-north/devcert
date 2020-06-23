/**
 * An interface that allows consuming apps to display logging on their side by
 * passing in the logging mechanism of their choice
 * @public
 */
export interface Logger {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
}
