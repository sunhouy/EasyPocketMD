import { existsSync } from 'fs';

/** Service managers may omit system directories from PATH; allow explicit overrides. */
export function nativeTool(name: 'pandoc' | 'wkhtmltopdf'): string {
    const configured = process.env[name === 'pandoc' ? 'PANDOC_PATH' : 'WKHTMLTOPDF_PATH']?.trim();
    if (configured) return configured;
    if (process.platform !== 'win32') {
        for (const dir of ['/usr/local/bin', '/usr/bin', '/bin']) if (existsSync(dir + '/' + name)) return dir + '/' + name;
    }
    return name;
}

export function isMissingPandoc(error: any): boolean {
    return error?.code === 'ENOENT' && error?.exportTool === 'pandoc';
}
