const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ApiManager {
    constructor() {
        this.apiFile = path.join(__dirname, '../api_info.json');
        this.encryptionKey = 'educoder_api_encryption_key_2025';
        this.algorithm = 'aes-256-cbc';
    }

    encrypt(data) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(this.encryptionKey), iv);
        
        // Encrypt to Buffer first
        let encryptedBuffer = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
        
        // Convert encrypted data to base64 string (as PHP openssl_encrypt does by default)
        const encryptedBase64 = encryptedBuffer.toString('base64');
        
        // Combine IV (raw) and Encrypted Data (base64 string)
        const combined = Buffer.concat([iv, Buffer.from(encryptedBase64, 'utf8')]);
        
        return combined.toString('base64');
    }

    decrypt(encryptedData) {
        try {
            // Decode the outer base64
            const buffer = Buffer.from(encryptedData, 'base64');
            
            // Extract IV (first 16 bytes)
            const iv = buffer.slice(0, 16);
            
            // Extract encrypted data (rest is base64 string)
            const encryptedBase64 = buffer.slice(16).toString('utf8');
            
            const decipher = crypto.createDecipheriv(this.algorithm, Buffer.from(this.encryptionKey), iv);
            
            // Decrypt the base64 encoded encrypted data
            let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            
            return JSON.parse(decrypted);
        } catch (error) {
            console.error('Decryption error:', error);
            throw error;
        }
    }

    getAllApiInfo() {
        if (!fs.existsSync(this.apiFile)) {
            return { config: {}, preferred_product: null };
        }
        
        const content = fs.readFileSync(this.apiFile, 'utf8');
        if (!content) return { config: {}, preferred_product: null };
        
        try {
            const decrypted = this.decrypt(content);
            if (decrypted.config) {
                if (decrypted.preferred_model && !decrypted.preferred_product) {
                    decrypted.preferred_product = decrypted.preferred_model;
                    delete decrypted.preferred_model;
                }
                return decrypted;
            } else {
                return { config: decrypted, preferred_product: null };
            }
        } catch (error) {
            console.error('Failed to load API info:', error);
            return { config: {}, preferred_product: null };
        }
    }

    saveApiInfo(apiInfo) {
        try {
            const encryptedData = this.encrypt(apiInfo);
            fs.writeFileSync(this.apiFile, encryptedData);
            return true;
        } catch (error) {
            console.error('Save failed:', error);
            return false;
        }
    }

    addProductInfo(product, baseUrl, apiKey) {
        const apiInfo = this.getAllApiInfo();
        const config = apiInfo.config || {};
        
        const baseUrlKey = crypto.createHash('md5').update(baseUrl + apiKey).digest('hex');
        
        if (config[baseUrlKey]) {
            if (!config[baseUrlKey].products.includes(product)) {
                config[baseUrlKey].products.push(product);
            }
        } else {
            config[baseUrlKey] = {
                base_url: baseUrl,
                api_key: apiKey,
                products: [product]
            };
        }
        
        apiInfo.config = config;
        return this.saveApiInfo(apiInfo);
    }

    deleteApiInfo(baseUrl, apiKey) {
        const apiInfo = this.getAllApiInfo();
        const config = apiInfo.config || {};
        const baseUrlKey = crypto.createHash('md5').update(baseUrl + apiKey).digest('hex');
        
        if (config[baseUrlKey]) {
            delete config[baseUrlKey];
            apiInfo.config = config;
            return this.saveApiInfo(apiInfo);
        }
        return false;
    }

    removeProduct(baseUrl, apiKey, product) {
        const apiInfo = this.getAllApiInfo();
        const config = apiInfo.config || {};
        const baseUrlKey = crypto.createHash('md5').update(baseUrl + apiKey).digest('hex');
        
        if (config[baseUrlKey]) {
            const index = config[baseUrlKey].products.indexOf(product);
            if (index !== -1) {
                config[baseUrlKey].products.splice(index, 1);
                
                if (config[baseUrlKey].products.length === 0) {
                    delete config[baseUrlKey];
                }
                
                apiInfo.config = config;
                
                if (apiInfo.preferred_product === product) {
                    apiInfo.preferred_product = null;
                }
                
                return this.saveApiInfo(apiInfo);
            }
        }
        return false;
    }

    getAllProducts() {
        const apiInfo = this.getAllApiInfo();
        const config = apiInfo.config || {};
        let products = [];
        
        for (const key in config) {
            products = products.concat(config[key].products);
        }
        
        return [...new Set(products)].sort();
    }

    getProductConfig(product) {
        const apiInfo = this.getAllApiInfo();
        const config = apiInfo.config || {};
        
        for (const key in config) {
            if (config[key].products.includes(product)) {
                return {
                    base_url: config[key].base_url,
                    api_key: config[key].api_key
                };
            }
        }
        return null;
    }

    searchProducts(keyword) {
        const allProducts = this.getAllProducts();
        return allProducts.filter(p => p.toLowerCase().includes(keyword.toLowerCase()));
    }

    getPreferredProduct() {
        return this.getAllApiInfo().preferred_product;
    }
}

module.exports = new ApiManager();
