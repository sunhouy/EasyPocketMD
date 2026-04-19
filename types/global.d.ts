// Global type declarations for the project

declare module 'express' {
    import { Request, Response, NextFunction } from 'express';
    export { Request, Response, NextFunction };
}

declare module '*.json' {
    const value: unknown;
    export default value;
}

// Extend NodeJS namespace
declare namespace NodeJS {
    interface ProcessEnv {
        [key: string]: string | undefined;
    }
}

// Global window extensions for frontend
declare global {
    interface Window {
        [key: string]: unknown;
    }
}

export {};
