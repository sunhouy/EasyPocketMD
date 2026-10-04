export type BackgroundSetting = { mode: 'default' | 'color' | 'image'; color: string; image: string };

export function normalizeBackground(value: any): BackgroundSetting {
    const color = /^#[\da-f]{6}$/i.test(value?.color || '') ? value.color : '#f5f7fa';
    const image = typeof value?.image === 'string' && value.image.length <= 800000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value.image) ? value.image : '';
    const mode = value?.mode === 'color' ? 'color' : value?.mode === 'image' && image ? 'image' : 'default';
    return { mode, color, image };
}

export function applyBackground(value: unknown) {
    const setting = normalizeBackground(value);
    const body = document.body;
    body.classList.toggle('custom-background', setting.mode !== 'default');
    body.style.removeProperty('--app-background-color');
    body.style.removeProperty('--app-background-image');
    if (setting.mode === 'default') return;
    body.style.setProperty('--app-background-color', setting.color);
    body.style.setProperty('--app-background-image', setting.mode === 'image' ? 'url("' + setting.image + '")' : 'none');
}

export async function readBackgroundImage(file: File): Promise<string> {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('backgroundInvalidImage');
    const url = URL.createObjectURL(file);
    try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('backgroundInvalidImage')); image.src = url; });
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('backgroundInvalidImage');
        const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('backgroundInvalidImage');
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.85, 0.7, 0.5, 0.3]) {
            const result = canvas.toDataURL('image/jpeg', quality);
            if (result.length <= 800000 && result.startsWith('data:image/jpeg;base64,')) return result;
        }
        throw new Error('backgroundInvalidImage');
    } finally { URL.revokeObjectURL(url); }
}

export function createBackgroundControls() {
    let draft = normalizeBackground(null);
    let generation = 0;
    let loading = false;
    const mode = document.getElementById('backgroundModeSelect') as HTMLSelectElement;
    const color = document.getElementById('backgroundColorInput') as HTMLInputElement;
    const file = document.getElementById('backgroundImageInput') as HTMLInputElement;
    const preview = document.getElementById('backgroundPreview')!;
    const status = document.getElementById('backgroundStatus')!;
    const t = (key: string) => (window as any).i18n?.t(key) || key;
    const update = () => {
        mode.value = draft.mode; color.value = draft.color;
        preview.style.backgroundColor = draft.mode === 'default' ? '' : draft.color;
        preview.style.backgroundImage = draft.mode === 'image' ? 'url("' + draft.image + '")' : draft.mode === 'default' ? '' : 'none';
        color.disabled = draft.mode === 'default';
        (mode.querySelector('option[value="image"]') as HTMLOptionElement).disabled = !draft.image;
    };
    mode.addEventListener('change', () => { draft.mode = mode.value === 'image' && draft.image ? 'image' : mode.value === 'color' ? 'color' : 'default'; update(); });
    color.addEventListener('input', () => { draft.color = color.value; update(); });
    file.addEventListener('change', async () => {
        const image = file.files?.[0]; if (!image) return;
        const request = ++generation; loading = true; status.textContent = t('backgroundProcessing');
        try {
            const data = await readBackgroundImage(image);
            if (request !== generation) return;
            draft.image = data; draft.mode = 'image'; update(); status.textContent = '';
        } catch (error) { if (request === generation) status.textContent = t('backgroundInvalidImage'); }
        finally { if (request === generation) { loading = false; file.value = ''; } }
    });
    (document.getElementById('backgroundResetBtn') as HTMLButtonElement)!.addEventListener('click', () => { generation++; loading = false; draft = normalizeBackground(null); file.value = ''; status.textContent = ''; update(); });
    return {
        open(value: unknown) { generation++; loading = false; draft = normalizeBackground(value); file.value = ''; status.textContent = ''; update(); },
        get() { return { ...draft }; },
        isLoading() { return loading; }
    };
}
