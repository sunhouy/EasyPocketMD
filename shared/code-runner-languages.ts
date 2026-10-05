/** Keep lazy loading, editor toolbars and execution dispatch in agreement. */
export const RUNNABLE_LANGUAGES = ['python','py','javascript','js','typescript','ts','html','htm','c','cpp','c++','java','bash','shell','sh'] as const;
export const SANDBOX_LANGUAGES = ['python','py','c','cpp','c++','java','bash','shell','sh'] as const;
export function canRunLanguage(language: string): boolean { return (RUNNABLE_LANGUAGES as readonly string[]).includes(String(language || '').trim().toLowerCase()); }
export function isSandboxLanguage(language: string): boolean { return (SANDBOX_LANGUAGES as readonly string[]).includes(String(language || '').trim().toLowerCase()); }
