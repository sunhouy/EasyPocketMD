## 目标
在 `src/components/Editor/Editor.tsx` 的 Lexical 编辑器中接入 **基础 Markdown** 的解析/渲染能力（以“输入时快捷语法自动转换”为主），并为后续升级到 **GFM** 预留稳定扩展点。

## 实现概览
- **Markdown 快捷解析**：使用 `@lexical/react/LexicalMarkdownShortcutPlugin`，在编辑过程中把 `# `、`> `、`- `、`1. `、`` ``` `` 等基础语法自动转换成对应节点。
- **节点注册**：在 `Editor.tsx` 的 `initialConfig.nodes` 中补齐了 Markdown 依赖的节点（标题、引用、列表、链接、代码块等）。
- **可扩展 transformers 出口**：新增 `src/components/Editor/markdown/transformers.ts`，统一提供 `getMarkdownTransformers(flavor)`；未来切到 GFM 只需要在此文件追加/替换 transformers，而不需要侵入 `Editor.tsx`。
- **样式对齐**：修正 `src/components/Editor/ExampleTheme.ts` 的 className 映射到当前 `src/components/Editor/style.css`，避免“解析了但看起来没渲染”的错觉。

## 关键改动文件
- `src/components/Editor/Editor.tsx`
  - 新增：`MarkdownShortcutPlugin`、`ListPlugin`、`LinkPlugin`
  - 新增节点：`HeadingNode`、`QuoteNode`、`ListNode`/`ListItemNode`、`LinkNode`、`CodeNode`
  - 引入：`getMarkdownTransformers('basic')`
  - 引入：`./style.css`（保证 editor 样式在组件级生效）
- `src/components/Editor/markdown/transformers.ts`
  - 目前基于 `@lexical/markdown` 的 `TRANSFORMERS` 作为基础集合
  - 预留：`flavor: 'gfm'` 分支（当前返回基础集合，保证调用方接口稳定）
- `src/components/Editor/ExampleTheme.ts`
  - 对齐 `style.css` 中的 `editor-text-bold` / `editor-heading-h1` / `editor-list-ol` 等 class 名

## 当前支持的“基础 Markdown”范围（通过快捷输入）
取决于 Lexical 自带 `TRANSFORMERS`，通常覆盖：
- 标题：`#` ~ `######`
- 引用：`>`
- 列表：`-`/`*`/`+`、`1.`
- 行内格式：`**bold**`、`*italic*`、`` `code` ``
- 代码块：````` ```lang `````（转换为 code block 节点）
- 链接：`[text](url)`

## 后续升级到 GFM 的建议
- 在 `src/components/Editor/markdown/transformers.ts` 的 `gfm` 分支中：
  - 追加 GFM transformers（如 table / task list / 自动链接等），或替换成一套新的 transformer 集合
  - 若需要“导入/导出 Markdown 字符串”，可继续引入 `@lexical/markdown` 的 `$convertToMarkdownString` / `$convertFromMarkdownString` 并在外层管理文档内容

## 注意事项
- Lexical 相关包版本需要保持一致（本次已将 `lexical` / `@lexical/react` 对齐到 `0.44.x`）。

