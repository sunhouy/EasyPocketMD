/// <reference path="../../../src/types/legacy.d.ts" />

/**
 * 阶段二测试：useUIStore UI 状态管理
 * 测试 nightMode、userSettings、界面模式等状态
 */
import { useUIStore } from '../../../src/store/useUIStore';

describe('useUIStore', () => {
  beforeEach(() => {
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

  afterEach(() => {
    localStorage.clear();
  });

  describe('initial state', () => {
    it('should have nightMode as false by default', () => {
      expect(useUIStore.getState().nightMode).toBe(false);
    });

    it('should have isFileManagementMode as false by default', () => {
      expect(useUIStore.getState().isFileManagementMode).toBe(false);
    });

    it('should have isFileSwitchLoading as false by default', () => {
      expect(useUIStore.getState().isFileSwitchLoading).toBe(false);
    });

    it('should have userSettings with defaults', () => {
      const settings = useUIStore.getState().userSettings;
      expect(settings.themeMode).toBe('system');
      expect(settings.language).toBe('zh');
      expect(settings.defaultEditorMode).toBe('wysiwyg');
    });
  });

  describe('setNightMode', () => {
    it('should update nightMode', () => {
      useUIStore.getState().setNightMode(true);
      expect(useUIStore.getState().nightMode).toBe(true);
    });

    it('should persist to localStorage', () => {
      useUIStore.getState().setNightMode(true);
      expect(localStorage.getItem('vditor_night_mode')).toBe('true');
    });
  });

  describe('setUserSettings', () => {
    it('should update userSettings', () => {
      const newSettings = { ...useUIStore.getState().userSettings, language: 'en' };
      useUIStore.getState().setUserSettings(newSettings);
      expect(useUIStore.getState().userSettings.language).toBe('en');
    });

    it('should persist to localStorage', () => {
      const newSettings = { ...useUIStore.getState().userSettings, language: 'en' };
      useUIStore.getState().setUserSettings(newSettings);
      const saved = JSON.parse(localStorage.getItem('vditor_settings') || '{}');
      expect(saved.language).toBe('en');
    });
  });

  describe('updateUserSetting', () => {
    it('should update single setting', () => {
      useUIStore.getState().updateUserSetting('fontSize', '20px');
      expect(useUIStore.getState().userSettings.fontSize).toBe('20px');
    });

    it('should preserve other settings', () => {
      useUIStore.getState().updateUserSetting('fontSize', '20px');
      expect(useUIStore.getState().userSettings.language).toBe('zh');
    });
  });

  describe('setIsFileManagementMode', () => {
    it('should update isFileManagementMode', () => {
      useUIStore.getState().setIsFileManagementMode(true);
      expect(useUIStore.getState().isFileManagementMode).toBe(true);
    });
  });

  describe('setIsFileSwitchLoading', () => {
    it('should update isFileSwitchLoading', () => {
      useUIStore.getState().setIsFileSwitchLoading(true);
      expect(useUIStore.getState().isFileSwitchLoading).toBe(true);
    });
  });

  describe('setEditorInterfaceMode', () => {
    it('should update editorInterfaceMode to mobile', () => {
      useUIStore.getState().setEditorInterfaceMode('mobile');
      expect(useUIStore.getState().editorInterfaceMode).toBe('mobile');
    });

    it('should update editorInterfaceMode to desktop', () => {
      useUIStore.getState().setEditorInterfaceMode('mobile');
      useUIStore.getState().setEditorInterfaceMode('desktop');
      expect(useUIStore.getState().editorInterfaceMode).toBe('desktop');
    });
  });
});
