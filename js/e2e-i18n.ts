/** Use the site's shared translation manager for E2E UI and errors. */
export function e2eText(key: string): string { return typeof window !== 'undefined' && window.i18n ? window.i18n.t(key) : key; }
export function e2eError(key: string): Error & { e2eKey: string } { return Object.assign(new Error(e2eText(key)), { e2eKey: key }); }
export function e2eErrorText(error: any, fallback = 'e2eOperationFailed'): string { return e2eText(error?.e2eKey || fallback); }
