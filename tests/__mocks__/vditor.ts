/**
 * Vditor Mock
 * 模拟 Vditor 编辑器实例，供测试环境使用
 * 阶段三 VditorWrapper 组件测试会用到此 mock
 */
const mockVditorInstance = {
  getValue: jest.fn(() => ''),
  setValue: jest.fn(),
  getHTML: jest.fn(() => ''),
  getText: jest.fn(() => ''),
  insertValue: jest.fn(),
  focus: jest.fn(),
  blur: jest.fn(),
  destroy: jest.fn(),
  resize: jest.fn(),
};

jest.mock('vditor', () => {
  return jest.fn().mockImplementation(() => mockVditorInstance);
});

export default mockVditorInstance;