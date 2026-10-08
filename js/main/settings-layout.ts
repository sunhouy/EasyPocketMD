/** Preserve existing controls/listeners while presenting all settings as account-style rows. */
export function installSettingsRows(root: HTMLElement) {
    root.querySelectorAll<HTMLDetailsElement>('details.settings-category').forEach(category => {
        const section = document.createElement('section');
        section.className = category.className;
        for (const attr of Array.from(category.attributes)) if (attr.name !== 'class' && attr.name !== 'open') section.setAttribute(attr.name, attr.value);
        const heading = category.querySelector(':scope > summary');
        if (heading) {
            const header = document.createElement('div');
            header.className = heading.className;
            header.append(...Array.from(heading.childNodes));
            heading.replaceWith(header);
        }
        section.append(...Array.from(category.childNodes));
        category.replaceWith(section);
    });
    root.querySelectorAll<HTMLElement>('.settings-list-item > .form-group').forEach(group => {
        if (group.closest('.settings-setting-row') || group.querySelector(':scope > details')) return;
        const label = group.querySelector<HTMLLabelElement>(':scope > label');
        if (!label || group.style.display === 'none') return;
        const details = document.createElement('details');
        details.className = 'settings-setting-row';
        const summary = document.createElement('summary');
        const title = document.createElement('span');
        // Input-bearing labels remain intact in the expanded area; summaries only copy text.
        const copy = label.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('input,select,textarea').forEach(node => node.remove());
        title.append(...Array.from(copy.childNodes));
        if (label.dataset.i18n) title.dataset.i18n = label.dataset.i18n;
        summary.append(title);
        group.before(details);
        details.append(summary, group);
        if (!label.querySelector('input,select,textarea')) label.classList.add('settings-control-label');
    });
    root.querySelectorAll<HTMLElement>('details > summary').forEach(summary => {
        if (summary.classList.contains('settings-setting-summary')) return;
        summary.classList.add('settings-setting-summary');
        const chevron = document.createElement('i');
        chevron.className = 'fas fa-chevron-right settings-row-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        // data-i18n on summary replaces its children: move it onto a dedicated text span.
        if (summary.dataset.i18n) {
            const text = document.createElement('span');
            text.dataset.i18n = summary.dataset.i18n;
            text.append(...Array.from(summary.childNodes));
            summary.removeAttribute('data-i18n');
            summary.append(text);
        }
        summary.querySelectorAll('.settings-row-icon').forEach(icon => icon.remove());
        summary.append(chevron);
    });
}

export function createStorageAccessStatus(button: HTMLElement | null, app: any = window) {
    let busy = false;
    return async function refresh(interactive = false) {
        const invoke = app.__TAURI__?.core?.invoke || app.__TAURI__?.invoke;
        if (!button || !invoke || busy) return;
        busy = true;
        try {
            const result = await invoke('request_storage_access', { force: interactive, checkOnly: !interactive });
            let status = button.querySelector<HTMLElement>('.settings-access-status');
            if (!status) {
                status = document.createElement('span');
                status.className = 'settings-access-status';
                status.setAttribute('role', 'status');
                button.lastElementChild?.before(status);
            }
            status.hidden = !result?.granted;
            status.textContent = app.i18n?.getLanguage?.() === 'en' ? 'Authorized' : '已授权';
            if (interactive && result?.granted) app.showMessage?.(status.textContent, 'success');
        } catch (error) {
            if (interactive) app.showMessage?.(String(error), 'error');
        } finally { busy = false; }
    };
}
