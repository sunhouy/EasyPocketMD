import fs from 'fs';
import path from 'path';
/** Docker ships frontend files in dist, while development can serve root assets. */
export function resolveFrontendAsset(filename: string, root: string, dist?: string | null): string | undefined {
    return [dist && path.join(dist, filename), path.join(root, filename)].find(file => file && fs.existsSync(file)) || undefined;
}
