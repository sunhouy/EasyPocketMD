const htmlGenerator = require('../../api/utils/htmlGenerator');

describe('htmlGenerator', () => {
    describe('generatePasswordForm', () => {
        it('should generate password form HTML with shareId', () => {
            const shareId = 'test-share-id';
            const result = htmlGenerator.generatePasswordForm(shareId);
            
            expect(typeof result).toBe('string');
            expect(result).toContain('<!DOCTYPE html>');
            expect(result).toContain(shareId);
            expect(result).toContain('submitPassword');
            expect(result).toContain('/api/share/get');
        });
    });

    describe('generateShareViewPage', () => {
        it('should generate share view page with view mode', () => {
            const shareData = {
                filename: 'test.md',
                content: '# Test Content',
                mode: 'view',
                expires_at: null,
                is_expired: false,
                share_id: 'test-share-id'
            };
            
            const result = htmlGenerator.generateShareViewPage(shareData);
            
            expect(typeof result).toBe('string');
            expect(result).toContain('<!DOCTYPE html>');
            expect(result).toContain('test.md');
            expect(result).toContain('仅查看');
            expect(result).not.toContain('✏️ 编辑文档');
        });

        it('should generate share view page with edit mode', () => {
            const shareData = {
                filename: 'test.md',
                content: '# Test Content',
                mode: 'edit',
                expires_at: null,
                is_expired: false,
                share_id: 'test-share-id'
            };
            
            const result = htmlGenerator.generateShareViewPage(shareData);
            
            expect(result).toContain('可编辑');
            expect(result).toContain('✏️ 编辑文档');
            expect(result).toContain('enableEdit');
        });

        it('should show expiry information when expires_at is set', () => {
            const shareData = {
                filename: 'test.md',
                content: '# Test Content',
                mode: 'view',
                expires_at: '2026-12-31T23:59:59Z',
                is_expired: false,
                share_id: 'test-share-id'
            };
            
            const result = htmlGenerator.generateShareViewPage(shareData);
            
            expect(result).toContain('此分享链接将于');
        });

        it('should show expired warning when is_expired is true', () => {
            const shareData = {
                filename: 'test.md',
                content: '# Test Content',
                mode: 'view',
                expires_at: '2024-01-01T00:00:00Z',
                is_expired: true,
                share_id: 'test-share-id'
            };
            
            const result = htmlGenerator.generateShareViewPage(shareData);
            
            expect(result).toContain('⚠️ 此分享链接已于');
        });

        it('should disable edit buttons when expired in edit mode', () => {
            const shareData = {
                filename: 'test.md',
                content: '# Test Content',
                mode: 'edit',
                expires_at: '2024-01-01T00:00:00Z',
                is_expired: true,
                share_id: 'test-share-id'
            };
            
            const result = htmlGenerator.generateShareViewPage(shareData);
            
            expect(result).toContain('链接已过期');
        });

        it('should escape HTML in filename', () => {
            const shareData = {
                filename: '<script>alert("xss")</script>',
                content: '# Test Content',
                mode: 'view',
                expires_at: null,
                is_expired: false,
                share_id: 'test-share-id'
            };
            
            const result = htmlGenerator.generateShareViewPage(shareData);
            
            expect(result).not.toContain('<script>alert("xss")</script>');
            expect(result).toContain('&lt;script&gt;');
        });
    });

    describe('escapeHtml (internal validation)', () => {
        it('should test escapeHtml indirectly through generateShareViewPage', () => {
            const shareData = {
                filename: '<script>alert("xss")</script>',
                content: '# Test Content',
                mode: 'view',
                expires_at: null,
                is_expired: false,
                share_id: 'test-share-id'
            };
            
            const result = htmlGenerator.generateShareViewPage(shareData);
            
            expect(result).not.toContain('<script>alert("xss")</script>');
            expect(result).toContain('&lt;script&gt;');
        });
    });
});
