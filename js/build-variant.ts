declare const __APP_MARKET__: boolean;
export const isMarketBuild = typeof __APP_MARKET__ !== 'undefined' && __APP_MARKET__;
export function requireAIEnabled() {
    if (isMarketBuild) throw new Error('此版本不提供 AI 功能 / AI is unavailable in this build');
}
export function requirePrivacyConsent(form: 'login' | 'register'): boolean {
    if (!isMarketBuild) return true;
    const checkbox = document.getElementById(form + 'PrivacyConsent') as HTMLInputElement;
    if (checkbox?.checked) return true;
    const message = document.getElementById(form + 'Message');
    if (message) {
        message.textContent = window.i18n?.getLanguage() === 'en' ? 'Please read and agree to the Privacy Policy.' : '请先阅读并同意隐私政策';
        message.className = 'modal-message error';
    }
    checkbox?.focus();
    return false;
}
export function installMarketUI() {
    if (!isMarketBuild) return;
    for (const form of ['login', 'register']) {
        const container = document.getElementById(form + 'Form');
        if (!container || document.getElementById(form + 'PrivacyConsent')) continue;
        const row = document.createElement('label'); row.className = 'market-privacy-consent';
        row.innerHTML = `<input type="checkbox" id="${form}PrivacyConsent"><span><span data-market-consent-text>已阅读并同意</span> <a href="https://yhsun.cn/privacy.html" target="_blank" rel="noopener noreferrer" data-market-policy-link>隐私政策</a></span>`;
        container.insertBefore(row, document.getElementById(form + 'Message'));
    }
    const hide = () => {
        const selectors = ['#desktopAIBtn','#mobileAIBtn','#aiModalOverlay','#live2dCompanion',
            '[aria-labelledby="settingsAIGroupTitle"]','[aria-labelledby="settingsLive2DTitle"]',
            '#aiLayoutBtn','[data-shortcut-action-id="openAIAssistant"]','input[value="mobileAIBtn"]'];
        document.querySelectorAll<HTMLElement>(selectors.join(',')).forEach(element => {
            const target = element.id === 'aiLayoutBtn' ? element.parentElement : element.matches('input') ? element.closest<HTMLElement>('.shortcut-setting-row, label') : element;
            target?.setAttribute('data-market-hidden','');
        });
    };
    const translate = () => {
        const english = window.i18n?.getLanguage() === 'en';
        document.querySelectorAll('[data-market-consent-text]').forEach(element => element.textContent = english ? 'I have read and agree to the' : '已阅读并同意');
        document.querySelectorAll('[data-market-policy-link]').forEach(element => element.textContent = english ? 'Privacy Policy' : '隐私政策');
    };
    hide(); translate();
    const observer = new MutationObserver(hide);
    observer.observe(document.body, {childList:true,subtree:true});
    window.addEventListener('languagechange',translate);
    return () => { observer.disconnect(); window.removeEventListener('languagechange',translate); };
}
