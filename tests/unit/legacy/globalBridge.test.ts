/// <reference path="../../../src/types/legacy.d.ts" />

/**
 * 阶段二测试：globalBridge 双向同步桥
 * 测试 window.* ↔ Zustand 双向同步及防死循环机制
 * 规则要求：globalBridge 修改后必须更新死循环检测用例
 */
import { useAppStore } from '../../../src/store/useAppStore';
import { useEditorStore } from '../../../src/store/useEditorStore';
import { useUIStore } from '../../../src/store/useUIStore';
import { initGlobalBridge } from '../../../src/legacy/globalBridge';

describe('globalBridge', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentUser: null,
      files: [],
      currentFileId: null,
      unsavedChanges: {},
      pendingServerSync: {},
      lastSyncedContent: {},
      appSessionId: 'test_session',
    });
    useEditorStore.setState({
      vditorReady: false,
      _vditorInstance: null,
    });
    useUIStore.setState({
      nightMode: false,
      userSettings: {
        toolbarButtons: [],
        themeMode: 'system',
        fontSize: '16px',
        showOutline: false,
        enableDebugMode: false,
        enableSlashCommand: true,
        slashCommandActivationKey: 'Tab',
        defaultEditorMode: 'wysiwyg',
        language: 'zh',
        uiMode: 'auto',
        storageLocation: 'cloud',
        defaultFileOpening: 'lastEdited',
        defaultSorting: 'modifiedTime',
        enableWasmTextEngine: true,
        mdFileAssociationEnabled: true,
        hideBottomToolbarOnKeyboard: false,
      },
      isFileManagementMode: false,
      isFileSwitchLoading: false,
      toolbarUncertaintyUnlocked: false,
      startInFileManagementMode: false,
      deferInitialFileOpen: false,
      isTauriMobileEnvironment: false,
      editorInterfaceMode: 'desktop',
    });
    localStorage.clear();
  });

  describe('initGlobalBridge', () => {
    it('should initialize without error', () => {
      expect(() => initGlobalBridge()).not.toThrow();
    });
  });

  describe('AppStore bidirectional sync', () => {
    beforeEach(() => {
      initGlobalBridge();
    });

    it('should sync currentUser from store to window', () => {
      const user = { id: '1', username: 'test' };
      useAppStore.getState().setCurrentUser(user);
      expect(window.currentUser).toEqual(user);
    });

    it('should sync files from store to window', () => {
      const files = [{ id: '1', name: 'test.md', content: '', created: 1, modified: 1 }];
      useAppStore.getState().setFiles(files);
      expect(window.files).toEqual(files);
    });

    it('should sync currentFileId from store to window', () => {
      useAppStore.getState().setCurrentFileId('file-1');
      expect(window.currentFileId).toBe('file-1');
    });

    it('should sync currentUser from window to store', () => {
      const user = { id: '2', username: 'window-user' };
      window.currentUser = user;
      expect(useAppStore.getState().currentUser).toEqual(user);
    });

    it('should sync files from window to store', () => {
      const files = [{ id: '2', name: 'window.md', content: '', created: 1, modified: 1 }];
      window.files = files;
      expect(useAppStore.getState().files).toEqual(files);
    });

    it('should sync currentFileId from window to store', () => {
      window.currentFileId = 'window-file';
      expect(useAppStore.getState().currentFileId).toBe('window-file');
    });
  });

  describe('EditorStore bidirectional sync', () => {
    beforeEach(() => {
      initGlobalBridge();
    });

    it('should sync vditorReady from store to window', () => {
      useEditorStore.getState().setVditorReady(true);
      expect(window.vditorReady).toBe(true);
    });

    it('should sync vditorReady from window to store', () => {
      window.vditorReady = true;
      expect(useEditorStore.getState().vditorReady).toBe(true);
    });
  });

  describe('UIStore bidirectional sync', () => {
    beforeEach(() => {
      initGlobalBridge();
    });

    it('should sync nightMode from store to window', () => {
      useUIStore.getState().setNightMode(true);
      expect(window.nightMode).toBe(true);
    });

    it('should sync nightMode from window to store', () => {
      window.nightMode = true;
      expect(useUIStore.getState().nightMode).toBe(true);
    });

    it('should sync isFileManagementMode from window to store', () => {
      window.isFileManagementMode = true;
      expect(useUIStore.getState().isFileManagementMode).toBe(true);
    });

    it('should sync isFileSwitchLoading from window to store', () => {
      window.isFileSwitchLoading = true;
      expect(useUIStore.getState().isFileSwitchLoading).toBe(true);
    });
  });

  describe('anti-infinite-loop protection', () => {
    beforeEach(() => {
      initGlobalBridge();
    });

    it('should NOT cause infinite loop when setting currentUser from store', () => {
      const listener = jest.fn();
      const unsubscribe = useAppStore.subscribe(listener);
      
      useAppStore.getState().setCurrentUser({ id: '1', username: 'test' });
      
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('should NOT cause infinite loop when setting currentUser from window', () => {
      const listener = jest.fn();
      const unsubscribe = useAppStore.subscribe(listener);
      
      window.currentUser = { id: '1', username: 'test' };
      
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('should NOT cause infinite loop when setting files from store', () => {
      const listener = jest.fn();
      const unsubscribe = useAppStore.subscribe(listener);
      
      useAppStore.getState().setFiles([{ id: '1', name: 'test.md', content: '', created: 1, modified: 1 }]);
      
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('should NOT cause infinite loop when setting files from window', () => {
      const listener = jest.fn();
      const unsubscribe = useAppStore.subscribe(listener);
      
      window.files = [{ id: '1', name: 'test.md', content: '', created: 1, modified: 1 }];
      
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('should NOT cause infinite loop when setting vditorReady from store', () => {
      const listener = jest.fn();
      const unsubscribe = useEditorStore.subscribe(listener);
      
      useEditorStore.getState().setVditorReady(true);
      
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('should NOT cause infinite loop when setting vditorReady from window', () => {
      const listener = jest.fn();
      const unsubscribe = useEditorStore.subscribe(listener);
      
      window.vditorReady = true;
      
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('should NOT cause infinite loop when setting nightMode from store', () => {
      const listener = jest.fn();
      const unsubscribe = useUIStore.subscribe(listener);
      
      useUIStore.getState().setNightMode(true);
      
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('should NOT cause infinite loop when setting nightMode from window', () => {
      const listener = jest.fn();
      const unsubscribe = useUIStore.subscribe(listener);
      
      window.nightMode = true;
      
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('should handle rapid alternating updates without loop', () => {
      const listener = jest.fn();
      const unsubscribe = useAppStore.subscribe(listener);
      
      for (let i = 0; i < 5; i++) {
        useAppStore.getState().setCurrentUser({ id: String(i), username: `user${i}` });
        window.currentUser = { id: String(i + 10), username: `window${i}` };
      }
      
      expect(listener).toHaveBeenCalledTimes(10);
      unsubscribe();
    });
  });
});
