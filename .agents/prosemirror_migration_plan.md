# ProseMirror 升级与迁移计划

## 1. 背景与目标

当前 EasyPocketMD 使用 Vditor 作为 Markdown 编辑器。尽管 Vditor 开箱即用，但在复杂定制、React 生态融合以及未来可能的多人协作场景下存在局限。

本计划旨在阶段三将核心编辑器由 Vditor 升级为 **ProseMirror**。
**核心策略：先保留原有 Vditor 方案，增加一个 UI 按钮供用户主动选择切换至新版本（ProseMirror），通过 Feature Flag 在运行时双版本共存，确保随时可秒级回滚。**

**核心目标：**
1. 构建符合 React 范式的 ProseMirror 组件封装，彻底解决原有依赖全生命周期单例的隐患。
2. 重建所有核心快捷键、Markdown 语法高亮与特定格式支持。
3. 建立强健的 Schema 和 Parser/Serializer 测试体系。
4. 提供双编辑器无缝切换机制（Feature Flag 控制）。

---

## 2. 分段实施方案

### Phase 1 — Schema 与解析层
这是整个迁移的地基，必须在写任何 React 代码之前完成并通过测试。

**1. Schema 扩展：**
不要止步于原计划的 `basicSchema + list`，需要额外注册：
- `table`（含 `table_row`, `table_cell`, `table_header`）
- `task_item`（带 `checked` 属性的列表节点）
- `frontmatter`（YAML 区块，`isLeaf: true`，不可编辑子节点）

每个节点类型都要定义对应的 `toDOM` 和 `parseDOM`。

**2. 自定义 Parser / Serializer：**
`defaultMarkdownParser` 基于 `markdown-it` 默认配置，不支持 GFM 表格和 strikethrough。需要自定义：

```ts
import MarkdownIt from 'markdown-it';
import { MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown';

const md = new MarkdownIt({ html: false, linkify: true })
  .use(require('markdown-it-task-lists'))
  .use(require('markdown-it-table'));

export const customParser = new MarkdownParser(markdownSchema, md, {
  // 在此注册每种 token → ProseMirror node 的映射
  table: { block: 'table' },
  task_list_item: { 
    block: 'task_item', 
    getAttrs: tok => ({ checked: tok.attrGet('checked') !== null }) 
  },
  // ... 其他节点映射
});
```

**3. 测试策略（重点）：**
parser/serializer 层必须有 **幂等性单元测试**（`serialize(parse(md)) === md`）。
必须覆盖：普通段落、标题、有序/无序列表、task list、代码块（含语言标注）、表格、frontmatter、行内样式（粗体/斜体/删除线/链接）。这层稳固了，后续所有上层的问题才可以被有效隔离。

---

### Phase 2 — 插件体系
按功能隔离，每个插件写成单独的工厂函数，方便测试和按需替换。

**1. Keymap 快捷键声明：**
所有快捷键必须**显式声明**，不能依赖 ProseMirror 内置默认值（因为内置默认值在不同平台上行为不一致）。

```ts
import { keymap } from 'prosemirror-keymap';
import { toggleMark, setBlockType, wrapIn } from 'prosemirror-commands';

export const buildKeymap = (schema: Schema) => keymap({
  'Mod-b': toggleMark(schema.marks.strong),
  'Mod-i': toggleMark(schema.marks.em),
  'Mod-k': openLinkDialog,   // 弹出 Link 输入框的 command
  'Tab':   indentListItem,
  'Shift-Tab': dedentListItem,
  'Enter': splitListItemOrNewline,
  'Mod-z': undo,
  'Mod-y': redo,
  'Mod-Shift-z': redo,
});
```

**2. inputRules 快捷输入：**
实现 Markdown 快捷输入，这是打造极客用户体验的核心：
- `#`、`##`...`######` 触发对应标题
- `-`、`*`、`+` + 空格 触发无序列表
- `1.` + 空格 触发有序列表
- ` ``` ` + 语言名 触发代码块
- `>` + 空格 触发 blockquote
- `- [ ]` 触发 task item

**3. syntaxHighlight 语法高亮：**
用 ProseMirror `Decoration` 实现，**不修改** Document 状态本身。以 `highlight.js` 懒加载语言包，使用 `debounce`（50ms）避免频繁触发计算，且仅处理视口（Viewport）可见范围内的代码块。

---

### Phase 3 — React 封装组件与平滑切换

**1. 解决文件切换问题（生命周期修正）：**
原 `vditor` 实现通过单例变更内容，现需改为按文件 ID 重建实例，解决状态残留等幽灵 Bug。

```tsx
useEffect(() => {
  if (!editorRef.current) return;
  
  // 每次 fileId 变化时销毁旧实例、创建新实例
  viewRef.current?.destroy();
  
  const state = EditorState.create({
    doc: customParser.parse(initialContent ?? ''),
    plugins: buildPlugins(markdownSchema),
  });
  
  viewRef.current = new EditorView(editorRef.current, {
    state,
    dispatchTransaction(tr) {
      const newState = viewRef.current!.state.apply(tr);
      viewRef.current!.updateState(newState);
      if (tr.docChanged) {
        onChange(customSerializer.serialize(newState.doc));
      }
    },
  });
  
  return () => { viewRef.current?.destroy(); viewRef.current = null; };
}, [fileId]); // 依赖 fileId，而非空数组
```

**2. UI 入口：增加版本切换按钮：**
在 UI 顶部或设置区域增加一个开关，允许用户在 Vditor 和 ProseMirror 之间主动切换。切换逻辑由 Zustand Store 的 Feature Flag 状态（如 `editorType: 'vditor' | 'prosemirror'`）控制。根组件 `<EditorLayout />` 根据该状态动态挂载 `<VditorWrapper />` 或 `<ProseMirrorEditor />`。

**3. Toolbar 直连 commands：**
利用 React 的 `EditorContext` 暴露当前编辑器的 `EditorView`。Toolbar 组件直接调用 ProseMirror 的 command 方法，彻底脱离 `window.vditor`：

```tsx
const { execCommand } = useEditor(); // 从 EditorContext 取
<button onClick={() => execCommand(toggleMark(schema.marks.strong))}>B</button>
```

**4. EditorAdapter（过渡期兜底层）：**
承认旧代码的存在价值，但要明确其**退场计划**。
编写一个 `EditorAdapter`，把遗留系统中散落的 `window.vditor` 调用全部收口到这个 Adapter 里，并在代码中打上 `// TODO: remove after Vditor cleanup sprint` 注释，配合 ESLint 规则（如 no-restricted-globals）禁止任何新代码直接访问 `window.vditor`。

---

### Phase 4 — 清理与收尾

**1. 双屏预览滚动同步：**
采用「行号比例」作为同步锚点：
- 记录当前 ProseMirror 可见区域的起始行号。
- 在预览侧（Markdown-it 渲染的结果）使用等比例偏移量同步滚动。
- 技术手段：通过 ProseMirror 的 `coordsAtPos` 获取位置坐标，映射到预览侧的 DOM 锚点上。

**2. Feature flag 控制：**
在整个迁移期间，用一个环境变量控制：`EDITOR=prosemirror|vditor`。在遇到严重问题时秒级切换至 `vditor`，避免走 `git revert` 流程。

**3. 最终删除 Vditor：**
用 `grep` 扫描全库或通过 AST 检测，找出所有历史遗留的调用点。
当这部分代码逐步替换为 `useEditor()` hook 之后，删掉 `EditorAdapter` 和 `window.vditor` 全局声明，这标志着整个迁移彻底完成。
