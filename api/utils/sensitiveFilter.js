const fs = require('fs');
const path = require('path');
const { node_word_detection } = require('node-word-detection');

// 敏感词文件路径
const SENSITIVE_WORDS_PATH = '/www/wwwroot/static/sensitive.txt';

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

    words.forEach(word => node_word_detection.add_word(word));
    isLoaded = true;
    console.log(`✅ 敏感词库加载完成，共 ${node_word_detection.get_word_num()} 个词`);
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

  // check_word 返回 boolean，find_word 返回敏感词列表
  const hasSensitive = node_word_detection.check_word(text);

  if (hasSensitive) {
    // 查找所有敏感词（-1 表示查找全部）
    const words = node_word_detection.find_word(text, -1);
    return { hasSensitive: true, words: words || [] };
  }

  return { hasSensitive: false, words: [] };
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
    const result = node_word_detection.check_word_replace(text, '***');
    return result.have ? result.str : text;
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
