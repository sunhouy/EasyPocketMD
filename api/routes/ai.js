const express = require('express');
const router = express.Router();
const https = require('https');

// AI Layout endpoint
router.post('/layout', async (req, res) => {
    try {
        const { content, style, requirements } = req.body;
        
        if (!content) {
            return res.status(400).json({ 
                code: 400, 
                message: 'Content is required' 
            });
        }

        const apiKey = process.env.DASHSCOPE_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                code: 500,
                message: 'AI API Key is not configured on server'
            });
        }

        // Construct system prompt based on style
        const stylePrompts = {
            academic: '请将以下Markdown内容重新排版为学术论文风格。要求：标题清晰分级，段落结构严谨，适当使用加粗强调关键概念。',
            business: '请将以下Markdown内容重新排版为商务公文风格。要求：格式规范，条理清晰，语气正式，重点突出。',
            creative: '请将以下Markdown内容重新排版为创意设计风格。要求：排版活泼，富有设计感，适当使用引用和列表增强可读性。',
            simple: '请将以下Markdown内容重新排版为极简阅读风格。要求：去除冗余格式，保留核心内容，段落短小精悍，便于快速阅读。'
        };
        
        let systemPrompt = stylePrompts[style] || stylePrompts.academic;
        if (requirements) {
            systemPrompt += '\n额外要求：' + requirements;
        }

        // Call DashScope API
        const requestBody = JSON.stringify({
            model: "qwen-turbo",
            input: {
                messages: [
                    {
                        role: "system",
                        content: systemPrompt + "\n请直接返回排版后的Markdown内容，不要包含任何解释、前言或后语。不要使用代码块包裹。"
                    },
                    {
                        role: "user",
                        content: content
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
            }
        };

        const apiRequest = https.request(options, (apiRes) => {
            let data = '';
            
            apiRes.on('data', (chunk) => {
                data += chunk;
            });
            
            apiRes.on('end', () => {
                if (apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
                    try {
                        const response = JSON.parse(data);
                        if (response.output && response.output.choices && response.output.choices.length > 0) {
                            const aiContent = response.output.choices[0].message.content;
                            res.json({
                                code: 200,
                                data: aiContent
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
                        console.error('Failed to parse DashScope response:', e);
                        res.status(500).json({
                            code: 500,
                            message: 'Failed to parse AI response'
                        });
                    }
                } else {
                    console.error(`DashScope API Error: ${apiRes.statusCode}`, data);
                    res.status(apiRes.statusCode).json({
                        code: apiRes.statusCode,
                        message: 'AI API request failed',
                        error: data
                    });
                }
            });
        });

        apiRequest.on('error', (e) => {
            console.error('DashScope Request Error:', e);
            res.status(500).json({
                code: 500,
                message: 'Network error calling AI service',
                error: e.message
            });
        });

        apiRequest.write(requestBody);
        apiRequest.end();

    } catch (error) {
        console.error('AI Layout error:', error);
        return res.status(500).json({
            code: 500,
            message: 'Internal server error',
            error: error.message
        });
    }
});

module.exports = router;
