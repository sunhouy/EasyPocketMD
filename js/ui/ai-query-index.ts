import type { QueryChunk } from './ai-query';

// Incremental in-memory lexical index. Decrypted text and terms never go to disk.
const tokenCache = new Map<string, Map<string, number>>();
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;
function tokens(text: string) {
    const result: string[] = [];
    const lower = text.toLowerCase();
    for (const match of lower.matchAll(/[a-z0-9_]+|[\p{Script=Han}]+/gu)) {
        const term = match[0];
        if (/^[a-z0-9_]+$/.test(term)) result.push(term);
        else {
            if (segmenter) for (const part of segmenter.segment(term)) if (part.isWordLike) result.push(part.segment);
            for (let i = 0; i < term.length - 1; i++) result.push(term.slice(i, i + 2));
        }
    }
    return result;
}
function terms(chunk: QueryChunk) {
    const key = chunk.path + '\n' + chunk.text;
    let tf = tokenCache.get(key);
    if (!tf) {
        tf = new Map(); for (const token of tokens(key)) tf.set(token, (tf.get(token) || 0) + 1);
        tokenCache.set(key, tf);
        // Bound retained text/token memory. Old revisions are evicted first.
        while (tokenCache.size > 2000) tokenCache.delete(tokenCache.keys().next().value);
    }
    return tf;
}
export function clearQueryIndex() { tokenCache.clear(); }
if (typeof window !== 'undefined') {
    window.addEventListener('e2e-account-reset', clearQueryIndex);
    window.addEventListener('e2e-locked', clearQueryIndex);
}

export function retrieveQueryChunks(chunks: QueryChunk[], question: string, expansions: string[] = [], limit = 24, semantic?: number[]) {
    const queries = new Set(tokens([question, ...expansions].join(' ')));
    const tf = chunks.map(terms);
    const df = new Map<string, number>();
    for (const item of tf) for (const query of queries) if (item.has(query)) df.set(query, (df.get(query) || 0) + 1);
    const lengths = tf.map(item => [...item.values()].reduce((sum, count) => sum + count, 0));
    const average = lengths.reduce((sum, length) => sum + length, 0) / Math.max(1, lengths.length) || 1;
    const ranked = chunks.map((chunk, i) => {
        let score = 0;
        for (const query of queries) {
            const count = tf[i].get(query) || 0; if (!count) continue;
            const frequency = df.get(query) || 0;
            const idf = Math.log(1 + (chunks.length - frequency + .5) / (frequency + .5));
            score += idf * count * 2.2 / (count + 1.2 * (.25 + .75 * lengths[i] / average));
            if (chunk.path.toLowerCase().includes(query)) score += idf * 1.5;
        }
        return { chunk, score: score + Math.max(0, semantic?.[i] || 0) * 4 };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
    const chosen = new Map<string, QueryChunk>();
    const counts = new Map<number, number>();
    // First spread results across files; then fill with relevant detail from long files.
    for (const item of ranked) {
        if (chosen.size >= limit - 4) break;
        if ((counts.get(item.chunk.source) || 0) >= 3) continue;
        chosen.set(item.chunk.id, item.chunk); counts.set(item.chunk.source, (counts.get(item.chunk.source) || 0) + 1);
    }
    const related = new Set([...chosen.values()].flatMap(chunk => chunk.related));
    for (const chunk of chunks) if (chosen.size < limit && related.has(chunk.source) && !counts.has(chunk.source)) {
        chosen.set(chunk.id, chunk); counts.set(chunk.source, 1);
    }
    for (const item of ranked) { if (chosen.size >= limit) break; chosen.set(item.chunk.id, item.chunk); }
    return [...chosen.values()];
}
