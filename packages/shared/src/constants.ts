/**
 * Shared, single-source-of-truth constants used by BOTH the API and the web app.
 * Keeping these here prevents the front-end and back-end from drifting apart
 * (e.g. the UI offering a page size the API would reject).
 */

/** Minimum number of products returned per page (inclusive). */
export const MIN_PAGE_SIZE = 5;

/** Maximum number of products returned per page (inclusive). */
export const MAX_PAGE_SIZE = 50;

/** Default page size when the client does not specify one. */
export const DEFAULT_PAGE_SIZE = 20;

/** Page-size options surfaced in the UI selector. */
export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;

/**
 * Inactivity window before a session is invalidated, in milliseconds.
 * The server is authoritative (env INACTIVITY_TIMEOUT_MINUTES); the client
 * mirrors this value to proactively log the user out for a snappier UX.
 */
export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
