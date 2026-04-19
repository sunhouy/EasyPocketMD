const ApiManager = require('../../api/models/ApiManager');
const fs = require('fs');
const crypto = require('crypto');

// Mock dependencies
jest.mock('fs');

describe('ApiManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('encrypt and decrypt', () => {
        it('should encrypt and decrypt data successfully', () => {
            const testData = { key: 'value', number: 123 };
            
            const encrypted = ApiManager.encrypt(testData);
            expect(typeof encrypted).toBe('string');
            
            const decrypted = ApiManager.decrypt(encrypted);
            expect(decrypted).toEqual(testData);
        });
    });

    describe('getAllApiInfo', () => {
        it('should return default object when file does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            
            const result = ApiManager.getAllApiInfo();
            
            expect(result.config).toEqual({});
            expect(result.preferred_product).toBeNull();
        });

        it('should return default object when file is empty', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('');
            
            const result = ApiManager.getAllApiInfo();
            
            expect(result.config).toEqual({});
            expect(result.preferred_product).toBeNull();
        });

        it('should load and decrypt api info successfully', () => {
            const testData = { config: { test: 'config' }, preferred_product: 'gpt-4' };
            const encryptedData = ApiManager.encrypt(testData);
            
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(encryptedData);
            
            const result = ApiManager.getAllApiInfo();
            
            expect(result.config).toEqual(testData.config);
            expect(result.preferred_product).toEqual(testData.preferred_product);
        });

        it('should handle preferred_model to preferred_product migration', () => {
            const testData = { config: { test: 'config' }, preferred_model: 'gpt-4' };
            const encryptedData = ApiManager.encrypt(testData);
            
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(encryptedData);
            
            const result = ApiManager.getAllApiInfo();
            
            expect(result.preferred_product).toBe('gpt-4');
            expect(result.preferred_model).toBeUndefined();
        });

        it('should return default object on decryption error', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('invalid-data');
            console.error = jest.fn();
            
            const result = ApiManager.getAllApiInfo();
            
            expect(result.config).toEqual({});
            expect(result.preferred_product).toBeNull();
        });
    });

    describe('saveApiInfo', () => {
        it('should save api info successfully', () => {
            const testData = { config: {}, preferred_product: null };
            
            const result = ApiManager.saveApiInfo(testData);
            
            expect(result).toBe(true);
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('should return false on save error', () => {
            fs.writeFileSync.mockImplementation(() => {
                throw new Error('Write error');
            });
            console.error = jest.fn();
            
            const result = ApiManager.saveApiInfo({});
            
            expect(result).toBe(false);
        });
    });

    describe('addProductInfo', () => {
        it('should add new product info', () => {
            jest.spyOn(ApiManager, 'getAllApiInfo').mockReturnValue({ config: {} });
            jest.spyOn(ApiManager, 'saveApiInfo').mockReturnValue(true);
            
            const result = ApiManager.addProductInfo('gpt-4', 'http://example.com', 'api-key');
            
            expect(result).toBe(true);
            expect(ApiManager.saveApiInfo).toHaveBeenCalled();
        });

        it('should add product to existing config', () => {
            const existingConfig = {};
            const baseUrlKey = crypto.createHash('md5').update('http://example.comapi-key').digest('hex');
            existingConfig[baseUrlKey] = {
                base_url: 'http://example.com',
                api_key: 'api-key',
                products: ['gpt-3']
            };
            
            jest.spyOn(ApiManager, 'getAllApiInfo').mockReturnValue({ config: existingConfig });
            jest.spyOn(ApiManager, 'saveApiInfo').mockReturnValue(true);
            
            const result = ApiManager.addProductInfo('gpt-4', 'http://example.com', 'api-key');
            
            expect(result).toBe(true);
        });

        it('should not add duplicate product', () => {
            const existingConfig = {};
            const baseUrlKey = crypto.createHash('md5').update('http://example.comapi-key').digest('hex');
            existingConfig[baseUrlKey] = {
                base_url: 'http://example.com',
                api_key: 'api-key',
                products: ['gpt-4']
            };
            
            jest.spyOn(ApiManager, 'getAllApiInfo').mockReturnValue({ config: existingConfig });
            jest.spyOn(ApiManager, 'saveApiInfo').mockReturnValue(true);
            
            const result = ApiManager.addProductInfo('gpt-4', 'http://example.com', 'api-key');
            
            expect(result).toBe(true);
        });
    });

    describe('deleteApiInfo', () => {
        it('should delete existing api info', () => {
            const existingConfig = {};
            const baseUrlKey = crypto.createHash('md5').update('http://example.comapi-key').digest('hex');
            existingConfig[baseUrlKey] = { products: ['gpt-4'] };
            
            jest.spyOn(ApiManager, 'getAllApiInfo').mockReturnValue({ config: existingConfig });
            jest.spyOn(ApiManager, 'saveApiInfo').mockReturnValue(true);
            
            const result = ApiManager.deleteApiInfo('http://example.com', 'api-key');
            
            expect(result).toBe(true);
        });

        it('should return false for non-existent config', () => {
            jest.spyOn(ApiManager, 'getAllApiInfo').mockReturnValue({ config: {} });
            
            const result = ApiManager.deleteApiInfo('http://example.com', 'api-key');
            
            expect(result).toBe(false);
        });
    });

    describe('removeProduct', () => {
        it('should remove product from config', () => {
            const existingConfig = {};
            const baseUrlKey = crypto.createHash('md5').update('http://example.comapi-key').digest('hex');
            existingConfig[baseUrlKey] = {
                base_url: 'http://example.com',
                api_key: 'api-key',
                products: ['gpt-4', 'gpt-3']
            };
            
            jest.spyOn(ApiManager, 'getAllApiInfo').mockReturnValue({ 
                config: existingConfig,
                preferred_product: 'gpt-4'
            });
            jest.spyOn(ApiManager, 'saveApiInfo').mockReturnValue(true);
            
            const result = ApiManager.removeProduct('http://example.com', 'api-key', 'gpt-4');
            
            expect(result).toBe(true);
        });

        it('should delete config when last product is removed', () => {
            const existingConfig = {};
            const baseUrlKey = crypto.createHash('md5').update('http://example.comapi-key').digest('hex');
            existingConfig[baseUrlKey] = {
                base_url: 'http://example.com',
                api_key: 'api-key',
                products: ['gpt-4']
            };
            
            jest.spyOn(ApiManager, 'getAllApiInfo').mockReturnValue({ 
                config: existingConfig,
                preferred_product: 'gpt-4'
            });
            jest.spyOn(ApiManager, 'saveApiInfo').mockReturnValue(true);
            
            const result = ApiManager.removeProduct('http://example.com', 'api-key', 'gpt-4');
            
            expect(result).toBe(true);
        });

        it('should return false for non-existent product', () => {
            const existingConfig = {};
            const baseUrlKey = crypto.createHash('md5').update('http://example.comapi-key').digest('hex');
            existingConfig[baseUrlKey] = { products: ['gpt-4'] };
            
            jest.spyOn(ApiManager, 'getAllApiInfo').mockReturnValue({ config: existingConfig });
            
            const result = ApiManager.removeProduct('http://example.com', 'api-key', 'gpt-3');
            
            expect(result).toBe(false);
        });

        it('should return false for non-existent config', () => {
            jest.spyOn(ApiManager, 'getAllApiInfo').mockReturnValue({ config: {} });
            
            const result = ApiManager.removeProduct('http://example.com', 'api-key', 'gpt-4');
            
            expect(result).toBe(false);
        });
    });

    describe('getAllProducts', () => {
        it('should return unique sorted products', () => {
            const existingConfig = {
                key1: { products: ['gpt-4', 'gpt-3'] },
                key2: { products: ['gpt-4', 'claude'] }
            };
            
            jest.spyOn(ApiManager, 'getAllApiInfo').mockReturnValue({ config: existingConfig });
            
            const result = ApiManager.getAllProducts();
            
            expect(result).toEqual(['claude', 'gpt-3', 'gpt-4']);
        });

        it('should return empty array when no products', () => {
            jest.spyOn(ApiManager, 'getAllApiInfo').mockReturnValue({ config: {} });
            
            const result = ApiManager.getAllProducts();
            
            expect(result).toEqual([]);
        });
    });

    describe('getProductConfig', () => {
        it('should return config for existing product', () => {
            const existingConfig = {
                key1: {
                    base_url: 'http://example.com',
                    api_key: 'api-key',
                    products: ['gpt-4']
                }
            };
            
            jest.spyOn(ApiManager, 'getAllApiInfo').mockReturnValue({ config: existingConfig });
            
            const result = ApiManager.getProductConfig('gpt-4');
            
            expect(result).toEqual({
                base_url: 'http://example.com',
                api_key: 'api-key'
            });
        });

        it('should return null for non-existent product', () => {
            jest.spyOn(ApiManager, 'getAllApiInfo').mockReturnValue({ config: {} });
            
            const result = ApiManager.getProductConfig('nonexistent');
            
            expect(result).toBeNull();
        });
    });

    describe('searchProducts', () => {
        it('should filter products by keyword', () => {
            jest.spyOn(ApiManager, 'getAllProducts').mockReturnValue(['gpt-4', 'gpt-3', 'claude']);
            
            const result = ApiManager.searchProducts('gpt');
            
            expect(result).toEqual(['gpt-4', 'gpt-3']);
        });

        it('should be case insensitive', () => {
            jest.spyOn(ApiManager, 'getAllProducts').mockReturnValue(['GPT-4', 'gpt-3']);
            
            const result = ApiManager.searchProducts('GPT');
            
            expect(result).toEqual(['GPT-4', 'gpt-3']);
        });
    });

    describe('getPreferredProduct', () => {
        it('should return preferred product', () => {
            jest.spyOn(ApiManager, 'getAllApiInfo').mockReturnValue({ preferred_product: 'gpt-4' });
            
            const result = ApiManager.getPreferredProduct();
            
            expect(result).toBe('gpt-4');
        });

        it('should return null when no preferred product', () => {
            jest.spyOn(ApiManager, 'getAllApiInfo').mockReturnValue({ preferred_product: null });
            
            const result = ApiManager.getPreferredProduct();
            
            expect(result).toBeNull();
        });
    });
});
