const htmlGenerator = require('../../api/utils/htmlGenerator');

describe('HTML Generator Utils', () => {
    describe('generatePasswordForm', () => {
        it('should generate a form with the correct shareId', () => {
            const shareId = '12345';
            const html = htmlGenerator.generatePasswordForm(shareId);
            expect(html).toContain(shareId);
            expect(html).toContain('输入访问密码');
            expect(html).toContain('<input type="password"');
        });
    });

    describe('generateShareViewPage', () => {
        it('should generate a view page with correct title and content', () => {
            const shareData = {
                filename: 'Test File',
                content: '# Hello World',
                mode: 'view',
                share_id: 'abcde'
            };
            const html = htmlGenerator.generateShareViewPage(shareData);
            
            expect(html).toContain('Test File');
            expect(html).toContain('Hello World'); // Content is JSON stringified in the script
            expect(html).toContain('abcde');
            expect(html).toContain('仅查看');
        });

        it('should show expired message if expired', () => {
            const shareData = {
                filename: 'Expired File',
                content: 'content',
                mode: 'view',
                share_id: 'abcde',
                expires_at: new Date(Date.now() - 10000).toISOString(),
                is_expired: true
            };
            const html = htmlGenerator.generateShareViewPage(shareData);
            expect(html).toContain('此分享链接已于');
            expect(html).toContain('过期');
        });

        it('should enable edit controls if editable', () => {
            const shareData = {
                filename: 'Editable File',
                content: 'content',
                mode: 'edit',
                share_id: 'abcde',
                is_expired: false
            };
            const html = htmlGenerator.generateShareViewPage(shareData);
            expect(html).toContain('编辑文档');
            expect(html).toContain('saveChanges()');
        });
    });
});
