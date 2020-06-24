/**
 * An interface that allows consuming apps to display logging on their side by
 * passing in the logging mechanism of their choice
 * @public
 */
export interface Logger {
    /**
     * info logging
     */
    log: typeof console.log;
    /**
     * warn logging
     */
    warn: typeof console.warn;
    /**
     * error logging
     */
    error: typeof console.error;
}
