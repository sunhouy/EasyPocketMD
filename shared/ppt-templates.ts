/** Adapted from wuhua2026/ppt-templates (MIT). See vendor/ppt-templates/LICENSE. */
export interface PPTTemplate {
    id: string; name: string; nameEn: string; style: 'split' | 'gradient' | 'layered';
    bg: string; text: string; sub: string; accent: string; secondary: string;
}
export const PPT_TEMPLATES: readonly PPTTemplate[] = [
    { id: 'blue-split', name: '蓝色科技 · 分屏', nameEn: 'Blue technology · Split', style: 'split', bg: 'FFFFFF', text: '212121', sub: '526174', accent: '0066CC', secondary: '00CC99' },
    { id: 'purple-depth', name: '紫色创意 · 层次', nameEn: 'Creative purple · Layered', style: 'layered', bg: 'FFFFFF', text: '212121', sub: '655477', accent: '7B2FBE', secondary: 'E040FB' },
    { id: 'dark-gold', name: '暗金商务 · 层次', nameEn: 'Dark gold · Layered', style: 'layered', bg: '1A1A2E', text: 'F0F0F0', sub: 'CBCBD5', accent: 'C9A96E', secondary: 'B48C50' },
    { id: 'minimal-split', name: '极简黑白 · 分屏', nameEn: 'Minimal monochrome · Split', style: 'split', bg: 'FFFFFF', text: '000000', sub: '555555', accent: '000000', secondary: '333333' },
    { id: 'ocean-gradient', name: '海洋蓝 · 色块', nameEn: 'Ocean blue · Color block', style: 'gradient', bg: 'FFFFFF', text: '212121', sub: '526174', accent: '0077B6', secondary: '00B4D8' },
    { id: 'green-gradient', name: '自然绿 · 色块', nameEn: 'Natural green · Color block', style: 'gradient', bg: 'FFFFFF', text: '212121', sub: '416052', accent: '2D6A4F', secondary: '52B788' },
    { id: 'red-split', name: '红色商务 · 分屏', nameEn: 'Business red · Split', style: 'split', bg: 'FFFFFF', text: '212121', sub: '705653', accent: 'C0392B', secondary: 'E74C3C' }
];
export function getPPTTemplate(id: unknown): PPTTemplate | undefined {
    return PPT_TEMPLATES.find(template => template.id === id);
}
