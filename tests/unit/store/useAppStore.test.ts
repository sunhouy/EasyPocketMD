/// <reference path="../../../src/types/legacy.d.ts" />

/**
 * 阶段二测试：useAppStore 核心应用状态管理
 * 测试状态初始化、setter 方法、文件操作方法
 */
import { useAppStore } from '../../../src/store/useAppStore';

describe('useAppStore', () => {
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
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initial state', () => {
    it('should have null currentUser by default', () => {
      expect(useAppStore.getState().currentUser).toBeNull();
    });

    it('should have empty files array by default', () => {
      expect(useAppStore.getState().files).toEqual([]);
    });

    it('should have null currentFileId by default', () => {
      expect(useAppStore.getState().currentFileId).toBeNull();
    });

    it('should have empty unsavedChanges by default', () => {
      expect(useAppStore.getState().unsavedChanges).toEqual({});
    });

    it('should have appSessionId defined', () => {
      expect(useAppStore.getState().appSessionId).toBeDefined();
    });
  });

  describe('setCurrentUser', () => {
    it('should update currentUser', () => {
      const user = { id: '1', username: 'test' };
      useAppStore.getState().setCurrentUser(user);
      expect(useAppStore.getState().currentUser).toEqual(user);
    });

    it('should set currentUser to null', () => {
      useAppStore.getState().setCurrentUser({ id: '1', username: 'test' });
      useAppStore.getState().setCurrentUser(null);
      expect(useAppStore.getState().currentUser).toBeNull();
    });
  });

  describe('setFiles', () => {
    it('should update files array', () => {
      const files = [{ id: '1', name: 'test.md', content: '', created: 1, modified: 1 }];
      useAppStore.getState().setFiles(files);
      expect(useAppStore.getState().files).toEqual(files);
    });
  });

  describe('setCurrentFileId', () => {
    it('should update currentFileId', () => {
      useAppStore.getState().setCurrentFileId('file-1');
      expect(useAppStore.getState().currentFileId).toBe('file-1');
    });

    it('should set currentFileId to null', () => {
      useAppStore.getState().setCurrentFileId('file-1');
      useAppStore.getState().setCurrentFileId(null);
      expect(useAppStore.getState().currentFileId).toBeNull();
    });
  });

  describe('markUnsaved', () => {
    it('should mark file as unsaved', () => {
      useAppStore.getState().markUnsaved('file-1', true);
      expect(useAppStore.getState().unsavedChanges['file-1']).toBe(true);
    });

    it('should mark file as saved', () => {
      useAppStore.getState().markUnsaved('file-1', true);
      useAppStore.getState().markUnsaved('file-1', false);
      expect(useAppStore.getState().unsavedChanges['file-1']).toBe(false);
    });
  });

  describe('addFile', () => {
    it('should add file to files array', () => {
      const file = { id: '1', name: 'new.md', content: '', created: 1, modified: 1 };
      useAppStore.getState().addFile(file);
      expect(useAppStore.getState().files).toHaveLength(1);
      expect(useAppStore.getState().files[0]).toEqual(file);
    });

    it('should persist files to localStorage', () => {
      const file = { id: '1', name: 'new.md', content: '', created: 1, modified: 1 };
      useAppStore.getState().addFile(file);
      const saved = JSON.parse(localStorage.getItem('vditor_files') || '[]');
      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe('1');
    });
  });

  describe('updateFile', () => {
    it('should update existing file', () => {
      const file = { id: '1', name: 'old.md', content: 'old', created: 1, modified: 1 };
      useAppStore.getState().setFiles([file]);
      useAppStore.getState().updateFile('1', { name: 'new.md', content: 'new' });
      expect(useAppStore.getState().files[0].name).toBe('new.md');
      expect(useAppStore.getState().files[0].content).toBe('new');
    });

    it('should not modify other files', () => {
      const files = [
        { id: '1', name: 'a.md', content: '', created: 1, modified: 1 },
        { id: '2', name: 'b.md', content: '', created: 1, modified: 1 },
      ];
      useAppStore.getState().setFiles(files);
      useAppStore.getState().updateFile('1', { name: 'updated.md' });
      expect(useAppStore.getState().files[1].name).toBe('b.md');
    });
  });

  describe('removeFile', () => {
    it('should remove file by id', () => {
      const files = [
        { id: '1', name: 'a.md', content: '', created: 1, modified: 1 },
        { id: '2', name: 'b.md', content: '', created: 1, modified: 1 },
      ];
      useAppStore.getState().setFiles(files);
      useAppStore.getState().removeFile('1');
      expect(useAppStore.getState().files).toHaveLength(1);
      expect(useAppStore.getState().files[0].id).toBe('2');
    });
  });
});
