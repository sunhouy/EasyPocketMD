const https = require('https');

const PEXELS_API_KEY = 'hsNz3iXecrRQcKtKRIzrPWhWE27lV6NR5v8ODrhoZYZyj9aDuT3yBSTp';

/**
 * 搜索 Pexels 图片
 * @param {string} query - 搜索关键词
 * @param {number} perPage - 每页返回数量
 * @param {string} orientation - 图片方向 (landscape, portrait, square)
 * @returns {Promise<Array>} 图片列表
 */
async function searchImages(query, perPage = 5, orientation = 'landscape') {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.pexels.com',
            path: `/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=${orientation}`,
            method: 'GET',
            headers: {
                'Authorization': PEXELS_API_KEY
            },
            timeout: 10000
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const result = JSON.parse(data);

                    if (!result.photos || !Array.isArray(result.photos)) {
                        return resolve([]);
                    }

                    const images = result.photos.map(photo => ({
                        id: photo.id,
                        url: photo.src.large,
                        thumbnail: photo.src.medium,
                        small: photo.src.small,
                        photographer: photo.photographer,
                        photographer_url: photo.photographer_url,
                        alt: photo.alt || query,
                        width: photo.width,
                        height: photo.height
                    }));

                    resolve(images);
                } catch (e) {
                    console.error('Failed to parse Pexels response:', e);
                    reject(new Error('Failed to parse Pexels API response'));
                }
            });
        });

        req.on('error', (e) => {
            console.error('Pexels API request error:', e);
            reject(new Error('Failed to connect to Pexels API'));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Pexels API request timeout'));
        });

        req.end();
    });
}

module.exports = {
    searchImages
};
