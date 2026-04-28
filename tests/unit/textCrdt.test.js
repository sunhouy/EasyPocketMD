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
});
