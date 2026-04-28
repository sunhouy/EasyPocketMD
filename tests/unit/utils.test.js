/**
 * @jest-environment jsdom
 */

require('../../js/utils.js');

describe('Frontend Utils', () => {
    describe('formatFileSize', () => {
        it('should format bytes correctly', () => {
            expect(window.formatFileSize(0)).toBe('0 Bytes');
            expect(window.formatFileSize(1024)).toBe('1 KB');
            expect(window.formatFileSize(1024 * 1024)).toBe('1 MB');
            expect(window.formatFileSize(1024 * 1024 * 1.5)).toBe('1.5 MB');
        });
    });

    describe('escapeHtml', () => {
        it('should escape HTML characters', () => {
            const input = '<script>alert("xss")</script>';
            const escaped = window.escapeHtml(input);
            expect(escaped).toContain('&lt;script&gt;');
            expect(escaped).toContain('&quot;');
        });
    });

    describe('normalizeAppResourceUrl', () => {
        afterEach(() => {
            delete window.desktopRuntime;
            delete window.APP_ORIGIN;
            localStorage.removeItem('appOrigin');
        });

        it('maps server-managed relative paths to the configured app origin', () => {
            window.APP_ORIGIN = 'https://md.example.test';

            expect(window.normalizeAppResourceUrl('/uploads/image.png')).toBe('https://md.example.test/uploads/image.png');
            expect(window.normalizeAppResourceUrl('screenshots/a b.png')).toBe('https://md.example.test/screenshots/a%20b.png');
        });

        it('repairs Tauri-local managed image URLs without touching external images', () => {
            window.desktopRuntime = { type: 'tauri' };
            const localManagedUrl = window.location.origin + '/uploads/image.png?x=1';

            expect(window.normalizeAppResourceUrl(localManagedUrl)).toBe('https://md.yhsun.cn/uploads/image.png?x=1');
            expect(window.normalizeAppResourceUrl('https://cdn.example.test/uploads/image.png')).toBe('https://cdn.example.test/uploads/image.png');
        });
    });

    describe('parseJsonResponse', () => {
        it('should parse valid JSON', async () => {
            const mockResponse = {
                text: jest.fn().mockResolvedValue('{"code": 200, "message": "OK"}'),
                status: 200
            };
            const result = await window.parseJsonResponse(mockResponse);
            expect(result.code).toBe(200);
            expect(result.message).toBe('OK');
        });

        it('should handle HTML responses as errors', async () => {
            const mockResponse = {
                text: jest.fn().mockResolvedValue('<!DOCTYPE html><html><body>Error</body></html>'),
                status: 500
            };
            const result = await window.parseJsonResponse(mockResponse);
            expect(result.code).toBe(500);
            expect(result.message).toContain('服务器内部错误');
        });
    });
});
