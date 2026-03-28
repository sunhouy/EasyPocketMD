process.env.BASE_URL = 'http://localhost:3000';
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

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

// Mock ioredis to avoid connection issues during tests
jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue(),
        get: jest.fn().mockResolvedValue(null),
        setex: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        keys: jest.fn().mockResolvedValue([]),
        ttl: jest.fn().mockResolvedValue(-1),
        quit: jest.fn().mockResolvedValue()
    }));
});

// Mock sensitive word detection module
jest.mock('node-word-detection', () => ({
    node_word_detection: {
        add_word: jest.fn(),
        check_word: jest.fn().mockReturnValue(false),
        find_word: jest.fn().mockReturnValue([]),
        check_word_replace: jest.fn().mockReturnValue({ have: false, str: '' }),
        get_word_num: jest.fn().mockReturnValue(0)
    }
}));

// Mock fs for sensitive word file check and PDF generation
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockReturnValue(''),
    mkdirSync: jest.fn(),
    createWriteStream: jest.fn(() => {
        const { PassThrough } = require('stream');
        const stream = new PassThrough();
        // Emit finish event after a short delay to simulate successful write
        setImmediate(() => {
            stream.emit('finish');
        });
        return stream;
    }),
    statSync: jest.fn(() => ({ size: 100 }))
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



