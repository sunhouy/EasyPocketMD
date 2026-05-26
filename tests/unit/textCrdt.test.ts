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

    it('should not concatenate full snapshots when ancestry is unknown', () => {
        const local = '# Doc\n\nline 1\nline 2\nlocal edit';
        const remote = '# Doc\n\nline 1\nline 2\nremote edit';
        const result = mergeTextWithCrdt('', local, remote);

        expect(result.content).toBe(local);
        expect(result.content).not.toBe(local + remote);
        expect(result.content).not.toBe(remote + local);
        expect(result.merged).toBe(false);
    });
});
