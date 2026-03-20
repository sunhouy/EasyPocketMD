#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
云打印服务器
- 接收前端的打印请求
- 转发到本地打印客户端
- 提供WebSocket连接
- 使用账号密码进行认证
- 提供API接口验证客户端连接
"""

import asyncio
import websockets
import json
import os
import sys
import argparse
from datetime import datetime, timedelta
import ssl
import socket


def is_port_available(host, port):
    """检查端口是否可用"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1)
            s.bind((host, port))
        return True
    except OSError:
        return False


def find_available_port(host, start_port, max_port=9000):
    """查找可用端口"""
    for port in range(start_port, max_port + 1):
        if is_port_available(host, port):
            return port
    raise Exception(f"无法在 {start_port}-{max_port} 范围内找到可用端口")


class PrintServer:
    def __init__(self, host='127.0.0.1', port=8770, auto_find_port=True):
        self.host = host
        # 如果指定了自动查找端口且端口被占用，则查找可用端口
        if auto_find_port and not is_port_available(host, port):
            original_port = port
            port = find_available_port(host, port)
            print(f"端口 {original_port} 已被占用，自动使用可用端口: {port}")
        self.port = port
        self.local_client_url = "ws://localhost:8771"  # 默认新客户端端口
        self.connections = set()
        self.clients = {}  # 存储已绑定的打印客户端
        self.user_bindings = {}  # 存储用户与客户端的永久绑定关系
        print(f"初始化打印服务器: {host}:{port}")

    def validate_user_credentials(self, username, password):
        """验证用户凭证"""
        # 这里可以添加更复杂的用户验证逻辑
        # 目前我们假设所有提供的用户名和密码都是有效的
        # 实际应用中应该与用户系统集成
        return True

    async def notify_frontend_clients(self):
        """通知所有前端客户端打印客户端状态变化"""
        client_connected = len(self.clients) > 0
        status_data = {
            'type': 'client_status',
            'connected': client_connected,
            'clients': list(self.clients.keys()),
            'message': '打印客户端已连接' if client_connected else '打印客户端已断开'
        }

        for connection in list(self.connections):
            try:
                await connection.send(json.dumps(status_data, ensure_ascii=False))
            except Exception as e:
                print(f"通知前端客户端时出错: {str(e)}")

    async def handle_client(self, websocket):
        path = websocket.request.path
        """处理客户端连接（前端或打印客户端）"""
        self.connections.add(websocket)
        client_type = "前端客户端"

        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    print(f"收到请求: {data.get('type')}")

                    if data.get('type') == 'client_auth':
                        print(f"=== 收到打印客户端认证请求 ===")
                        # 处理打印客户端认证
                        try:
                            client_type = "打印客户端"
                            username = data.get('username')
                            password = data.get('password')
                            client_id = data.get('client_id')

                            print(f"客户端ID: {client_id}")
                            print(f"用户名: {username}")

                            if self.validate_user_credentials(username, password):
                                print(f"✅ 用户凭证验证成功")
                                # 认证成功，建立永久绑定
                                self.clients[client_id] = {
                                    'websocket': websocket,
                                    'connected_at': datetime.now(),
                                    'username': username,
                                    'password': password
                                }
                                # 建立用户与客户端的永久绑定
                                self.user_bindings[username] = client_id
                                print(f"✅ 客户端已添加到 clients 字典")
                                print(f"✅ 用户绑定关系已更新: {self.user_bindings}")

                                await websocket.send(json.dumps({
                                    'type': 'auth_success',
                                    'message': '认证成功，已连接到打印服务器并永久绑定'
                                }, ensure_ascii=False))
                                print(f"✅ 打印客户端认证成功: {client_id}")
                                print(f"✅ 客户端绑定关系已建立: 用户 {username} -> 客户端 {client_id}")
                                print(f"当前所有绑定关系: {self.user_bindings}")

                                # 通知所有前端客户端
                                await self.notify_frontend_clients()
                            else:
                                print(f"❌ 用户凭证验证失败")
                                # 认证失败
                                await websocket.send(json.dumps({
                                    'type': 'auth_error',
                                    'message': '用户名或密码错误，请使用Markdown编辑器的账号密码'
                                }, ensure_ascii=False))
                                print(f"❌ 打印客户端认证失败，用户名: {username}")
                        except Exception as e:
                            print(f"处理客户端认证时出错: {str(e)}")
                            await websocket.send(json.dumps({
                                'type': 'error',
                                'message': '认证处理失败'
                            }, ensure_ascii=False))

                    elif data.get('type') == 'check_client_status':
                        # 检查客户端连接状态
                        try:
                            username = data.get('username')
                            password = data.get('password')
                            
                            # 验证用户凭证
                            if self.validate_user_credentials(username, password):
                                # 检查用户是否有绑定的客户端
                                client_id = self.user_bindings.get(username)
                                client_connected = client_id and client_id in self.clients
                                
                                await websocket.send(json.dumps({
                                    'type': 'client_status',
                                    'connected': client_connected,
                                    'client_id': client_id if client_connected else None
                                }, ensure_ascii=False))
                            else:
                                await websocket.send(json.dumps({
                                    'type': 'error',
                                    'message': '用户名或密码错误'
                                }, ensure_ascii=False))
                        except Exception as e:
                            print(f"检查客户端状态时出错: {str(e)}")
                            await websocket.send(json.dumps({
                                'type': 'error',
                                'message': '检查状态失败'
                            }, ensure_ascii=False))

                    elif data.get('type') == 'print_request':
                        print(f"=== 收到打印请求 ===")
                        
                        try:
                            username = data.get('username')
                            password = data.get('password')
                            
                            print(f"用户: {username}")
                            print(f"当前用户绑定关系: {self.user_bindings}")
                            print(f"当前已连接的客户端: {list(self.clients.keys())}")

                            # 验证用户凭证
                            if not self.validate_user_credentials(username, password):
                                print(f"用户凭证验证失败: {username}")
                                await websocket.send(json.dumps({
                                    'type': 'error',
                                    'message': '用户名或密码错误'
                                }, ensure_ascii=False))
                                return

                            # 通过用户名映射找到客户端ID
                            client_id = self.user_bindings.get(username)
                            print(f"查找用户 {username} 绑定的客户端: {client_id}")

                            if client_id and client_id in self.clients:
                                client_info = self.clients[client_id]
                                print(f"找到客户端 {client_id}，准备发送打印任务...")

                                try:
                                    await client_info['websocket'].send(json.dumps(data, ensure_ascii=False))
                                    print(f"✅ 打印任务已成功发送到客户端: {client_id}")

                                    await websocket.send(json.dumps({
                                        'type': 'print_queued',
                                        'message': '打印任务已发送到绑定的打印客户端'
                                    }, ensure_ascii=False))

                                except Exception as e:
                                    print(f"❌ 发送打印任务失败: {str(e)}")
                                    import traceback
                                    traceback.print_exc()
                                    await websocket.send(json.dumps({
                                        'type': 'error',
                                        'message': '发送打印任务失败'
                                    }, ensure_ascii=False))

                            else:
                                print(f"❌ 未找到用户 {username} 绑定的客户端！")
                                # 没有找到绑定的客户端

                                await websocket.send(json.dumps({

                                    'type': 'error',

                                    'message': '无法连接到打印客户端，请确保客户端已启动并使用您的账号密码绑定'

                                }, ensure_ascii=False))

                        except Exception as e:

                            print(f"处理打印请求时出错: {str(e)}")

                            await websocket.send(json.dumps({

                                'type': 'error',

                                'message': '处理打印请求失败'

                            }, ensure_ascii=False))

                    else:
                        # 未知请求类型
                        await websocket.send(json.dumps({
                            'type': 'error',
                            'message': '未知请求类型'
                        }, ensure_ascii=False))

                except json.JSONDecodeError:
                    print("错误: 无效的JSON数据")
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': '无效的JSON数据'
                    }, ensure_ascii=False))
                except Exception as e:
                    print(f"处理消息时出错: {str(e)}")
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': '处理请求失败'
                    }, ensure_ascii=False))

        except Exception as e:
            print(f"{client_type}连接错误: {str(e)}")
        finally:
            # 清理客户端连接
            if client_type == "打印客户端":
                # 移除断开连接的打印客户端
                for client_id, info in list(self.clients.items()):
                    if info['websocket'] == websocket:
                        del self.clients[client_id]
                        print(f"打印客户端已断开连接: {client_id}")
                        # 通知前端
                        await self.notify_frontend_clients()
                        break
            self.connections.remove(websocket)
            print(f"{client_type}已断开连接: {websocket.remote_address}")

    async def forward_to_local_client(self, print_data):
        """转发打印请求到本地客户端"""
        print(f"转发打印请求到本地客户端: {self.local_client_url}")

        try:
            async with websockets.connect(self.local_client_url, timeout=5) as websocket:
                # 发送打印数据
                await websocket.send(json.dumps(print_data, ensure_ascii=False))
                print("打印请求已发送到本地客户端")

                # 等待响应
                response = await asyncio.wait_for(websocket.recv(), timeout=10)
                response_data = json.loads(response)
                print(f"收到本地客户端响应: {response_data.get('type')}")

                if response_data.get('type') == 'print_queued':
                    print("本地客户端接收打印任务成功")
                    return True
                else:
                    print(f"本地客户端拒绝打印任务: {response_data.get('message')}")
                    return False

        except asyncio.TimeoutError:
            print("错误: 连接本地客户端超时")
            return False
        except websockets.exceptions.ConnectionClosedError:
            print("错误: 本地客户端连接已关闭")
            return False
        except Exception as e:
            print(f"连接本地客户端时出错: {str(e)}")
            return False

    async def start_server(self):
        """启动WebSocket服务器"""
        print(f"启动打印服务器...")
        print(f"服务器地址: ws://{self.host}:{self.port}")
        print(f"本地客户端地址: {self.local_client_url}")
        print("按 Ctrl+C 停止服务器")

        try:
            # 直接启动服务器，不使用SSL（由Nginx处理SSL）
            async with websockets.serve(self.handle_client, self.host, self.port):
                await asyncio.Future()  # 无限运行
        except KeyboardInterrupt:
            print("服务器已停止")
        except Exception as e:
            print(f"服务器启动失败: {str(e)}")
            raise


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='云打印服务器')
    parser.add_argument('--host', type=str, default='127.0.0.1', help='服务器监听地址')
    parser.add_argument('--port', type=int, default=8770, help='服务器监听端口')
    parser.add_argument('--local-port', type=int, default=8771, help='本地客户端端口')
    parser.add_argument('--no-auto-port', action='store_true', help='禁用自动查找可用端口')

    args = parser.parse_args()

    server = PrintServer(host=args.host, port=args.port, auto_find_port=not args.no_auto_port)
    server.local_client_url = f"ws://localhost:{args.local_port}"

    try:
        loop = asyncio.get_event_loop()
        loop.run_until_complete(server.start_server())
    except (KeyboardInterrupt, EOFError):
        pass
    except Exception as e:
        print(f"服务器运行出错: {str(e)}")


if __name__ == "__main__":
    main()