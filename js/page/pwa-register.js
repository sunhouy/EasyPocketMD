    (function() {
        // 在桌面壳环境（Tauri/Electron 兼容桥）或 file:// 下不注册 Service Worker
        const isDesktopRuntime = !!(window.electron || window.__TAURI__ || (window.process && window.process.type));
        const isLocalFile = window.location.protocol === 'file:';
        
        if ('serviceWorker' in navigator && !isDesktopRuntime && !isLocalFile) {
            window.addEventListener('load', async function() {
                try {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    const expectedScript = new URL('/sw.js', window.location.origin).href;
                    const expectedScope = new URL('/', window.location.origin).href;

                    await Promise.all(registrations.map(function(reg) {
                        const worker = reg.active || reg.waiting || reg.installing;
                        const scriptUrl = worker ? worker.scriptURL : '';
                        const isExpected = reg.scope === expectedScope && scriptUrl === expectedScript;
                        if (isExpected) return Promise.resolve();

                        if (scriptUrl && scriptUrl.indexOf('/sw.js') !== -1) {
                            return reg.unregister();
                        }
                        return Promise.resolve();
                    }));

                    await navigator.serviceWorker.register('/sw.js', {
                        scope: '/',
                        updateViaCache: 'none'
                    });
                } catch (err) {
                    console.warn('ServiceWorker registration failed:', err);
                }
            });
        }
    })();

