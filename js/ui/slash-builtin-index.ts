// Slash builtin datasets split by category.
import { BUILTIN_FORMULA_ITEMS } from './slash-builtin/formulas';
import { BUILTIN_EMOJI_CATEGORIES, BUILTIN_EMOJI_DESCRIPTIONS } from './slash-builtin/emojis';
import { BUILTIN_MERMAID_TEMPLATES } from './slash-builtin/mermaid';

function isEn(): boolean {
    return !!(window.i18n && window.i18n.getLanguage && window.i18n.getLanguage() === 'en');
}

function t(key: string): string {
    return window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key;
}

function mermaidTemplateCode(keywords: string[] | undefined): string {
    if (Array.isArray(keywords) && keywords.indexOf('sequence') !== -1) {
        return '```mermaid\nsequenceDiagram\n    participant A as A\n    participant B as B\n    A->>B: Message\n```';
    }
    if (Array.isArray(keywords) && keywords.indexOf('class') !== -1) {
        return '```mermaid\nclassDiagram\n    Animal <|-- Dog\n```';
    }
    return '```mermaid\ngraph TD\n    A[开始] --> B[步骤]\n```';
}

export function getBuiltinSlashEntries() {
    const entries = [];

    for (let i = 0; i < BUILTIN_FORMULA_ITEMS.length; i++) {
        const item = BUILTIN_FORMULA_ITEMS[i];
        entries.push({
            id: 'builtin-formula-' + i,
            group: 'math',
            groupLabel: isEn() ? 'Formula' : '公式',
            titleZh: '公式 ' + item.display,
            titleEn: 'Formula ' + item.display,
            descriptionZh: item.latex,
            descriptionEn: item.latex,
            action: '',
            icon: 'fas fa-superscript',
            insertText: item.latex,
            keywords: ['公式', 'latex', item.display, item.latex].concat(item.keywords || []),
            aliases: [item.display, item.latex],
            score: 0
        });
    }

    const categories = Object.keys(BUILTIN_EMOJI_CATEGORIES);
    for (let c = 0; c < categories.length; c++) {
        const category = categories[c];
        const list = BUILTIN_EMOJI_CATEGORIES[category] || [];
        for (let i = 0; i < list.length; i++) {
            const emoji = list[i];
            const meta = BUILTIN_EMOJI_DESCRIPTIONS[emoji] || {};
            entries.push({
                id: 'builtin-emoji-' + c + '-' + i,
                group: 'insert',
                groupLabel: isEn() ? 'Insert' : '插入',
                titleZh: '表情 ' + (meta.zh || category),
                titleEn: 'Emoji ' + (meta.en || category),
                descriptionZh: emoji + ' · ' + category,
                descriptionEn: emoji + ' · ' + category,
                action: '',
                icon: 'fas fa-face-smile',
                insertText: emoji,
                keywords: ['emoji', '表情', category, emoji].concat(meta.aliases || []),
                aliases: [emoji, meta.zh || '', meta.en || ''].filter(Boolean),
                score: 0
            });
        }
    }

    for (let i = 0; i < BUILTIN_MERMAID_TEMPLATES.length; i++) {
        const tpl = BUILTIN_MERMAID_TEMPLATES[i];
        const name = t(tpl.nameKey);
        const desc = t(tpl.descKey);
        entries.push({
            id: 'builtin-mermaid-' + i,
            group: 'chart',
            groupLabel: isEn() ? 'Chart' : '图表',
            titleZh: 'Mermaid ' + name,
            titleEn: 'Mermaid ' + name,
            descriptionZh: desc,
            descriptionEn: desc,
            action: '',
            icon: 'fas fa-diagram-project',
            insertText: mermaidTemplateCode(tpl.keywords),
            keywords: ['mermaid', '图表', 'diagram'].concat(tpl.keywords || []),
            aliases: [name].concat(tpl.keywords || []),
            score: 0
        });
    }

    // 插入操作（图片、文件、链接等）
    const insertOperations = [
        {
            id: 'insert-image',
            titleZh: '图片',
            titleEn: 'Image',
            descriptionZh: '上传图片并插入到文档中',
            descriptionEn: 'Upload and insert image',
            action: 'uploadImage',
            icon: 'fas fa-image',
            keywords: ['图片', 'image', 'upload', '上传', 'img'],
            aliases: ['图片', 'image', 'img']
        },
        {
            id: 'insert-file',
            titleZh: '文件',
            titleEn: 'File',
            descriptionZh: '上传文件并插入到文档中',
            descriptionEn: 'Upload and insert file',
            action: 'uploadFile',
            icon: 'fas fa-file-upload',
            keywords: ['文件', 'file', 'upload', '上传'],
            aliases: ['文件', 'file']
        },
        {
            id: 'insert-webimage',
            titleZh: '网络图片',
            titleEn: 'Web Image',
            descriptionZh: '插入网络图片链接',
            descriptionEn: 'Insert web image URL',
            action: '',
            icon: 'fas fa-globe',
            insertText: '![图片描述](图片地址)',
            keywords: ['网络图片', 'web', 'image', 'url', '链接'],
            aliases: ['网络图片', 'web image']
        },
        {
            id: 'insert-link',
            titleZh: '链接',
            titleEn: 'Link',
            descriptionZh: '插入超链接',
            descriptionEn: 'Insert hyperlink',
            action: '',
            icon: 'fas fa-link',
            insertText: '[链接文字](https://)',
            keywords: ['链接', 'link', '超链接'],
            aliases: ['链接', 'link']
        },
        {
            id: 'insert-table',
            titleZh: '表格',
            titleEn: 'Table',
            descriptionZh: '插入表格',
            descriptionEn: 'Insert table',
            action: 'table',
            icon: 'fas fa-table',
            keywords: ['表格', 'table'],
            aliases: ['表格', 'table']
        },
        {
            id: 'insert-emoji',
            titleZh: '表情',
            titleEn: 'Emoji',
            descriptionZh: '插入表情符号',
            descriptionEn: 'Insert emoji',
            action: 'emoji',
            icon: 'fas fa-smile',
            keywords: ['表情', 'emoji'],
            aliases: ['表情', 'emoji']
        },
        {
            id: 'insert-formula',
            titleZh: '公式',
            titleEn: 'Formula',
            descriptionZh: '插入数学公式',
            descriptionEn: 'Insert math formula',
            action: 'formula',
            icon: 'fas fa-superscript',
            keywords: ['公式', 'formula', 'latex', '数学'],
            aliases: ['公式', 'formula']
        },
        {
            id: 'insert-chart',
            titleZh: '图表',
            titleEn: 'Chart',
            descriptionZh: '插入图表（Mermaid）',
            descriptionEn: 'Insert chart (Mermaid)',
            action: 'chart',
            icon: 'fas fa-chart-bar',
            keywords: ['图表', 'chart', 'mermaid'],
            aliases: ['图表', 'chart']
        },
        {
            id: 'insert-footnote',
            titleZh: '脚注',
            titleEn: 'Footnote',
            descriptionZh: '插入脚注',
            descriptionEn: 'Insert footnote',
            action: 'footnote',
            icon: 'fas fa-sticky-note',
            keywords: ['脚注', 'footnote', 'note'],
            aliases: ['脚注', 'footnote']
        },
        {
            id: 'insert-mindmap',
            titleZh: '脑图',
            titleEn: 'Mind Map',
            descriptionZh: '插入思维导图',
            descriptionEn: 'Insert mind map',
            action: 'mindmap',
            icon: 'fas fa-brain',
            keywords: ['脑图', 'mindmap', '思维导图'],
            aliases: ['脑图', 'mindmap']
        }
    ];

    for (let i = 0; i < insertOperations.length; i++) {
        const op = insertOperations[i];
        entries.push({
            id: op.id,
            group: 'insert',
            groupLabel: isEn() ? 'Insert' : '插入',
            titleZh: op.titleZh,
            titleEn: op.titleEn,
            descriptionZh: op.descriptionZh,
            descriptionEn: op.descriptionEn,
            action: op.action,
            icon: op.icon,
            insertText: op.insertText || '',
            keywords: op.keywords,
            aliases: op.aliases,
            score: 0
        });
    }

    return entries;
}
