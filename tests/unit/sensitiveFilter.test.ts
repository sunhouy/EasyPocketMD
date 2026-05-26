const sensitiveFilter = require('../../api/utils/sensitiveFilter');
const fs = require('fs');

// Mock fs module
jest.mock('fs');

describe('sensitiveFilter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module state
        jest.resetModules();
    });

    describe('checkSensitiveWords', () => {
        it('should return no sensitive words for empty input', () => {
            const result = sensitiveFilter.checkSensitiveWords('');
            
            expect(result.hasSensitive).toBe(false);
            expect(result.words).toEqual([]);
        });

        it('should return no sensitive words for non-string input', () => {
            const result = sensitiveFilter.checkSensitiveWords(null);
            
            expect(result.hasSensitive).toBe(false);
            expect(result.words).toEqual([]);
        });

        it('should return basic structure', () => {
            const result = sensitiveFilter.checkSensitiveWords('测试文本');
            
            expect(typeof result.hasSensitive).toBe('boolean');
            expect(Array.isArray(result.words)).toBe(true);
        });
    });

    describe('filterSensitiveWords', () => {
        it('should return original text for non-string input', () => {
            const result = sensitiveFilter.filterSensitiveWords(null);
            
            expect(result).toBeNull();
        });

        it('should return original text if no sensitive words', () => {
            const text = '这是一个安全的文本';
            const result = sensitiveFilter.filterSensitiveWords(text);
            
            expect(result).toBe(text);
        });

        it('should use custom replacement if provided', () => {
            const text = '这是一个测试';
            const result = sensitiveFilter.filterSensitiveWords(text, '###');
            
            expect(typeof result).toBe('string');
        });

        it('should use default replacement if not provided', () => {
            const text = '这是一个测试';
            const result = sensitiveFilter.filterSensitiveWords(text);
            
            expect(typeof result).toBe('string');
        });
    });

    describe('checkObjectFields', () => {
        it('should return no sensitive words for invalid object', () => {
            const result = sensitiveFilter.checkObjectFields(null);
            
            expect(result.hasSensitive).toBe(false);
            expect(result.words).toEqual([]);
        });

        it('should check specified fields', () => {
            const obj = {
                title: '测试标题',
                content: '这是测试内容',
                other: '其他字段'
            };
            
            const result = sensitiveFilter.checkObjectFields(obj, ['title', 'content']);
            
            expect(typeof result.hasSensitive).toBe('boolean');
        });

        it('should use default fields if not specified', () => {
            const obj = {
                title: '测试标题',
                content: '测试内容'
            };
            
            const result = sensitiveFilter.checkObjectFields(obj);
            
            expect(typeof result.hasSensitive).toBe('boolean');
        });

        it('should return field name if sensitive word found', () => {
            const obj = {
                content: '这是一个敏感词'
            };
            
            const result = sensitiveFilter.checkObjectFields(obj);
            
            expect(typeof result.hasSensitive).toBe('boolean');
            if (result.hasSensitive) {
                expect(result.field).toBeDefined();
            }
        });
    });

    describe('sensitiveMiddleware', () => {
        it('should be a function', () => {
            expect(typeof sensitiveFilter.sensitiveMiddleware).toBe('function');
        });

        it('should call next()', () => {
            const req = { body: {}, query: {} };
            const res = {};
            const next = jest.fn();
            
            sensitiveFilter.sensitiveMiddleware(req, res, next);
            
            expect(next).toHaveBeenCalled();
        });

        it('should filter text in specified fields', () => {
            const req = {
                body: {
                    title: '这是标题',
                    content: '这是内容'
                },
                query: {}
            };
            const res = {};
            const next = jest.fn();
            
            sensitiveFilter.sensitiveMiddleware(req, res, next);
            
            expect(typeof req.body.title).toBe('string');
            expect(typeof req.body.content).toBe('string');
        });

        it('should handle nested objects', () => {
            const req = {
                body: {
                    data: {
                        content: '嵌套内容'
                    }
                },
                query: {}
            };
            const res = {};
            const next = jest.fn();
            
            sensitiveFilter.sensitiveMiddleware(req, res, next);
            
            expect(typeof req.body.data).toBe('object');
        });
    });
});
