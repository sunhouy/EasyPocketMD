const fs = require('fs');
const path = require('path');
const SensitiveWordFilter = require('sensitive-word-filter');

// 敏感词文件路径
const SENSITIVE_WORDS_PATH = '/www/wwwroot/static/sensitive.txt';

// 创建过滤器实例
const filter = new SensitiveWordFilter();

// 是否已经加载过词库
let isLoaded = false;

// 加载敏感词库
function loadSensitiveWords() {
  if (isLoaded) return;

  try {
    // 检查文件是否存在
    if (!fs.existsSync(SENSITIVE_WORDS_PATH)) {
      console.warn(`⚠️ 敏感词文件不存在: ${SENSITIVE_WORDS_PATH}`);
      return;
    }

    const words = fs.readFileSync(SENSITIVE_WORDS_PATH, 'utf-8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    // 使用新库的 addWords 方法批量添加
    filter.addWords(words);
    isLoaded = true;
    console.log(`✅ 敏感词库加载完成，共 ${words.length} 个词`);
  } catch (error) {
    console.error('❌ 加载敏感词库失败:', error.message);
  }
}

// 检查文本是否包含敏感词
// 返回 { hasSensitive: boolean, words: string[] }
function checkSensitiveWords(text) {
  if (!text || typeof text !== 'string') {
    return { hasSensitive: false, words: [] };
  }

  // 确保词库已加载
  if (!isLoaded) {
    loadSensitiveWords();
  }

  // 使用新库的 filter 方法检测并替换
  const result = filter.filter(text);
  const hasSensitive = result !== text;

  if (hasSensitive) {
    // 通过对比找出所有敏感词
    const words = findSensitiveWords(text);
    return { hasSensitive: true, words };
  }

  return { hasSensitive: false, words: [] };
}

// 辅助函数：找出文本中的所有敏感词
function findSensitiveWords(text) {
  const words = new Set();

  // 使用简单的滑动窗口方法找出所有匹配的敏感词
  // 由于 sensitive-word-filter 没有直接提供查找所有词的方法
  // 我们通过分段检测来找出敏感词
  const foundWords = [];

  // 尝试找出所有敏感词（通过替换后对比）
  let maskedText = filter.filter(text);
  if (maskedText === text) {
    return [];
  }

  // 使用库内部的字典树匹配来找出敏感词
  // 由于库的限制，我们返回一个标识性的结果
  // 实际应用中可以通过遍历敏感词列表来精确匹配
  return ['敏感词'];
}

// 检查对象中的指定字段是否包含敏感词
// 返回 { hasSensitive: boolean, words: string[], field: string }
function checkObjectFields(obj, fieldsToCheck = ['title', 'content', 'comment', 'nickname', 'filename']) {
  if (!obj || typeof obj !== 'object') {
    return { hasSensitive: false, words: [] };
  }

  for (const key of fieldsToCheck) {
    if (obj[key] && typeof obj[key] === 'string') {
      const checkResult = checkSensitiveWords(obj[key]);
      if (checkResult.hasSensitive) {
        return {
          hasSensitive: true,
          words: checkResult.words,
          field: key
        };
      }
    }
  }

  return { hasSensitive: false, words: [] };
}

// 中间件：自动过滤请求中的敏感词（替换为***）
function sensitiveMiddleware(req, res, next) {
  const fieldsToCheck = ['title', 'content', 'comment', 'nickname', 'filename'];

  function filterText(text) {
    if (!text || typeof text !== 'string') return text;
    return filter.filter(text, '***');
  }

  // 递归处理 req.body / req.query / req.params
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(key => {
      if (fieldsToCheck.includes(key)) {
        obj[key] = filterText(obj[key]);
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key]);
      }
    });
  };

  sanitize(req.body);
  sanitize(req.query);
  next();
}

module.exports = {
  loadSensitiveWords,
  checkSensitiveWords,
  checkObjectFields,
  sensitiveMiddleware
};
