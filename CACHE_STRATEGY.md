# 缓存策略优化说明

## 概述
本项目采用了多层缓存策略，确保用户在访问网站时获得最佳的性能体验，同时在内容更新时能够及时获取最新版本。

## 缓存策略详解

### 1. 文件哈希（Vite 配置）
- **文件命名**: 所有静态资源（JS、CSS、图片等）在构建时都会自动添加哈希值后缀
- **示例**: `main.js` → `main-abc123.js`
- **优点**: 每次内容更改时，文件名都会变化，强制浏览器下载新版本

### 2. Service Worker 缓存
- **网络优先策略**: 首先尝试从网络获取最新内容，同时更新缓存
- **离线回退**: 网络不可用时，使用缓存内容
- **版本管理**: 通过 `CACHE_VERSION` 控制缓存更新

### 3. Nginx 缓存头
- **带哈希的资源**: `Cache-Control: public, immutable`（1年缓存）
- **普通静态资源**: `Cache-Control: public, must-revalidate`（7天缓存）
- **HTML 文件**: `Cache-Control: no-store, no-cache`（不缓存）
- **Service Worker**: `Cache-Control: no-store, no-cache`（不缓存）

## 使用方法

### 正常构建（自动更新版本）
```bash
npm run build
```
此命令会：
1. 自动递增版本号
2. 使用 Vite 构建带哈希的资源文件
3. 更新 Service Worker 中的缓存版本

### 仅更新版本号
```bash
npm run bump-version
```

## 部署流程

1. **修改代码**
2. **运行构建**: `npm run build`
3. **部署到服务器**
4. **重载 Nginx**: `nginx -s reload`（如果修改了 Nginx 配置）

## 注意事项

- 每次构建都会自动更新版本号，确保用户获得最新内容
- 带哈希的资源文件会被长期缓存，提升性能
- HTML 和 Service Worker 永远不会被缓存，确保立即更新
