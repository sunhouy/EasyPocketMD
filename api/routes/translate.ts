import express from 'express';
import { createHash, createHmac } from 'node:crypto';

const router = express.Router();
const languages = new Set(['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es']);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: string | Buffer, value: string) => createHmac('sha256', key).update(value).digest();

// https://cloud.tencent.com/document/product/551/15619 — TextTranslate, TC3 signing.
export function translationHeaders(body: string, secretId: string, secretKey: string, timestamp = Math.floor(Date.now() / 1000)) {
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const scope = `${date}/tmt/tc3_request`;
    const canonical = `POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:tmt.tencentcloudapi.com\n\ncontent-type;host\n${sha256(body)}`;
    const key = hmac(hmac(hmac('TC3' + secretKey, date), 'tmt'), 'tc3_request');
    const signature = createHmac('sha256', key).update(`TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${sha256(canonical)}`).digest('hex');
    return {
        Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`,
        'Content-Type': 'application/json; charset=utf-8', Host: 'tmt.tencentcloudapi.com',
        'X-TC-Action': 'TextTranslate', 'X-TC-Version': '2018-03-21', 'X-TC-Timestamp': String(timestamp),
        'X-TC-Region': process.env.TENCENT_REGION || 'ap-guangzhou'
    };
}
router.post('/', async (req, res) => {
    const {text, target} = req.body || {};
    if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text, 'utf8') > 6000 || !languages.has(target)) {
        res.status(400).json({success:false, message:'请选择不超过6000 UTF-8字节的文本和有效目标语言 / Select text within 6000 UTF-8 bytes and a supported target language'}); return;
    }
    const secretId = process.env.TENCENT_SECRET_ID, secretKey = process.env.TENCENT_SECRET_KEY;
    if (!secretId || !secretKey) { res.status(503).json({success:false, message:'翻译服务尚未配置 / Translation service is not configured'}); return; }
    const body = JSON.stringify({SourceText:text, Source:'auto', Target:target, ProjectId:0});
    try {
        const response = await fetch('https://tmt.tencentcloudapi.com', {
            method:'POST', headers:translationHeaders(body, secretId, secretKey), body, signal:AbortSignal.timeout(15000)
        });
        const data = await response.json() as {Response?: {TargetText?:string; Source?:string; Error?:{Code:string}}};
        if (!response.ok || data.Response?.Error || typeof data.Response?.TargetText !== 'string') {
            res.status(502).json({success:false, message:'腾讯云翻译失败，请稍后重试 / Tencent Cloud translation failed; please retry'}); return;
        }
        res.json({success:true, data:{text:data.Response.TargetText, source:data.Response.Source, target}});
    } catch { res.status(502).json({success:false, message:'翻译服务连接超时或不可用 / Translation service timed out or is unavailable'}); }
});
module.exports = router;
module.exports.translationHeaders = translationHeaders;
