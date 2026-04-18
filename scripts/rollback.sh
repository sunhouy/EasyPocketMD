#!/bin/bash
# 一键回滚脚本 - 蓝绿部署切换
# 使用方法: ./rollback.sh

set -e

GREEN_DIR="/www/wwwroot/js_green"
BLUE_DIR="/www/wwwroot/js_blue"
LINK_PATH="/www/wwwroot/js"
PM2_BIN="/www/server/nodejs/v24.14.1/bin/pm2"
NGINX_CONF="/www/server/panel/vhost/nginx/md.yhsun.cn.conf"

echo "=========================================="
echo "  开始执行回滚操作"
echo "=========================================="

# 检查当前状态
if [ ! -L "$LINK_PATH" ]; then
  echo "错误: $LINK_PATH 不是软链接"
  exit 1
fi

CURRENT_TARGET=$(readlink -f "$LINK_PATH")

if [ "$CURRENT_TARGET" = "$GREEN_DIR" ]; then
  NEXT_DIR="$BLUE_DIR"
  NEXT_NAME="md-server-blue"
  NEXT_PORT=3051
  CURRENT_NAME="md-server-green"
  echo "当前: green (3050) -> 切换到: blue (3051)"
elif [ "$CURRENT_TARGET" = "$BLUE_DIR" ]; then
  NEXT_DIR="$GREEN_DIR"
  NEXT_NAME="md-server-green"
  NEXT_PORT=3050
  CURRENT_NAME="md-server-blue"
  echo "当前: blue (3051) -> 切换到: green (3050)"
else
  echo "错误: 未知的当前部署目录: $CURRENT_TARGET"
  exit 1
fi

# 检查目标目录是否存在
if [ ! -d "$NEXT_DIR" ]; then
  echo "错误: 目标回滚目录不存在: $NEXT_DIR"
  exit 1
fi

# 检查目标目录是否有 node_modules
if [ ! -d "$NEXT_DIR/node_modules" ]; then
  echo "警告: 目标目录缺少 node_modules，可能需要先安装依赖"
fi

# 切换软链接
echo "[1/5] 切换软链接..."
ln -sfn "$NEXT_DIR" "$LINK_PATH"
echo "✓ 软链接已更新"

# 更新 Nginx 配置端口
echo "[2/5] 更新 Nginx 配置..."
if [ -f "$NGINX_CONF" ]; then
  sed -i "s/proxy_pass http:\/\/localhost:[0-9]*/proxy_pass http:\/\/localhost:$NEXT_PORT/" "$NGINX_CONF"
  sed -i "s/proxy_pass http:\/\/127.0.0.1:[0-9]*/proxy_pass http:\/\/127.0.0.1:$NEXT_PORT/" "$NGINX_CONF"
  echo "✓ Nginx 端口已更新为: $NEXT_PORT"
else
  echo "警告: 未找到 Nginx 配置文件: $NGINX_CONF"
fi

# 重载 Nginx
echo "[3/5] 重载 Nginx..."
if [ -f /etc/init.d/nginx ]; then
  /etc/init.d/nginx reload
else
  nginx -s reload || service nginx reload
fi
echo "✓ Nginx 重载完成"

# 停止旧服务，启动新服务
echo "[4/5] 重启 PM2 服务..."

# 停止所有旧服务
"$PM2_BIN" stop md-server-green 2>/dev/null || true
"$PM2_BIN" delete md-server-green 2>/dev/null || true
"$PM2_BIN" stop md-server-blue 2>/dev/null || true
"$PM2_BIN" delete md-server-blue 2>/dev/null || true
sleep 2

# 清理端口占用
lsof -ti:$NEXT_PORT | xargs kill -9 2>/dev/null || true
sleep 1

# 启动新服务
cd "$NEXT_DIR"
export PORT=$NEXT_PORT
export DB_HOST=$(grep DB_HOST .env 2>/dev/null | cut -d'=' -f2 || echo "")
export DB_PORT=$(grep DB_PORT .env 2>/dev/null | cut -d'=' -f2 || echo "")
export DB_USER=$(grep DB_USER .env 2>/dev/null | cut -d'=' -f2 || echo "")
export DB_PASSWORD=$(grep DB_PASSWORD .env 2>/dev/null | cut -d'=' -f2 || echo "")
export DB_NAME=$(grep DB_NAME .env 2>/dev/null | cut -d'=' -f2 || echo "")
export REDIS_HOST=$(grep REDIS_HOST .env 2>/dev/null | cut -d'=' -f2 || echo "")
export REDIS_PORT=$(grep REDIS_PORT .env 2>/dev/null | cut -d'=' -f2 || echo "")
export REDIS_PASSWORD=$(grep REDIS_PASSWORD .env 2>/dev/null | cut -d'=' -f2 || echo "")
export REDIS_DB=$(grep REDIS_DB .env 2>/dev/null | cut -d'=' -f2 || echo "")
export JWT_SECRET=$(grep JWT_SECRET .env 2>/dev/null | cut -d'=' -f2 || echo "")
export JWT_EXPIRES_IN=$(grep JWT_EXPIRES_IN .env 2>/dev/null | cut -d'=' -f2 || echo "")
export ADMIN_USER=$(grep ADMIN_USER .env 2>/dev/null | cut -d'=' -f2 || echo "")
export ADMIN_PASSWORD=$(grep ADMIN_PASSWORD .env 2>/dev/null | cut -d'=' -f2 || echo "")
export BASE_URL=$(grep BASE_URL .env 2>/dev/null | cut -d'=' -f2 || echo "")
export DASHSCOPE_API_KEY=$(grep DASHSCOPE_API_KEY .env 2>/dev/null | cut -d'=' -f2 || echo "")

"$PM2_BIN" start api/server.js --name "$NEXT_NAME" --env production
echo "✓ 服务已启动: $NEXT_NAME"

# 健康检查
echo "[5/5] 执行健康检查..."
HEALTH_OK=false
for i in {1..10}; do
  if curl -s http://localhost:$NEXT_PORT/api/health | grep -q '"code":200'; then
    HEALTH_OK=true
    echo "✓ 服务健康检查通过"
    break
  fi
  echo "等待服务就绪... ($i/10)"
  sleep 2
done

if [ "$HEALTH_OK" = false ]; then
  echo "⚠️ 警告: 健康检查未通过，请手动检查服务状态"
fi

# 保存 PM2 状态
"$PM2_BIN" save

echo ""
echo "=========================================="
echo "✓ 回滚完成！当前运行版本:"
echo "=========================================="
"$PM2_BIN" list
echo ""
echo "服务名: $NEXT_NAME"
echo "端口: $NEXT_PORT"
echo "目录: $NEXT_DIR"
