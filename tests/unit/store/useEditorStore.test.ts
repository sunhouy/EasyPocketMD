/// <reference path="../../../src/types/legacy.d.ts" />

/**
 * 阶段二/三测试：useEditorStore 编辑器状态管理
 * 测试 vditorReady 状态、vditor 实例引用、editorType 切换
 */
import { useEditorStore } from '../../../src/store/useEditorStore';

describe('useEditorStore', () => {
  beforeEach(() => {
    useEditorStore.setState({
      vditorReady: false,
      _vditorInstance: null,
      editorType: 'vditor',
      prosemirrorContent: null,
    });
    localStorage.clear();
  });

  describe('initial state', () => {
    it('should have vditorReady as false by default', () => {
      expect(useEditorStore.getState().vditorReady).toBe(false);
    });

    it('should have _vditorInstance as null by default', () => {
      expect(useEditorStore.getState()._vditorInstance).toBeNull();
    });

    it('should have editorType as vditor by default', () => {
      expect(useEditorStore.getState().editorType).toBe('vditor');
    });

    it('should have prosemirrorContent as null by default', () => {
      expect(useEditorStore.getState().prosemirrorContent).toBeNull();
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

  describe('setEditorType', () => {
    it('should switch to prosemirror', () => {
      useEditorStore.getState().setEditorType('prosemirror');
      expect(useEditorStore.getState().editorType).toBe('prosemirror');
    });

    it('should persist choice to localStorage', () => {
      useEditorStore.getState().setEditorType('prosemirror');
      expect(localStorage.getItem('editor_type')).toBe('prosemirror');
    });

    it('should switch back to vditor', () => {
      useEditorStore.getState().setEditorType('prosemirror');
      useEditorStore.getState().setEditorType('vditor');
      expect(useEditorStore.getState().editorType).toBe('vditor');
    });
  });

  describe('setProsemirrorContent', () => {
    it('should update content', () => {
      useEditorStore.getState().setProsemirrorContent('# Hello');
      expect(useEditorStore.getState().prosemirrorContent).toBe('# Hello');
    });

    it('should clear content', () => {
      useEditorStore.getState().setProsemirrorContent('# Hello');
      useEditorStore.getState().setProsemirrorContent(null);
      expect(useEditorStore.getState().prosemirrorContent).toBeNull();
    });
  });
});
