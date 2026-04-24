/// <reference path="../../../src/types/legacy.d.ts" />

/**
 * 阶段二测试：useEditorStore 编辑器状态管理
 * 测试 vditorReady 状态和 vditor 实例引用
 */
import { useEditorStore } from '../../../src/store/useEditorStore';

describe('useEditorStore', () => {
  beforeEach(() => {
    useEditorStore.setState({
      vditorReady: false,
      _vditorInstance: null,
    });
  });

  describe('initial state', () => {
    it('should have vditorReady as false by default', () => {
      expect(useEditorStore.getState().vditorReady).toBe(false);
    });

    it('should have _vditorInstance as null by default', () => {
      expect(useEditorStore.getState()._vditorInstance).toBeNull();
    });
  });

  describe('setVditorReady', () => {
    it('should update vditorReady to true', () => {
      useEditorStore.getState().setVditorReady(true);
      expect(useEditorStore.getState().vditorReady).toBe(true);
    });

    it('should update vditorReady to false', () => {
      useEditorStore.getState().setVditorReady(true);
      useEditorStore.getState().setVditorReady(false);
      expect(useEditorStore.getState().vditorReady).toBe(false);
    });
  });

  describe('setVditorInstance', () => {
    it('should store vditor instance', () => {
      const mockInstance = { getValue: jest.fn() };
      useEditorStore.getState().setVditorInstance(mockInstance);
      expect(useEditorStore.getState()._vditorInstance).toBe(mockInstance);
    });

    it('should clear vditor instance', () => {
      useEditorStore.getState().setVditorInstance({ getValue: jest.fn() });
      useEditorStore.getState().setVditorInstance(null);
      expect(useEditorStore.getState()._vditorInstance).toBeNull();
    });
  });
});
