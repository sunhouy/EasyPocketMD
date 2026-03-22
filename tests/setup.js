process.env.BASE_URL = 'http://localhost:3000';
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';

/**
 * Global mock for mysql2/promise using the schema from db.sql
 * Tables: users, user_files, file_history, file_content, file_shares, member_records, authorization_codes, etc.
 */
jest.mock('mysql2/promise', () => ({
    createPool: jest.fn(() => ({
        execute: jest.fn(() => Promise.resolve([[]])),
        getConnection: jest.fn(() => Promise.resolve({
            execute: jest.fn(() => Promise.resolve([[]])),
            release: jest.fn(),
            beginTransaction: jest.fn(() => Promise.resolve()),
            commit: jest.fn(() => Promise.resolve()),
            rollback: jest.fn(() => Promise.resolve())
        })),
        on: jest.fn(),
        end: jest.fn(() => Promise.resolve())
    }))
}));

// Mock markdown-it-mathjax3 to avoid deasync issues during tests
jest.mock('markdown-it-mathjax3', () => {
    return (md) => {
        // Mock plugin that does nothing
        return md;
    };
});

// Silence console.error and console.warn during tests to keep output clean
// Unless we are debugging
if (process.env.SILENT_TESTS !== 'false') {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation((msg) => {
        // Keep PDF debug logs if needed, or silence all
        if (typeof msg === 'string' && msg.includes('[PDF Debug]')) return;
        // return; // Uncomment to silence all logs
    });
}



