const apiManager = require('../../api/models/ApiManager');
const fs = require('fs');
const path = require('path');

jest.mock('fs');

describe('ApiManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('encryption and decryption', () => {
        it('should correctly encrypt and decrypt data', () => {
            const testData = { foo: 'bar', baz: 123 };
            const encrypted = apiManager.encrypt(testData);
            expect(typeof encrypted).toBe('string');
            
            const decrypted = apiManager.decrypt(encrypted);
            expect(decrypted).toEqual(testData);
        });
    });

    describe('getAllApiInfo', () => {
        it('should return default object if file does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            const info = apiManager.getAllApiInfo();
            expect(info).toEqual({ config: {}, preferred_product: null });
        });

        it('should return decrypted info if file exists', () => {
            const mockData = { config: { key1: { base_url: 'url', api_key: 'key', products: ['p1'] } }, preferred_product: 'p1' };
            const encrypted = apiManager.encrypt(mockData);
            
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(encrypted);

            const info = apiManager.getAllApiInfo();
            expect(info).toEqual(mockData);
        });
    });

    describe('product management', () => {
        beforeEach(() => {
            fs.existsSync.mockReturnValue(false); // Start with empty info
        });

        it('should add product info correctly', () => {
            const writeMock = jest.spyOn(fs, 'writeFileSync');
            const result = apiManager.addProductInfo('gpt-4', 'https://api.openai.com', 'sk-test');

            expect(result).toBe(true);
            expect(writeMock).toHaveBeenCalled();
            
            // Verify what was written
            const writtenData = writeMock.mock.calls[0][1];
            const decrypted = apiManager.decrypt(writtenData);
            
            const configKeys = Object.keys(decrypted.config);
            expect(configKeys).toHaveLength(1);
            expect(decrypted.config[configKeys[0]].products).toContain('gpt-4');
        });

        it('should delete product info correctly', () => {
            const mockData = { config: {} };
            const baseUrl = 'https://api.openai.com';
            const apiKey = 'sk-test';
            const crypto = require('crypto');
            const key = crypto.createHash('md5').update(baseUrl + apiKey).digest('hex');
            
            mockData.config[key] = { base_url: baseUrl, api_key: apiKey, products: ['gpt-4'] };
            
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(apiManager.encrypt(mockData));
            const writeMock = jest.spyOn(fs, 'writeFileSync');

            const result = apiManager.deleteApiInfo(baseUrl, apiKey);

            expect(result).toBe(true);
            const writtenData = writeMock.mock.calls[0][1];
            const decrypted = apiManager.decrypt(writtenData);
            expect(decrypted.config).toEqual({});
        });
    });
});
