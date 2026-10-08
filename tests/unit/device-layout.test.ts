import { isMobileUserAgent } from '../../js/main/device-layout';

describe('mobile layout for ArkWeb', () => {
    it.each([
        'Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36 ArkWeb/4.1.6.1 Mobile',
        'Mozilla/5.0 (Phone; OpenHarmony 6.0) AppleWebKit/537.36 Chrome/132.0.0.0 Safari/537.36 ArkWeb/6.0.0.42 Mobile',
        'Mozilla/5.0 (Tablet; OpenHarmony 6.0) AppleWebKit/537.36 ArkWeb/6.0',
        'Mozilla/5.0 (Linux; Android 15) Chrome/132.0 Mobile',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148',
    ])('uses mobile layout for %s', ua => {
        expect(isMobileUserAgent(ua)).toBe(true);
    });

    it.each([
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/132.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15',
        'Mozilla/5.0 (PC; OpenHarmony 6.0) AppleWebKit/537.36 ArkWeb/6.0',
    ])('keeps desktop layout for %s', ua => {
        expect(isMobileUserAgent(ua)).toBe(false);
    });
});
