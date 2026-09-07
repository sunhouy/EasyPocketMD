/**
 * AI 模型配置模块（前端直连，云不提供模型）
 *
 * - 用户需自行填写 apiKey / baseUrl / model，配置保存在本地(localStorage)。
 * - AI 调用由前端直接请求用户配置的 OpenAI 兼容接口，密钥与模型完全由用户自己掌握，
 *   云端既不保存密钥、也不提供模型，仅可能存放一份端到端加密的隐藏配置文件。
 * - 可选项：端到端加密同步到云端（作为隐藏文件存储，只有拥有账号密码的用户可解密）。
 */

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 是否将配置端到端加密后同步到云端隐藏文件 */
  syncToCloud: boolean;
}

const STORAGE_KEY = 'ai_config';
const HIDDEN_FILE_NAME = '.ai-config.json';
export const AI_CONFIG_REQUIRED = 'AI_CONFIG_REQUIRED';

export function defaultAIConfig(): AIConfig {
  return {
    apiKey: '',
    baseUrl: '',
    model: '',
    syncToCloud: false
  };
}

export function getAIConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAIConfig();
    const parsed = JSON.parse(raw);
    const base = defaultAIConfig();
    if (parsed.apiKey) base.apiKey = String(parsed.apiKey);
    if (parsed.baseUrl) base.baseUrl = String(parsed.baseUrl);
    if (parsed.model) base.model = String(parsed.model);
    base.syncToCloud = !!parsed.syncToCloud;
    return base;
  } catch (e) {
    return defaultAIConfig();
  }
}

export function saveAIConfig(config: AIConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function isAIConfigReady(config?: AIConfig): boolean {
  const c = config || getAIConfig();
  return !!(c.apiKey && c.baseUrl && c.model);
}

/**
 * 将用户提供的 baseUrl 规范化为 /chat/completions 完整地址。
 * 兼容用户直接粘贴完整地址、带 /v1 或纯域名等情况。
 */
export function normalizeChatUrl(baseUrl: string): string {
  let url = (baseUrl || '').trim();
  if (!url) return '';
  url = url.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(url)) return url;
  if (/\/v1$/i.test(url)) return url + '/chat/completions';
  return url + '/v1/chat/completions';
}

/**
 * 前端直连 OpenAI 兼容接口的聊天补全调用。
 * @param messages OpenAI 格式的 messages 数组
 * @returns 模型返回的文本内容
 */
export async function callChat(messages: Array<{ role: string; content: string }>, opts?: { maxTokens?: number; temperature?: number }): Promise<string> {
  const config = getAIConfig();
  if (!isAIConfigReady(config)) {
    const err: any = new Error('AI 模型未配置，请在“设置 - AI 模型”中填写 apiKey、baseUrl 与模型名称');
    err.code = AI_CONFIG_REQUIRED;
    throw err;
  }

  const url = normalizeChatUrl(config.baseUrl);
  if (!url) {
    const err: any = new Error('AI baseUrl 无效');
    err.code = AI_CONFIG_REQUIRED;
    throw err;
  }

  const payload: any = {
    model: config.model.trim(),
    messages,
    stream: false
  };
  if (opts && opts.maxTokens) payload.max_tokens = opts.maxTokens;
  if (opts && opts.temperature !== undefined) payload.temperature = opts.temperature;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey.trim()
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    const err: any = new Error('无法连接 AI 服务，请检查 baseUrl 是否正确');
    err.cause = e;
    throw err;
  }

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = (data && data.error && (data.error.message || data.error.code)) || '';
    } catch (e) { /* ignore */ }
    const err: any = new Error('AI 服务请求失败（HTTP ' + response.status + '）' + (detail ? ': ' + detail : ''));
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? (data.choices[0].message.content || '')
    : (data && data.output && data.output.choices && data.output.choices[0] && data.output.choices[0].text
        ? data.output.choices[0].text
        : '');
  return content;
}

/** 便捷方法：按 system / user 两条消息调用。 */
export async function callText(systemPrompt: string, userPrompt: string, opts?: { maxTokens?: number; temperature?: number }): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
  return callChat(messages, opts);
}

/* ------------------- 端到端加密同步（隐藏文件） ------------------- */

const HIDDEN_FILE_KEY = 'ai_config_cloud_uploaded';

/** 将配置端到端加密后保存到云端隐藏文件。仅当前端保存本地会保存时调用。 */
export async function syncAIConfigToCloud(config: AIConfig): Promise<void> {
  const user = (window as any).currentUser;
  if (!user || !user.username) throw new Error('请先登录后再同步 AI 配置');
  const password = user.password;
  if (!password) throw new Error('缺少账号密码，无法端到端加密');

  const json = JSON.stringify({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model
  });

  // 端到端加密
  const e2e = await import('./e2e');
  const encrypted = await e2e.encrypt(json, password);

  const payload: any = {
    username: user.username,
    token: user.token || user.username,
    filename: HIDDEN_FILE_NAME,
    content: encrypted,
    e2e_enabled: 1
  };

  const api = (window as any).getApiBaseUrl ? (window as any).getApiBaseUrl() : 'api';
  const resp = await fetch(api + '/files/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const r = (window as any).parseJsonResponse ? await (window as any).parseJsonResponse(resp) : await resp.json();
  if (r && r.code === 200) {
    localStorage.setItem(HIDDEN_FILE_KEY, '1');
  } else {
    throw new Error((r && r.message) || 'AI 配置云端同步失败');
  }
}

/** 删除云端隐藏配置文件。 */
export async function deleteAIConfigFromCloud(): Promise<void> {
  const user = (window as any).currentUser;
  if (!user || !user.username) return;
  const api = (window as any).getApiBaseUrl ? (window as any).getApiBaseUrl() : 'api';
  try {
    await fetch(api + '/files/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: user.username,
        token: user.token || user.username,
        filename: HIDDEN_FILE_NAME
      })
    });
  } finally {
    localStorage.removeItem(HIDDEN_FILE_KEY);
  }
}

/** 从云端隐藏文件拉取并解密配置（合并到本地配置）。 */
export async function loadAIConfigFromCloud(): Promise<AIConfig | null> {
  const user = (window as any).currentUser;
  if (!user || !user.username) return null;
  const password = user.password;
  if (!password) return null;

  const api = (window as any).getApiBaseUrl ? (window as any).getApiBaseUrl() : 'api';
  const resp = await fetch(api + '/files/content?username=' + encodeURIComponent(user.username) +
    '&filename=' + encodeURIComponent(HIDDEN_FILE_NAME) + '&token=' + encodeURIComponent(user.token || user.username));
  const r = (window as any).parseJsonResponse ? await (window as any).parseJsonResponse(resp) : await resp.json();
  if (!r || r.code !== 200 || !r.data) return null;

  const encrypted = r.data.content !== undefined ? r.data.content : r.data;
  if (!encrypted) return null;

  const e2e = await import('./e2e');
  const plain = await e2e.decrypt(String(encrypted), password);
  if (!plain) return null;

  try {
    const parsed = JSON.parse(plain);
    const cfg = getAIConfig();
    if (parsed.apiKey) cfg.apiKey = String(parsed.apiKey);
    if (parsed.baseUrl) cfg.baseUrl = String(parsed.baseUrl);
    if (parsed.model) cfg.model = String(parsed.model);
    cfg.syncToCloud = true;
    return cfg;
  } catch (e) {
    return null;
  }
}

/* ------------------- 全局导出（供其它 IIFE 模块使用） ------------------- */

if (typeof window !== 'undefined') {
  (window as any).AIConfig = {
    get: getAIConfig,
    save: saveAIConfig,
    isReady: isAIConfigReady,
    callChat,
    callText,
    syncToCloud: syncAIConfigToCloud,
    loadFromCloud: loadAIConfigFromCloud,
    deleteFromCloud: deleteAIConfigFromCloud,
    normalizeChatUrl,
    HIDDEN_FILE_NAME,
    STORAGE_KEY
  };
}