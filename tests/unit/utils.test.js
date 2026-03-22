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
