import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';

// 敏感词文件路径
const SENSITIVE_WORDS_PATH = '/www/wwwroot/static/sensitive.txt';

// 使用 Map 存储敏感词字典树
let sensitiveWordMap = new Map<string, Map<string, unknown>>();
let isLoaded = false;
let sensitiveWordsList: string[] = [];

// 构建敏感词字典树
function buildSensitiveWordMap(words: string[]): Map<string, Map<string, unknown>> {
  const map = new Map<string, Map<string, unknown>>();
  for (const word of words) {
    if (!word || word.length === 0) continue;
    let current = map;
    for (const char of word) {
      if (!current.has(char)) {
        current.set(char, new Map<string, unknown>());
      }
      current = current.get(char) as Map<string, unknown>;
    }
    current.set('isEnd', true);
  }
  return map;
}

// 加载敏感词库
function loadSensitiveWords(): void {
  if (isLoaded) return;

  try {
    // 检查文件是否存在
    if (!fs.existsSync(SENSITIVE_WORDS_PATH)) {
      console.warn(`⚠️ 敏感词文件不存在: ${SENSITIVE_WORDS_PATH}`);
      return;
    }

    sensitiveWordsList = fs.readFileSync(SENSITIVE_WORDS_PATH, 'utf-8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    // 构建字典树
    sensitiveWordMap = buildSensitiveWordMap(sensitiveWordsList);
    isLoaded = true;
  } catch (error) {
    console.error('❌ 加载敏感词库失败:', (error as Error).message);
  }
}

interface CheckResult {
  hasSensitive: boolean;
  words: string[];
}

// 检查文本是否包含敏感词，并返回所有匹配的敏感词
// 返回 { hasSensitive: boolean, words: string[] }
function checkSensitiveWords(text: string): CheckResult {
  if (!text || typeof text !== 'string') {
    return { hasSensitive: false, words: [] };
  }

  // 确保词库已加载
  if (!isLoaded) {
    loadSensitiveWords();
  }

  // 如果词库为空，直接返回
  if (sensitiveWordsList.length === 0) {
    return { hasSensitive: false, words: [] };
  }

  const foundWords = new Set<string>();
  const textLength = text.length;

  // 遍历文本的每个位置
  for (let i = 0; i < textLength; i++) {
    let current = sensitiveWordMap;
    let match = '';

    for (let j = i; j < textLength; j++) {
      const char = text[j];
      if (!current.has(char)) {
        break;
      }
      match += char;
      current = current.get(char) as Map<string, unknown>;

      // 如果到达词尾，说明匹配到一个敏感词
      if (current.has('isEnd')) {
        foundWords.add(match);
      }
    }
  }

  const words = Array.from(foundWords);
  return {
    hasSensitive: words.length > 0,
    words: words
  };
}

// 过滤敏感词，将敏感词替换为 ***
function filterSensitiveWords(text: string, replacement = '***'): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  const checkResult = checkSensitiveWords(text);
  if (!checkResult.hasSensitive) {
    return text;
  }

  let filteredText = text;
  for (const word of checkResult.words) {
    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    filteredText = filteredText.replace(regex, replacement);
  }

  return filteredText;
}

interface ObjectCheckResult {
  hasSensitive: boolean;
  words: string[];
  field?: string;
}

// 检查对象中的指定字段是否包含敏感词
// 返回 { hasSensitive: boolean, words: string[], field: string }
function checkObjectFields(obj: Record<string, unknown>, fieldsToCheck = ['title', 'content', 'comment', 'nickname', 'filename']): ObjectCheckResult {
  if (!obj || typeof obj !== 'object') {
    return { hasSensitive: false, words: [] };
  }

  for (const key of fieldsToCheck) {
    if (obj[key] && typeof obj[key] === 'string') {
      const checkResult = checkSensitiveWords(obj[key] as string);
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
function sensitiveMiddleware(req: Request, res: Response, next: NextFunction): void {
  const fieldsToCheck = ['title', 'content', 'comment', 'nickname', 'filename'];

  function filterText(text: string): string {
    if (!text || typeof text !== 'string') return text;
    return filterSensitiveWords(text, '***');
  }

  // 递归处理 req.body / req.query / req.params
  const sanitize = (obj: Record<string, unknown>): void => {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(key => {
      if (fieldsToCheck.includes(key)) {
        obj[key] = filterText(obj[key] as string);
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key] as Record<string, unknown>);
      }
    });
  };

  sanitize(req.body as Record<string, unknown>);
  sanitize(req.query as Record<string, unknown>);
  next();
}

export {
  loadSensitiveWords,
  checkSensitiveWords,
  filterSensitiveWords,
  checkObjectFields,
  sensitiveMiddleware
};
