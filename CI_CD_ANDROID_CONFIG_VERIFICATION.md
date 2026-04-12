# ✅ Android 构建流程验证 - CI/CD 配置检查

## 📋 已做的修改

### 1. GitHub Actions 工作流更新

**文件**: `.github/workflows/build-android.yml`

**添加的步骤**:
1. ✅ **Apply Android theme configuration（应用主题配置）**
   - 执行 `scripts/apply-android-config.sh`
   - 应用状态栏主题配置和 MainActivity 设置
   - 时机：Android 项目初始化后

2. ✅ **Configure Android permissions（配置权限）**
   - 执行 `scripts/configure-android-permissions.sh`
   - 添加摄像头、麦克风和文件访问权限
   - 时机：应用主题配置后

### 2. 权限配置脚本

**文件**: `scripts/configure-android-permissions.sh` ✅

添加的权限：
```
- android.permission.CAMERA                 📷 摄像头
- android.permission.RECORD_AUDIO          🎤 麦克风
- android.permission.READ_EXTERNAL_STORAGE 📁 读取存储
- android.permission.WRITE_EXTERNAL_STORAGE 📝 写入存储
- android.permission.MANAGE_EXTERNAL_STORAGE 📂 管理所有文件
```

特性：
- ✅ 自动检查 AndroidManifest.xml 是否存在
- ✅ 检查权限是否已添加（避免重复）
- ✅ 在 </manifest> 之前插入权限声明
- ✅ 提供详细的日志输出

### 3. tauri.android.conf.json 配置

**文件**: `src-tauri/tauri.android.conf.json`

现有配置：
```json
{
  "app": { ... },
  "android": {
    "minSdkVersion": 24,
    "targetSdkVersion": 34,
    "permissions": [
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.MANAGE_EXTERNAL_STORAGE",
      "android.permission.INTERNET",
      "android.permission.ACCESS_NETWORK_STATE"
    ]
  }
}
```

## 🔄 CI/CD 构建流程

### 构建步骤顺序

```
1. 检出代码
   ↓
2. 设置 Node.js, Java, Rust, Android SDK
   ↓
3. 安装依赖
   ↓
4. 构建 Web 前端
   ↓
5. 初始化 Android 项目（如果需要）
   ↓
6. ✅ 应用 Android 主题配置 [NEW]
      - 设置状态栏主题
      - 配置 MainActivity
   ↓
7. ✅ 配置 Android 权限 [NEW]
      - 添加摄像头权限
      - 添加麦克风权限
      - 添加文件访问权限
   ↓
8. 更新应用图标
   ↓
9. 优化 APK 大小
   ↓
10. 签名和构建 APK
   ↓
11. 发布到 GitHub Release 和部署服务器
```

## 🎯 关键配置检查清单

### ✅ 主题配置
- [x] 状态栏不沉浸 (windowFullscreen: false)
- [x] 状态栏颜色透明 (statusBarColor: transparent)
- [x] Edge-to-Edge 禁用 (WindowCompat.setDecorFitsSystemWindows: true)
- [x] Light/Dark 主题配置文件

### ✅ 权限配置
- [x] 摄像头权限 (CAMERA)
- [x] 麦克风权限 (RECORD_AUDIO)
- [x] 存储读权限 (READ_EXTERNAL_STORAGE)
- [x] 存储写权限 (WRITE_EXTERNAL_STORAGE)
- [x] 文件管理权限 (MANAGE_EXTERNAL_STORAGE)

### ✅ CI/CD 步骤
- [x] 应用主题配置脚本
- [x] 配置权限脚本
- [x] 正确的执行顺序

## 📊 权限说明表

| 权限 | 用途 | 必需 | Android 版本 |
|------|------|------|------------|
| CAMERA | 使用摄像头 | ✅ | 5.1+ |
| RECORD_AUDIO | 录制音频 | ✅ | 5.1+ |
| READ_EXTERNAL_STORAGE | 读取文件 | ✅ | 4.4+ |
| WRITE_EXTERNAL_STORAGE | 保存文件 | ✅ | 4.4+ |
| MANAGE_EXTERNAL_STORAGE | 访问所有文件 | ✅ | 11+ |
| INTERNET | 网络访问 | ✅ | 1.6+ |
| ACCESS_NETWORK_STATE | 网络状态 | ✅ | 1.6+ |

## 🔐 运行时权限处理

**重要**: 添加权限声明只是第一步。应用还需要在运行时请求权限（Android 6.0+）。

### 建议的 JavaScript 实现

```javascript
// 请求摄像头权限
async function requestCameraPermission() {
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const result = await navigator.permissions.query({ name: 'camera' });
      if (result.state === 'granted') {
        console.log('Camera permission granted');
      } else if (result.state === 'prompt') {
        console.log('Requesting camera permission...');
        // 请求权限
      }
    }
  } catch (err) {
    console.error('Permission check failed:', err);
  }
}

// 请求麦克风权限
async function requestMicrophonePermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    console.log('Microphone permission granted');
  } catch (err) {
    console.error('Microphone permission denied:', err);
  }
}

// 请求文件访问权限（Web 端）
async function requestFilePermission() {
  try {
    const handle = await window.showDirectoryPicker();
    console.log('File permission granted');
  } catch (err) {
    console.error('File permission denied:', err);
  }
}
```

## 🧪 验证构建配置

### 本地测试

```bash
# 检查脚本是否可执行
ls -la scripts/apply-android-config.sh
ls -la scripts/configure-android-permissions.sh

# 检查工作流语法
npm install -g yaml-validator
yaml-validator .github/workflows/build-android.yml

# 手动运行权限配置脚本（在生成 Android 项目后）
bash scripts/configure-android-permissions.sh
```

### CI/CD 验证

1. **推送 Git tag**
   ```bash
   git tag v2.x.x
   git push origin v2.x.x
   ```

2. **监控 GitHub Actions**
   - 查看 [Actions 页面](https://github.com/sunhouy/EasyPocketMD/actions)
   - 检查 "Build Android App" 工作流
   - 验证两个新步骤：
     - "Apply Android theme configuration"
     - "Configure Android permissions"

3. **检查构建输出**
   ```
   🔧 正在应用 Android 状态栏配置...
   ✅ Light mode themes.xml 已应用
   ✅ Dark mode themes.xml 已应用
   ✅ MainActivity.kt 已应用
   
   🔐 正在配置 Android 权限...
   ✅ 已添加权限: android.permission.CAMERA
   ✅ 已添加权限: android.permission.RECORD_AUDIO
   ...
   ```

## ⚠️ 常见问题排查

### Q: 构建时权限脚本报错说 AndroidManifest.xml 不存在
A: 这是正常的。第一次初始化时，Tauri 会生成 AndroidManifest.xml，然后权限脚本会在下一步应用。

### Q: 权限添加重复了怎么办?
A: 权限脚本有检查机制，如果权限已存在不会重复添加。可以安全地多次运行。

### Q: 用户安装 APK 后还是没有权限
A: 需要在 App 中实现运行时权限请求。单纯添加 AndroidManifest.xml 中的声明是不够的。

### Q: 如何测试权限是否正确配置?
A: 安装 APK 后：
1. 打开应用设置
2. 转到权限管理
3. 检查摄像头、麦克风、文件等是否显示为可选

## 📚 相关文件

- 🔧 [Android 主题配置](../scripts/apply-android-config.sh) - 状态栏和主题
- 🔐 [权限配置脚本](../scripts/configure-android-permissions.sh) - 权限声明
- 🤖 [CI/CD 工作流](../.github/workflows/build-android.yml) - 自动构建
- 📋 [Tauri Android 配置](../src-tauri/tauri.android.conf.json) - SDK 版本和权限

## 🎉 验证完成

| 项目 | 状态 |
|------|------|
| 主题配置脚本 | ✅ |
| 权限配置脚本 | ✅ |
| GitHub Actions 工作流 | ✅ |
| tauri.android.conf.json | ✅ |
| 执行顺序 | ✅ |
| 权限列表 | ✅ |

所有 CI/CD 配置已就绪！下次推送 git tag 时会自动应用所有配置。
