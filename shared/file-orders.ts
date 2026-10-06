type Orders = Record<string, number>;
export const isOrderMetadataFile = (name: string) => /(^|\/)\.easypocketmd_orders?$/.test(name || '');
export function normalizeOrders(value: unknown): Orders {
    const result: Orders = Object.create(null);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    for (const [path, order] of Object.entries(value)) {
        if (path && path.length <= 255 && !isOrderMetadataFile(path) && typeof order === 'number' && Number.isFinite(order)) result[path] = order;
    }
    return result;
}
