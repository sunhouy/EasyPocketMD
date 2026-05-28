const { mergeTextWithCrdt } = require('../../api/utils/textCrdt');

describe('textCrdt', () => {
    it('should merge non-overlapping concurrent text edits', () => {
        const result = mergeTextWithCrdt('A\nB', 'A local\nB', 'A\nB remote');

        expect(result.content).toBe('A local\nB remote');
        expect(result.merged).toBe(true);
    });

    it('should keep the remote text when local has not changed from the base', () => {
        const result = mergeTextWithCrdt('base', 'base', 'server edit');

        expect(result.content).toBe('server edit');
        expect(result.merged).toBe(false);
    });

    it('should merge overlapping edits at the same position', () => {
        const result = mergeTextWithCrdt('hello world', 'hello amazing world', 'hello beautiful world');

        expect(result.content).toContain('hello');
        expect(result.content).toContain('world');
        expect(result.content).not.toBe('hello amazing world');
        expect(result.content).not.toBe('hello beautiful world');
        expect(result.merged).toBe(true);
    });

    it('should fall back to local snapshot when base is empty', () => {
        const local = '# Doc\n\nline 1\nline 2\nlocal edit';
        const remote = '# Doc\n\nline 1\nline 2\nremote edit';
        const result = mergeTextWithCrdt('', local, remote);

        expect(result.content).toBe(local);
        expect(result.content).not.toBe(local + remote);
        expect(result.content).not.toBe(remote + local);
        expect(result.merged).toBe(false);
    });

    it('should return local when remote equals base', () => {
        const result = mergeTextWithCrdt('hello', 'hello world', 'hello');

        expect(result.content).toBe('hello world');
        expect(result.merged).toBe(false);
    });

    it('should return result unchanged when both edits are identical', () => {
        const result = mergeTextWithCrdt('hello', 'hello world', 'hello world');

        expect(result.content).toBe('hello world');
        expect(result.merged).toBe(false);
    });
});