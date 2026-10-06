interface Window {
    E2EVault: typeof import('../js/e2e-vault');
    E2EAttachments: typeof import('../js/e2e-attachments');
}
interface Window { e2eSerializeFiles: (files: any[]) => string; }

interface Window { e2eSerializeUser: (value: any) => string; }
