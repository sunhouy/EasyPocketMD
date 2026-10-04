import type { QueryChunk } from './ai-query';
export type QueryEmbed = (texts: string[], options: { signal?: AbortSignal }) => Promise<number[][]>;
const vectors = new Map<string, number[]>();
let namespace = '';
export function clearQueryVectors() { vectors.clear(); namespace = ''; }
if (typeof window !== 'undefined') {
    window.addEventListener('e2e-account-reset', clearQueryVectors);
    window.addEventListener('e2e-locked', clearQueryVectors);
}
/** Only changed text spans are embedded again. The current corpus supplies permissions and paths. */
export async function semanticQueryScores(chunks: QueryChunk[], question: string, embed: QueryEmbed, key: string, signal?: AbortSignal) {
    if (namespace !== key) { clearQueryVectors(); namespace = key; }
    const assert = () => { if (signal?.aborted || namespace !== key) throw new DOMException('Cancelled', 'AbortError'); };
    const missing = [...new Set(chunks.map(chunk => chunk.text))].filter(text => !vectors.has(text));
    const local = new Map<string, number[]>(chunks.map(chunk => [chunk.text, vectors.get(chunk.text)]).filter(([, vector]) => !!vector) as Array<[string, number[]]>);
    let next = 0;
    const workers = await Promise.allSettled(Array.from({ length: Math.min(2, Math.ceil(missing.length / 16)) }, async () => {
        while (next < missing.length) {
            assert(); const from = next; next += 16; const batch = missing.slice(from, next);
            const result = await embed(batch, { signal }); assert();
            if (result.length !== batch.length) throw new Error('Invalid embeddings result');
            batch.forEach((text, index) => { local.set(text, result[index]); vectors.set(text, result[index]); });
            while (vectors.size > 2000) vectors.delete(vectors.keys().next().value);
        }
    }));
    const failure = workers.find(result => result.status === 'rejected') as PromiseRejectedResult;
    if (failure) throw failure.reason;
    assert(); const [query] = await embed([question], { signal }); assert();
    if (!query?.length) throw new Error('Invalid query embedding');
    return chunks.map(chunk => {
        const vector = local.get(chunk.text);
        if (!vector || vector.length !== query.length) { clearQueryVectors(); throw new Error('Embedding dimensions changed; retry'); }
        let dot = 0, a = 0, b = 0;
        vector.forEach((value, index) => { dot += value * query[index]; a += value * value; b += query[index] * query[index]; });
        return a && b ? dot / Math.sqrt(a * b) : 0;
    });
}
