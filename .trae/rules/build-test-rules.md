# EasyPocketMD — AI 生成前端测试代码准则

> 所有 AI 智能体在为 `src/` 目录下的前端代码生成测试时，必须遵守本文件。

---

## 1. 技术栈

| 工具 | 说明 |
|------|------|
| Jest ≥ 30 + `jest-environment-jsdom` | 已安装，不可更换 |
| `@testing-library/react` + `@testing-library/jest-dom` | React 组件 & Hook 测试 |
| Zustand Store | 直接调用 store API 测试，无需渲染 |

**禁止使用**：Enzyme、Sinon、Cypress、Playwright、`@testing-library/react-hooks`（已合并进 `@testing-library/react`）、`toMatchSnapshot()`。

---

## 2. 文件组织

```
tests/unit/
├── components/          # React 组件测试（*.test.tsx）
├── hooks/               # Hook 测试（*.test.ts）
├── store/               # Zustand Store 测试（*.test.ts）
└── legacy/              # globalBridge 测试（*.test.ts）
tests/__mocks__/         # 手动 mock（如 vditor.ts）
```

- 文件名与源文件一一对应：`src/hooks/useAutoSave.ts` → `tests/unit/hooks/useAutoSave.test.ts`
- 前端测试文件顶部声明 `/** @jest-environment jsdom */`
- `describe` 用模块名，`it` 用 **should + 动词**

---

## 3. 测试模式速查

### 3.1 Zustand Store

```ts
import { useAppStore } from '@/store/useAppStore';

beforeEach(() => {
  useAppStore.setState({ currentUser: null, files: [], currentFileId: null });
});

it('should update currentUser', () => {
  useAppStore.getState().setCurrentUser({ id: '1', username: 'test' });
  expect(useAppStore.getState().currentUser).toEqual({ id: '1', username: 'test' });
});
```

### 3.2 React 组件

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

it('should render file list', () => {
  render(<FileList />);
  expect(screen.getByText('文档一')).toBeInTheDocument();
});
```

- 使用 `screen` 查询，优先 `getByRole` > `getByText` > `getByTestId`
- 禁止 `container.querySelector`、禁止访问组件内部 state

### 3.3 自定义 Hook

```ts
import { renderHook, waitFor } from '@testing-library/react';

it('should init engine', async () => {
  const { result } = renderHook(() => useWasmTextEngine());
  await waitFor(() => expect(result.current.ready).toBe(true));
});
```

### 3.4 globalBridge（必须包含死循环检测）

```ts
it('should NOT cause infinite loop', () => {
  initGlobalBridge();
  const listener = jest.fn();
  useAppStore.subscribe(listener);
  (window as any).files = [{ id: '1' }];
  expect(listener).toHaveBeenCalledTimes(1); // 无死循环
});
```

---

## 4. 必须 Mock / 禁止 Mock

| 必须 Mock | 禁止 Mock |
|-----------|-----------|
| `vditor`（非 React DOM 库） | `react` / `react-dom` |
| `window.wasmTextEngineGateway` | `zustand`（store 测试用真实 store） |
| `window.tauriBridge` | `@testing-library/*` |
| `fetch` / `localStorage`（`beforeEach` 中 `clear`） | |

---

## 5. 强制规则

1. **新建 `src/` 下的 store / hook / component 时，必须同步生成测试**
2. **修改 `globalBridge.ts` 后必须更新死循环检测用例**
3. **Arrange → Act → Assert** 三段式；一个 `it` 只测一件事
4. **禁止** `setTimeout` 做等待，用 `waitFor` / `findBy*`
5. **禁止** `test.skip` 进入主分支（必须附 TODO 并记入 `handover.md`）
6. **禁止** 为了通过测试而降低断言标准或删除用例
7. 每个测试独立运行：`beforeEach` 重置 mock + store，`afterEach` 恢复 `window` 属性

---

## 6. 执行流程

```
代码修改 → npm test → tsc --noEmit → Chrome DevTools MCP 验证 → handover.md
```

测试失败循环 ≤ 3 次仍未通过 → 记入 `handover.md`。
