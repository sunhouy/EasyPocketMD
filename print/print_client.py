#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
云打印客户端
"""

import asyncio
import traceback
import websockets
import json
import os
import sys
import platform
import configparser
import subprocess
import ssl
import urllib.request
import tempfile
import argparse
from datetime import datetime

# Windows specific imports
if platform.system() == 'Windows':
    try:
        import win32print
        import win32ui
        import win32con
        import win32api
        from PIL import Image, ImageWin
    except ImportError:
        print("警告: 未安装pywin32或Pillow库，Windows下无法打印，请退出程序并联系开发者")


def register_startup(force=False):
    """注册开机自启"""
    system = platform.system()
    script_path = os.path.abspath(sys.argv[0])
    
    # Check if already registered (simple check by config existence)
    config_file = os.path.join(os.path.expanduser('~'), '.print_client_config.ini')
    config = configparser.ConfigParser()
    if os.path.exists(config_file):
        config.read(config_file)
        
    if not force and config.has_section('print_client') and config['print_client'].get('autostart') == 'true':
        return

    print(f"\n正在配置开机自启 ({system})...")
    
    try:
        if system == 'Windows':
            import winreg
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE)
            winreg.SetValueEx(key, "CloudPrintClient", 0, winreg.REG_SZ, f'"{sys.executable}" "{script_path}"')
            winreg.CloseKey(key)
            print("Windows开机自启设置成功")
            
        elif system == 'Linux':
            # Create .desktop file in ~/.config/autostart
            autostart_dir = os.path.expanduser("~/.config/autostart")
            if not os.path.exists(autostart_dir):
                os.makedirs(autostart_dir)
            
            desktop_file = os.path.join(autostart_dir, "cloud_print_client.desktop")
            content = f"""[Desktop Entry]
Type=Application
Name=Cloud Print Client
Exec={sys.executable} {script_path}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Comment=Start Cloud Print Client
"""
            with open(desktop_file, 'w') as f:
                f.write(content)
            print(f"Linux开机自启设置成功: {desktop_file}")
            
        elif system == 'Darwin': # macOS
            # Create launch agent plist
            plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.cloudprintclient</string>
    <key>ProgramArguments</key>
    <array>
        <string>{sys.executable}</string>
        <string>{script_path}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
"""
            launch_agents = os.path.expanduser("~/Library/LaunchAgents")
            if not os.path.exists(launch_agents):
                os.makedirs(launch_agents)
                
            plist_path = os.path.join(launch_agents, "com.user.cloudprintclient.plist")
            with open(plist_path, 'w') as f:
                f.write(plist_content)
            
            # Load the job
            try:
                subprocess.run(['launchctl', 'load', plist_path], check=False)
            except:
                pass
            print(f"macOS开机自启设置成功: {plist_path}")
            
        # Update config to remember setting
        if not config.has_section('print_client'):
            config['print_client'] = {}
        config['print_client']['autostart'] = 'true'
        with open(config_file, 'w', encoding='utf-8') as f:
            config.write(f)
            
    except Exception as e:
        print(f"设置开机自启失败: {e}")


class PrintClient:
    def __init__(self):
        self.config_file = os.path.join(os.path.expanduser('~'), '.print_client_config.ini')
        self.username = None
        self.password = None
        self.server_url = None
        self.connected = False
        self.printer_name = None
        self.config = configparser.ConfigParser()
        self.load_config()
        # 用于存储当前监听任务的引用
        self.listen_task = None
        # 存储生成的临时文件路径
        self.temp_files = []

    def clean_temp_files(self):
        """清理临时文件"""
        if not self.temp_files:
            print("没有需要清理的临时文件")
            return
        
        print(f"正在清理 {len(self.temp_files)} 个临时文件...")
        cleaned_count = 0
        for file_path in self.temp_files[:]:  # Iterate over a copy
            try:
                if os.path.exists(file_path):
                    os.unlink(file_path)
                    print(f"已删除: {file_path}")
                    cleaned_count += 1
                self.temp_files.remove(file_path)
            except Exception as e:
                print(f"删除失败 {file_path}: {e}")
        print(f"清理完成，共删除 {cleaned_count} 个文件")

    def load_config(self):
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    self.config.read_file(f)
            except Exception as e:
                print(f"读取配置文件失败: {e}")
            if 'print_client' in self.config:
                self.username = self.config['print_client'].get('username')
                self.password = self.config['print_client'].get('password')
                self.printer_name = self.config['print_client'].get('printer')
                self.server_url = self.config['print_client'].get('server_url', 'wss://print.yhsun.cn')

    def save_config(self):
        if 'print_client' not in self.config:
            self.config['print_client'] = {}
        if self.username:
            self.config['print_client']['username'] = self.username
        if self.password:
            self.config['print_client']['password'] = self.password
        if self.printer_name:
            self.config['print_client']['printer'] = self.printer_name
        if self.server_url:
            self.config['print_client']['server_url'] = self.server_url
        with open(self.config_file, 'w', encoding='utf-8') as f:
            self.config.write(f)

    def set_user_credentials(self, username=None, password=None):
        """设置用户凭证"""
        if not username:
            username = input("请输入Markdown编辑器的账号: ")
        if not password:
            password = input("请输入Markdown编辑器的密码: ")
        self.username = username
        self.password = password
        self.save_config()
        print(f"用户凭证已设置: {username}")

    def get_printers(self):
        """获取系统可用打印机列表"""
        printers = []
        if platform.system() == 'Windows':
            printers = [printer[2] for printer in
                        win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
        elif platform.system() in ('Darwin', 'Linux'):
            result = subprocess.run(['lpstat', '-p'], capture_output=True, text=True)
            lines = result.stdout.strip().split('\n')
            for line in lines:
                if line.startswith('printer '):
                    printer_name = line.split(' ')[1]
                    printers.append(printer_name)
        return printers

    def select_printer(self):
        """选择打印机"""
        printers = self.get_printers()
        if not printers:
            print("没有找到可用的打印机")
            return
        print("可用打印机:")
        for i, printer in enumerate(printers, 1):
            print(f"{i}. {printer}")
        while True:
            try:
                choice = int(input("请选择打印机编号: "))
                if 1 <= choice <= len(printers):
                    self.printer_name = printers[choice - 1]
                    self.save_config()
                    print(f"已选择打印机: {self.printer_name}")
                    break
                else:
                    print("错误: 无效的选择")
            except ValueError:
                print("错误: 请输入数字")

    def set_server_url(self):
        """设置服务器地址"""
        print(f"\n当前服务器地址: {self.server_url or 'wss://print.yhsun.cn'}")
        print("输入新的服务器地址（例如 ws://localhost:8770 或 wss://print.yhsun.cn）")
        new_url = input("请输入服务器地址（留空保持当前值）: ").strip()
        if new_url:
            self.server_url = new_url
            self.save_config()
            print(f"服务器地址已设置为: {self.server_url}")
        else:
            print("保持当前服务器地址不变")
    
    def modify_config(self):
        """运行中修改配置的菜单"""
        print("\n=== 配置修改菜单 ===")
        print("1. 修改用户名和密码")
        print("2. 修改默认打印机")
        print("3. 修改服务器地址")
        print("4. 设置开机自启")
        print("5. 清理临时文件")
        print("6. 返回")
        choice = input("请选择 (1/2/3/4/5/6): ").strip()
        if choice == '1':
            self.set_user_credentials()
        elif choice == '2':
            self.select_printer()
        elif choice == '3':
            self.set_server_url()
        elif choice == '4':
            register_startup(force=True)
        elif choice == '5':
            self.clean_temp_files()
        else:
            print("保持原有配置。")

    def print_content(self, content, settings):
        """打印内容"""
        if not self.printer_name:
            print("请先选择打印机")
            self.select_printer()
        print(f"开始打印到打印机: {self.printer_name}")
        print(f"打印设置: {json.dumps(settings, ensure_ascii=False)}")

        try:
            # 检查是否是文件URL
            is_file_url = False
            if isinstance(content, str):
                is_file_url = content.startswith('http') or content.startswith('https') or settings.get('print_file')

            if is_file_url:
                # 处理文件URL
                print(f"处理文件URL: {content}")
                # 下载文件并打印
                self._print_file_url(content, settings)
            else:
                # 处理普通内容
                if platform.system() == 'Windows':
                    self._print_windows(content, settings)
                elif platform.system() in ('Darwin', 'Linux'):
                    self._print_unix(content, settings)
            print("打印成功")
            return True
        except Exception as e:
            print(f"打印失败: {str(e)}")
            return False

    def _print_windows(self, content, settings):
        """Windows打印实现"""

        # 临时文件路径
        temp_file = os.path.join(os.environ.get('TEMP', '/tmp'), f'print_{datetime.now().timestamp()}')

        # 备用方法：直接处理文件
        extension = '.txt'
        temp_file = temp_file + extension
        with open(temp_file, 'w', encoding='utf-8') as f:
            f.write(content)
            
        # 将文件添加到临时文件列表，以便后续手动清理
        self.temp_files.append(temp_file)

        try:
            # 尝试使用os.startfile
            os.startfile(temp_file, "print")
        except Exception as e:
            print(f"os.startfile 失败: {e}")
            try:
                # 尝试使用subprocess.run
                subprocess.run(['start', 'print', temp_file], shell=True, check=True)
            except Exception as e:
                print(f"subprocess.run 失败: {e}")
                try:
                    # 尝试使用默认文本编辑器打开文本文件
                    print("尝试使用默认文本编辑器打开文本文件")
                    win32api.ShellExecute(0, "open", temp_file, None, ".", 1)
                except Exception as e:
                    print(f"打开文件失败: {e}")

    def _print_file_url(self, file_url, settings):
        """打印文件URL"""


        print(f"正在下载文件: {file_url}")

        # 获取文件扩展名
        file_extension = ''
        if '.' in file_url:
            file_extension = os.path.splitext(file_url)[1]

        # 创建临时文件
        with tempfile.NamedTemporaryFile(suffix=file_extension, delete=False) as tmp:
            temp_file_path = tmp.name
        
        # 将文件添加到临时文件列表，以便后续手动清理
        self.temp_files.append(temp_file_path)

        try:
            # 下载文件
            print(f"开始下载文件: {file_url} 到 {temp_file_path}")
            urllib.request.urlretrieve(file_url, temp_file_path)
            print(f"文件已下载到: {temp_file_path}")

            # 检查文件是否下载成功
            if not os.path.exists(temp_file_path) or os.path.getsize(temp_file_path) == 0:
                raise Exception(f"文件下载失败，文件不存在或为空: {temp_file_path}")

            print(f"下载的文件大小: {os.path.getsize(temp_file_path)} 字节")

            # 根据系统平台打印文件
            if platform.system() == 'Windows':
                # 在Windows上使用默认应用程序打印
                print(f"在Windows上打印文件: {temp_file_path}")
                os.startfile(temp_file_path, "print")
            elif platform.system() == 'Darwin':  # macOS
                # 在macOS上使用lpr命令打印
                print(f"在macOS上打印文件: {temp_file_path} 到打印机: {self.printer_name}")
                subprocess.run(['lpr', '-P', self.printer_name, temp_file_path], check=True)
            elif platform.system() == 'Linux':
                # 在Linux上使用lpr命令打印
                print(f"在Linux上打印文件: {temp_file_path} 到打印机: {self.printer_name}")
                subprocess.run(['lpr', '-P', self.printer_name, temp_file_path], check=True)

            print(f"文件打印成功: {temp_file_path}")
            print(f"临时文件已保留: {temp_file_path}")
            print("注意：如果需要清理这些文件，请在主菜单选择清理选项")
            
        except Exception as e:
            print(f"打印文件URL时出错: {str(e)}")
            # 重新抛出异常，让调用者知道下载失败
            raise

    def _print_unix(self, content, settings):
        """Unix-like系统打印实现"""
        # 临时文件路径
        temp_file = os.path.join('/tmp', f'print_{datetime.now().timestamp()}')

        # 如果是HTML内容，且没有pdfkit，我们无法在客户端转换
        # 但现在的架构是服务器转换好PDF发过来，所以content通常是PDF的URL
        
        # 备用方法：直接处理文件
        extension = '.txt'
        temp_file = temp_file + extension
        with open(temp_file, 'w', encoding='utf-8') as f:
            f.write(content)
            
        # 将文件添加到临时文件列表，以便后续手动清理
        self.temp_files.append(temp_file)
        
        print(f"正在打印文件: {temp_file}")
        subprocess.run(['lpr', '-P', self.printer_name, temp_file], check=True)

    async def handle_connection(self, websocket):
        """处理WebSocket连接（消息监听循环）"""
        self.connected = True
        print("=== 开始监听打印任务...")
        try:
            async for message in websocket:
                print(f"=== 收到来自服务器的消息！ ===")
                try:
                    data = json.loads(message)
                    print(f"消息类型: {data.get('type')}")
                    print(f"完整消息内容: {data}")
                    
                    if data.get('type') == 'print_request':
                        print("✅ 收到打印请求！开始处理...")
                        content = data.get('content', '')
                        settings = data.get('settings', {})
                        # 添加content_type到settings中
                        if 'content_type' in data:
                            settings['content_type'] = data['content_type']
                        print(f"准备打印内容: {content[:50]}...")
                        success = self.print_content(content, settings)
                        print(f"打印结果: {'成功' if success else '失败'}")
                        await websocket.send(json.dumps({
                            'type': 'print_queued' if success else 'error',
                            'message': '打印任务已添加到队列' if success else '打印失败'
                        }, ensure_ascii=False))
                except json.JSONDecodeError:
                    print("错误: 无效的JSON数据")
                except Exception as e:
                    print(f"处理消息时出错: {str(e)}")
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': str(e)
                    }, ensure_ascii=False))
        except Exception as e:
            print(f"连接错误: {str(e)}")
        finally:
            self.connected = False
            print("客户端已断开连接")

    async def connect_and_listen(self):
        """连接到服务器，认证成功后持续监听"""
        server_url = self.server_url or "wss://print.yhsun.cn"
        print(f"连接到打印服务器: {server_url}")
        try:
            # 判断是否需要使用 SSL
            use_ssl = server_url.startswith('wss://')
            
            if use_ssl:
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE
                websocket = await asyncio.wait_for(
                    websockets.connect(server_url, ssl=ssl_context),
                    timeout=10
                )
            else:
                # 连接本地服务器，不使用 SSL
                websocket = await asyncio.wait_for(
                    websockets.connect(server_url),
                    timeout=10
                )
            print("✅ 已连接到打印服务器")

            client_id = f"client_{datetime.now().timestamp()}"
            auth_data = {
                'type': 'client_auth',
                'username': self.username,
                'password': self.password,
                'client_id': client_id
            }
            await websocket.send(json.dumps(auth_data, ensure_ascii=False))
            print(f"发送认证请求，用户名: {self.username}")
            print(f"客户端ID: {client_id}")

            response = await asyncio.wait_for(websocket.recv(), timeout=5)
            response_data = json.loads(response)
            print(f"收到服务器响应: {response_data.get('type')}")

            if response_data.get('type') == 'auth_success':
                print("✅ 认证成功，已连接到打印服务器并永久绑定")
                self.save_config()
                await self.handle_connection(websocket)  # 保持连接，处理消息
                return True
            else:
                print(f"❌ 认证失败: {response_data.get('message')}")
                return False
        except asyncio.TimeoutError:
            print("连接超时")
            return False
        except Exception as e:
            print(f"连接服务器时出错: {str(e)}")
            print(traceback.format_exc())
            return False

    async def input_listener(self):
        """监听用户输入，允许在运行中修改配置或退出"""
        loop = asyncio.get_event_loop()
        while True:
            # 确保监听任务存在且正在运行
            if self.listen_task is None or self.listen_task.done():
                # 如果任务已结束，重新创建
                self.listen_task = asyncio.ensure_future(self.connect_and_listen())

            # 创建输入监听future
            input_future = loop.run_in_executor(None, input, "\n按回车键修改配置，或输入 quit 退出: ")

            # 同时等待输入和监听任务完成
            done, pending = await asyncio.wait(
                [input_future, self.listen_task],
                return_when=asyncio.FIRST_COMPLETED
            )

            # 如果监听任务先完成（例如断开连接）
            if self.listen_task in done:
                input_future.cancel()
                # 获取任务结果（可能为False或异常）
                try:
                    result = self.listen_task.result()
                    if result is False:
                        print("连接失败，将尝试重新连接...")
                except asyncio.CancelledError:
                    # 可能被用户取消，忽略
                    pass
                except Exception as e:
                    print(f"监听任务异常: {e}")
                # 继续循环，重新创建连接任务
                continue

            # 如果用户输入先完成
            if input_future in done:
                user_input = input_future.result()
                if user_input.lower() == 'quit':
                    print("正在退出程序...")
                    self.listen_task.cancel()
                    try:
                        await self.listen_task
                    except asyncio.CancelledError:
                        pass
                    break
                elif user_input == "":
                    # 用户按下回车，进入配置修改模式
                    print("\n进入配置修改模式...")
                    # 取消当前连接任务
                    self.listen_task.cancel()
                    try:
                        await self.listen_task
                    except asyncio.CancelledError:
                        pass
                    # 修改配置
                    self.modify_config()
                    print("配置已更新，将重新连接服务器。")
                    # 继续循环，自动重新创建连接任务
                else:
                    print(f"未知命令: {user_input}")
                    # 继续循环

    async def start(self):
        """启动客户端，进入输入监听循环"""
        print(f"启动打印客户端...")
        print(f"认证用户: {self.username}")
        print(f"默认打印机: {self.printer_name}")
        print("按 Ctrl+C 停止服务")
        print("在运行过程中，按回车键可修改配置，输入 quit 退出")
        try:
            await self.input_listener()
        except asyncio.CancelledError:
            # 处理Ctrl+C等取消
            if self.listen_task and not self.listen_task.done():
                self.listen_task.cancel()
                await self.listen_task
            raise


async def main():
    print("=== 云打印客户端 ===")
    
    # 解析命令行参数
    parser = argparse.ArgumentParser(description='云打印客户端')
    parser.add_argument('--server', type=str, help='打印服务器地址 (例如: ws://localhost:8770)')
    parser.add_argument('--local', action='store_true', help='使用本地服务器 (ws://localhost:8770)')
    args = parser.parse_args()
    
    # 检查wkhtmltopdf (已废弃，无需检查)
    # check_wkhtmltopdf()
    
    # 检查是否配置了自动开机自启
    config_file = os.path.join(os.path.expanduser('~'), '.print_client_config.ini')
    config = configparser.ConfigParser()
    if os.path.exists(config_file):
        config.read(config_file)
        
    if not config.has_section('print_client') or 'autostart' not in config['print_client']:
        # 首次运行或未配置时询问
        print("\n是否设置开机自启？(y/n) [默认为n]: ")
        try:
            # 使用带超时的input或者简单的input
            # 这里在main里直接input是安全的
            choice = input().strip().lower()
            if choice == 'y':
                register_startup(force=True)
            else:
                # 记录为不开启，避免下次再问
                if not config.has_section('print_client'):
                    config['print_client'] = {}
                config['print_client']['autostart'] = 'false'
                with open(config_file, 'w', encoding='utf-8') as f:
                    config.write(f)
        except Exception:
            pass
    elif config['print_client'].get('autostart') == 'true':
        # 已配置且为true，确保注册
        register_startup(force=False)
    
    client = PrintClient()
    
    # 处理命令行参数
    if args.local:
        client.server_url = 'ws://localhost:8770'
        print(f"使用本地服务器: {client.server_url}")
        client.save_config()
    elif args.server:
        client.server_url = args.server
        print(f"使用指定服务器: {client.server_url}")
        client.save_config()
    
    # 如果缺少凭证或打印机，则必须设置
    if not client.username or not client.password:
        client.set_user_credentials()
    if not client.printer_name:
        client.select_printer()

    # 启动客户端主循环
    await client.start()


if __name__ == "__main__":
    try:
        loop = asyncio.get_event_loop()
        loop.run_until_complete(main())
    except KeyboardInterrupt:
        print("\n程序已终止")
    except Exception as e:
        print(f"程序运行出错: {str(e)}")
        traceback.print_exc()