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

// AI Formula Search endpoint
router.post('/formula', async (req, res) => {
    try {
        const { keyword, language } = req.body;
        
        if (!keyword) {
            return res.status(400).json({ 
                code: 400, 
                message: 'Keyword is required' 
            });
        }

        const apiKey = process.env.DASHSCOPE_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                code: 500,
                message: 'AI API Key is not configured on server'
            });
        }

        // Construct system prompt based on language
        const isEnglish = language === 'en';
        const systemPrompt = isEnglish 
            ? `You are a LaTeX formula expert. Given a user's search keyword, provide relevant LaTeX formulas.
Return the results in the following format (one formula per line):
display_name | latex_code

For example:
Quadratic formula | x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
Summation | \\sum_{i=1}^{n} x_i
Integral | \\int_{a}^{b} f(x) \\,dx

Provide 5-10 most relevant formulas. Only return the formula list, no explanations.`
            : `你是LaTeX公式专家。根据用户的搜索关键词，提供相关的LaTeX公式。
请按以下格式返回结果（每行一个公式）：
显示名称 | latex代码

例如：
二次公式 | x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
求和符号 | \\sum_{i=1}^{n} x_i
积分 | \\int_{a}^{b} f(x) \\,dx

提供5-10个最相关的公式。只返回公式列表，不要解释。`;

        const userPrompt = isEnglish
            ? `Search for LaTeX formulas related to: "${keyword}"`
            : `搜索与"${keyword}"相关的LaTeX公式`;

        // Call DashScope API
        const requestBody = JSON.stringify({
            model: "qwen-turbo",
            input: {
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: userPrompt
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
        console.error('AI Formula Search error:', error);
        return res.status(500).json({
            code: 500,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// AI Chart Search endpoint
router.post('/chart', async (req, res) => {
    try {
        const { keyword, language } = req.body;
        
        if (!keyword) {
            return res.status(400).json({ 
                code: 400, 
                message: 'Keyword is required' 
            });
        }

        const apiKey = process.env.DASHSCOPE_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                code: 500,
                message: 'AI API Key is not configured on server'
            });
        }

        // Construct system prompt based on language
        const isEnglish = language === 'en';
        const systemPrompt = isEnglish 
            ? `You are a Mermaid chart expert. Given a user's search keyword, generate relevant Mermaid diagram templates.
Return the results as Mermaid code blocks. Each chart should be in its own code block.

Supported chart types: flowchart, sequenceDiagram, classDiagram, stateDiagram, gantt, pie, xychart-beta, erDiagram, journey, gitGraph, mindmap, timeline, C4Context, C4Container, requirementDiagram.

Format your response like this:
\`\`\`mermaid
graph TD
    A[Start] --> B[Process]
    B --> C[End]
\`\`\`

\`\`\`mermaid
sequenceDiagram
    A->>B: Message
\`\`\`

Provide 2-4 relevant chart templates based on the user's request. Only return the Mermaid code blocks, no explanations.`
            : `你是Mermaid图表专家。根据用户的搜索关键词，生成相关的Mermaid图表模板。
请返回Mermaid代码块格式的结果。每个图表应该在自己的代码块中。

支持的图表类型：流程图(flowchart)、序列图(sequenceDiagram)、类图(classDiagram)、状态图(stateDiagram)、甘特图(gantt)、饼图(pie)、折线/柱状图(xychart-beta)、ER图(erDiagram)、用户旅程图(journey)、Git分支图(gitGraph)、思维导图(mindmap)、时间线图(timeline)、C4架构图(C4Context/C4Container)、需求图(requirementDiagram)。

请按以下格式返回：
\`\`\`mermaid
graph TD
    A[开始] --> B[处理]
    B --> C[结束]
\`\`\`

\`\`\`mermaid
sequenceDiagram
    A->>B: 消息
\`\`\`

根据用户请求提供2-4个相关图表模板。只返回Mermaid代码块，不要解释。`;

        const userPrompt = isEnglish
            ? `Generate Mermaid chart templates for: "${keyword}"`
            : `生成与"${keyword}"相关的Mermaid图表模板`;

        // Call DashScope API
        const requestBody = JSON.stringify({
            model: "qwen-turbo",
            input: {
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: userPrompt
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
        console.error('AI Chart Search error:', error);
        return res.status(500).json({
            code: 500,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// AI Generate endpoint - 通用AI生成接口（用于AI助手的帮我写、帮我改、生成PPT等功能）
router.post('/generate', async (req, res) => {
    try {
        const { prompt, content } = req.body;

        if (!prompt) {
            return res.status(400).json({
                code: 400,
                message: 'Prompt is required'
            });
        }

        const apiKey = process.env.DASHSCOPE_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                code: 500,
                message: 'AI API Key is not configured on server'
            });
        }

        // Call DashScope API
        const requestBody = JSON.stringify({
            model: "qwen-turbo",
            input: {
                messages: [
                    {
                        role: "system",
                        content: "你是一个专业的写作助手，可以帮助用户生成各种类型的文档内容、改写文本、生成PPT大纲等。请根据用户的要求提供高质量的回复。直接返回结果，不要包含解释性文字。"
                    },
                    {
                        role: "user",
                        content: prompt + (content ? '\n\n' + content : '')
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
        console.error('AI Generate error:', error);
        return res.status(500).json({
            code: 500,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// AI Markdown Search endpoint
router.post('/markdown', async (req, res) => {
    try {
        const { keyword, language } = req.body;

        if (!keyword) {
            return res.status(400).json({
                code: 400,
                message: 'Keyword is required'
            });
        }

        // 检查关键词长度（最多10个字）
        if (keyword.length > 10) {
            return res.status(400).json({
                code: 400,
                message: language === 'en' ? 'Keyword too long (max 10 characters)' : '关键词过长（最多10个字）'
            });
        }

        const apiKey = process.env.DASHSCOPE_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                code: 500,
                message: 'AI API Key is not configured on server'
            });
        }

        // Construct system prompt based on language
        const isEnglish = language === 'en';
        const systemPrompt = isEnglish
            ? `You are a Markdown expert. Given a user's search keyword, provide relevant Markdown code examples.
Return the results in the following format (one example per line):
display_name  markdown_code

For example:
Bold text  **bold text**
Link  [link text](https://example.com)
Table   Col1  Col2 \\n------------\\n A  B 
Code block  \`\`\`\\ncode\n\`\`\`
Quote  > quote text

Provide 5-10 most relevant Markdown examples. Only return the list, no explanations.`
            : `你是Markdown专家。根据用户的搜索关键词，提供相关的Markdown代码示例。
请按以下格式返回结果（每行一个示例）：
显示名称  markdown代码

例如：
粗体文字  **粗体文字**
链接  [链接文字](https://example.com)
表格   列1  列2 \\n------------\\n A  B 
代码块  \`\`\`\\n代码\n\`\`\`
引用  > 引用文字

提供5-10个最相关的Markdown示例。只返回列表，不要解释。`;

        const userPrompt = isEnglish
            ? `Search for Markdown code examples related to: "${keyword}"`
            : `搜索与"${keyword}"相关的Markdown代码示例`;

        // Call DashScope API
        const requestBody = JSON.stringify({
            model: "qwen-turbo",
            input: {
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: userPrompt
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
        console.error('AI Markdown Search error:', error);
        return res.status(500).json({
            code: 500,
            message: 'Internal server error',
            error: error.message
        });
    }
});

module.exports = router;
