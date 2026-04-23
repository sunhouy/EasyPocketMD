/** @jest-environment jsdom */
/**
 * 阶段一测试：验证 legacy.d.ts 全局类型定义完整性
 * 确保所有 window.* 全局变量在测试环境中已正确声明和 mock
 */
/// <reference path="../../src/types/legacy.d.ts" />

describe('legacy.d.ts Window interface', () => {
  it('should have vditor global variable', () => {
    expect(window.vditor).toBeDefined();
  });

  it('should have vditorReady boolean', () => {
    expect(typeof window.vditorReady).toBe('boolean');
  });

  it('should have files array', () => {
    expect(Array.isArray(window.files)).toBe(true);
  });

  it('should have currentFileId as string or null', () => {
    expect(window.currentFileId === null || typeof window.currentFileId === 'string').toBe(true);
  });

  it('should have nightMode boolean', () => {
    expect(typeof window.nightMode).toBe('boolean');
  });

  it('should have unsavedChanges object', () => {
    expect(typeof window.unsavedChanges).toBe('object');
  });

  it('should have userSettings object', () => {
    expect(typeof window.userSettings).toBe('object');
  });

  it('should have pendingServerSync boolean', () => {
    expect(typeof window.pendingServerSync).toBe('boolean');
  });

  it('should have isFileSwitchLoading boolean', () => {
    expect(typeof window.isFileSwitchLoading).toBe('boolean');
  });

  it('should have enterFileManagementMode function', () => {
    expect(typeof window.enterFileManagementMode).toBe('function');
  });

  it('should have enterEditorMode function', () => {
    expect(typeof window.enterEditorMode).toBe('function');
  });

  it('should have ensureWasmTextEngineReady function', () => {
    expect(typeof window.ensureWasmTextEngineReady).toBe('function');
  });

  it('should have ensureVditorInitialized function', () => {
    expect(typeof window.ensureVditorInitialized).toBe('function');
  });

  it('should have showSettingsDialog function', () => {
    expect(typeof window.showSettingsDialog).toBe('function');
  });

  it('should have showAboutDialog function', () => {
    expect(typeof window.showAboutDialog).toBe('function');
  });

  it('should have isFileManagementMode boolean', () => {
    expect(typeof window.isFileManagementMode).toBe('boolean');
  });

  it('should have isTauriMobileEnvironment boolean', () => {
    expect(typeof window.isTauriMobileEnvironment).toBe('boolean');
  });

  it('should have toolbarUncertaintyUnlocked boolean', () => {
    expect(typeof window.toolbarUncertaintyUnlocked).toBe('boolean');
  });

  it('should have _hmt array', () => {
    expect(Array.isArray(window._hmt)).toBe(true);
  });
});