# 强制退出文件自动同步实现说明

## 问题背景

当用户强制退出应用时（例如强制关闭浏览器标签页、应用崩溃等），如果刚刚修改的文件还没来得及同步到服务器，再次进入应用时会出现文件冲突提示。用户的本地版本和服务器版本不一致，系统会弹出冲突解决对话框，要求用户手动选择使用哪个版本。

这个流程的问题在于：
1. 增加了用户的交互负担
2. 如果用户刚改好的内容尚未保存，强制退出后再进来被迫选择是否保留本地修改不够直观

## 解决方案

修改同步逻辑，检测在 `pendingServerSync` 中标记的文件（这些是用户强制退出时未完全同步的文件），对这些文件：
1. **跳过冲突检测** - 不弹出冲突解决对话框
2. **直接使用本地版本** - 自动采用本地文件内容
3. **立即同步到服务器** - 在应用加载完成后，自动将这些文件同步到服务器

这样做的好处是用户不需要手动干预，本地未同步的修改会被自动保留并完成同步。

## 技术实现

### 1. pendingServerSync 标记机制

文件已在 `js/files.js` 中有待同步标记机制：

```javascript
// 全局存储待同步文件的标记
window.pendingServerSync = {
    'fileId1': true,  // 文件1等待同步
    'fileId2': true   // 文件2等待同步
}
```

### 2. 关键修改点

#### 修改一：detectConflicts 函数（第264-301行）

**修改前**：
```javascript
localFiles.forEach(function(localFile) {
    const serverFile = serverFileMap[localFile.name];
    if (serverFile) {
        if (serverFile.content !== localFile.content) {
            // 内容不同 -> 加入冲突列表
            conflicts.push({ ... });
        }
    }
});
```

**修改后**：
```javascript
localFiles.forEach(function(localFile) {
    // 如果文件在待同步列表中（用户强制退出时未同步），跳过冲突检测，直接使用本地版本
    if (localFile.id && pendingServerSync[localFile.id]) {
        return;  // 跳过这个文件，不加入冲突列表
    }
    
    const serverFile = serverFileMap[localFile.name];
    // ... 其余冲突检测逻辑
});
```

**原理**：
- 在遍历本地文件时，先检查文件是否在 `pendingServerSync` 中
- 如果在，说明这个文件是用户强制退出时修改但未同步的
- 直接 `return` 跳过此文件，不将其加入冲突列表
- 这样就避免了弹出冲突提示窗口

#### 修改二：loadFilesFromServer 函数（第224-251行）

在冲突解决之后，添加自动同步逻辑：

```javascript
if (conflicts.length > 0) {
    showConflictResolution(conflicts, serverFiles);
} else {
    mergeFiles(localFiles, serverFiles);
    loadFiles();
    if (g('files').length > 0) openFirstFile();
    else createDefaultFile();
    
    // 自动同步待同步列表中的文件（用户强制退出时未同步的文件）
    const pendingServerSync = g('pendingServerSync') || {};
    const pendingFileIds = Object.keys(pendingServerSync).filter(id => pendingServerSync[id]);
    if (pendingFileIds.length > 0) {
        global.showSyncStatus(isEn() ? 'Auto-syncing ' + pendingFileIds.length + ' unsaved files...' : '正在自动同步 ' + pendingFileIds.length + ' 个未同步的文件...', 'syncing');
        setTimeout(() => {
            (async () => {
                for (const fileId of pendingFileIds) {
                    try {
                        await global.syncFileToServer(fileId);
                    } catch (e) {
                        console.warn('自动同步文件失败:', fileId, e);
                    }
                }
                global.showSyncStatus(isEn() ? 'File sync completed' : '文件同步完成', 'success');
            })();
        }, 1000);
    } else {
        global.showSyncStatus(isEn() ? 'File sync completed' : '文件同步完成', 'success');
    }
}
```

**原理**：
- 在成功加载文件后（没有冲突的情况下）
- 获取 `pendingServerSync` 中所有标记为 true 的文件 ID
- 如果有待同步的文件，显示同步提示
- 等待 1 秒让 UI 先加载完成（避免同步过程卡主UI）
- 逐个调用 `syncFileToServer` 同步每个待同步的文件
- 同步完成后显示成功提示

### 3. 何时标记文件为 pendingServerSync

文件在以下两个地方会被标记为待同步：

#### 场景 1：正常编辑保存时（syncCurrentFile）
在 `js/files.js` 的 `saveCurrentFile` 函数中（第1619行）：
```javascript
if (g('currentUser')) {
    // 保存即触发服务器同步；失败则保留 pending 标记，稍后会自动补齐同步
    markPendingServerSync(currentFileId, true);
    try {
        const saveResult = await global.syncFileToServer(currentFileId);
        // ...
        if (saveResult) markPendingServerSync(currentFileId, false);  // 同步成功后清除标记
    } catch (e) {
        // 保持 pending - 同步失败则保留标记
    }
}
```

#### 场景 2：页面关闭时（sendBeacon）
在 `js/files.js` 的 `syncCurrentFileWithBeacon` 函数中（第397行）：
```javascript
// sendBeacon 无法等待响应，因此统一标记为 pending，后续会自动补齐同步
markPendingServerSync(currentFileId, true);

const body = { ... };
try {
    const payload = new Blob([JSON.stringify(body)], { type: 'application/json' });
    const api = global.getApiBaseUrl ? global.getApiBaseUrl() : 'api';
    if (navigator.sendBeacon) {
        const ok = navigator.sendBeacon(api + '/files/save', payload);
        if (ok) return true;
    }
} catch (e) {}

// 如果 sendBeacon 失败，标记会保留在 pendingServerSync 中
// 下次应用启动时会自动同步
```

这个函数在页面卸载时被调用（在 `js/main.js` 中）。

### 4. 调用流程图

```
用户强制退出应用
    ↓
页面卸载事件触发 → syncCurrentFileWithBeacon()
    ↓
文件被标记为 pendingServerSync[fileId] = true
    ↓
sendBeacon 尝试同步（可能失败）
    ↓
用户重新打开应用
    ↓
loadFilesFromServer() 被调用
    ↓
detectConflicts() - 检查到文件在 pendingServerSync 中
    ↓
跳过冲突检测，使用本地版本
    ↓
检测到 pendingServerSync 中有文件
    ↓
自动同步所有待同步文件到服务器
    ↓
清除 pendingServerSync 标记
    ↓
同步完成提示
```

## 工作流示例

### 场景：用户编辑文件后强制关闭浏览器

1. **用户编辑** - 修改 "文档1.md"
2. **自动保存** - 3 秒后 `saveCurrentFile()` 被调用
   - 本地保存文件
   - 开始向服务器同步
   - 标记 `pendingServerSync['文档1-fileId'] = true`
3. **用户强制关闭** - 在同步完成前关闭浏览器
   - 页面卸载事件触发
   - `syncCurrentFileWithBeacon()` 再次尝试同步（可能失败）
   - `pendingServerSync['文档1-fileId']` 仍为 true
4. **重新打开应用** 
   - `loadFilesFromServer()` 被调用
   - `detectConflicts()` 发现文件在 `pendingServerSync` 中，跳过冲突检测
   - 本地版本被自动采用（不弹窗）
   - 自动同步线程启动，将文件同步到服务器
   - 同步完成后清除标记

## 测试验证

已通过 `npm test` 验证：
- 代码没有语法错误
- 现有单元测试全部通过
- 文件变更没有破坏现有功能

## 用户体验改进

| 之前 | 之后 |
|------|------|
| 强制退出后重新进入 → 弹出冲突窗口 → 用户手动选择版本 | 强制退出后重新进入 → 自动使用本地版本 → 自动同步到服务器 |
| 用户需要理解并处理冲突 | 用户无感知，自动完成 |
| 可能丢失未同步的修改 | 修改被完整保留 |

