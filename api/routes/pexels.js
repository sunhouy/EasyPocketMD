const express = require('express');
const router = express.Router();
const { searchImages } = require('../services/pexels-service');
const https = require('https');

/**
 * 提取关键词端点
 * 使用 AI 从页面标题和内容中提取适合搜索图片的英文关键词
 */
router.post('/extract-keywords', async (req, res) => {
    try {
        const { pageTitle, pageContent } = req.body;

        if (!pageTitle) {
            return res.status(400).json({
                code: 400,
                message: 'Page title is required'
            });
        }

        const apiKey = process.env.DASHSCOPE_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                code: 500,
                message: 'AI API Key not configured'
            });
        }

        const contentText = Array.isArray(pageContent)
            ? pageContent.join(', ')
            : (pageContent || '');

        const prompt = `请从以下PPT页面信息中提取1-3个适合搜索配图的英文关键词。

页面标题：${pageTitle}
页面内容：${contentText}

要求：
1. 关键词必须是英文
2. 关键词要具体、视觉化，适合图片搜索
3. 避免抽象概念，优先选择具体事物、场景、物体
4. 只返回关键词，用逗号分隔，不要解释

示例：
标题"云计算架构" -> cloud computing, server room, data center
标题"市场增长趋势" -> business growth, upward chart, success
标题"团队协作" -> teamwork, collaboration, office meeting
标题"数据分析" -> data analytics, dashboard, statistics`;

        const requestBody = JSON.stringify({
            model: "deepseek-v4-pro",
            input: {
                messages: [
                    {
                        role: "system",
                        content: "你是一个关键词提取专家，擅长为图片搜索提取准确的英文关键词。"
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            },
            parameters: {
                result_format: "message"
            }
        });

        const options = {
            hostname: 'dashscope.aliyuncs.com',
            path: '/api/v1/services/aigc/text-generation/generation',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(requestBody)
            },
            timeout: 30000
        };

        const apiRequest = https.request(options, (apiRes) => {
            let data = '';

            apiRes.on('data', chunk => {
                data += chunk;
            });

            apiRes.on('end', () => {
                try {
                    const response = JSON.parse(data);

                    if (response.output && response.output.choices && response.output.choices.length > 0) {
                        const keywords = response.output.choices[0].message.content.trim();
                        res.json({
                            code: 200,
                            data: keywords
                        });
                    } else {
                        console.error('DashScope API unexpected response:', response);
                        res.status(500).json({
                            code: 500,
                            message: 'AI processing failed',
                            error: response.message || 'Unknown error'
                        });
                    }
                } catch (e) {
                    console.error('Failed to parse AI response:', e);
                    res.status(500).json({
                        code: 500,
                        message: 'Failed to parse AI response'
                    });
                }
            });
        });

        apiRequest.on('error', (e) => {
            console.error('AI API request error:', e);
            res.status(500).json({
                code: 500,
                message: e.message || 'AI API request failed'
            });
        });

        apiRequest.on('timeout', () => {
            apiRequest.destroy();
            res.status(500).json({
                code: 500,
                message: 'AI API request timeout'
            });
        });

        apiRequest.write(requestBody);
        apiRequest.end();

    } catch (error) {
        console.error('Extract keywords error:', error);
        res.status(500).json({
            code: 500,
            message: error.message || 'Internal server error'
        });
    }
});

/**
 * 搜索图片端点
 * 根据关键词搜索 Pexels 图片
 */
router.post('/search-images', async (req, res) => {
    try {
        const { keywords, perPage = 5, orientation = 'landscape' } = req.body;

        if (!keywords) {
            return res.status(400).json({
                code: 400,
                message: 'Keywords are required'
            });
        }

        const images = await searchImages(keywords, perPage, orientation);

        res.json({
            code: 200,
            data: images
        });

    } catch (error) {
        console.error('Search images error:', error);
        res.status(500).json({
            code: 500,
            message: error.message || 'Failed to search images'
        });
    }
});

module.exports = router;
