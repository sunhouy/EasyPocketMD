// 将 Markdown 转换为纯文本
export function markdownToPlainText(markdown: string) {
    if (!markdown) return '';

    return markdown
        // 去掉代码块
        .replace(/```[\s\S]*?```/g, '')
        // 去掉行内代码
        .replace(/`([^`]+)`/g, '$1')
        // 去掉标题标记 #
        .replace(/^#{1,6}\s+/gm, '')
        // 去掉粗体 ** 和 __
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        // 去掉斜体 * 和 _
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // 去掉删除线 ~~
        .replace(/~~([^~]+)~~/g, '$1')
        // 先去掉图片，再处理链接
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
        // 去掉任务列表标记
        .replace(/^\s*[-+*]\s+\[[ xX]\]\s*/gm, '')
        // 去掉链接，只保留文本 [text](url) -> text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // 去掉引用标记 >
        .replace(/^>\s*/gm, '')
        // 去掉列表标记 - + *
        .replace(/^[-+*]\s+/gm, '')
        // 去掉有序列表标记 1. 2. 等
        .replace(/^\d+\.\s+/gm, '')
        // 去掉水平分割线 --- *** ___
        .replace(/^[\-\*_]{3,}\s*$/gm, '')
        // 去掉 HTML 标签
        .replace(/<[^>]+>/g, '')
        // 将多个空行合并为一个
        .replace(/\n{3,}/g, '\n\n')
        // 去掉行首空格
        .replace(/^[ \t]+/gm, '')
        // 去掉首尾空白
        .trim();
}

