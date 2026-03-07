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
import platform
import configparser
import subprocess
import ssl
import pdfkit
import urllib.request
import tempfile
import os

from datetime import datetime

# 尝试导入pdfkit并配置
pdfkit_available = False
wkhtmltopdf_config = None
try:
    # 尝试设置wkhtmltopdf路径
    try:
        # 检查系统PATH中的wkhtmltopdf
        wkhtmltopdf_path = None
        try:
            # 尝试使用where命令查找wkhtmltopdf
            result = subprocess.run(['where', 'wkhtmltopdf'], capture_output=True, text=True, shell=True)
            if result.returncode == 0 and result.stdout.strip():
                wkhtmltopdf_path = result.stdout.strip().split('\n')[0]
                print(f"从系统PATH中找到wkhtmltopdf: {wkhtmltopdf_path}")
        except:
            pass

        # 如果PATH中没有，检查常见的安装路径
        if not wkhtmltopdf_path:
            # 检查常见路径
            common_paths = [
                r'C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe',
                r'C:\Program Files (x86)\wkhtmltopdf\bin\wkhtmltopdf.exe',
                r'C:\wkhtmltopdf\bin\wkhtmltopdf.exe',
            ]

            for path in common_paths:
                if os.path.exists(path):
                    wkhtmltopdf_path = path
                    break

        if wkhtmltopdf_path:
            wkhtmltopdf_config = pdfkit.configuration(wkhtmltopdf=wkhtmltopdf_path)
            print(f"pdfkit库已成功导入，使用wkhtmltopdf路径: {wkhtmltopdf_path}")
            pdfkit_available = True
        else:
            print("警告: 未找到wkhtmltopdf可执行文件，将使用备用打印方法")
    except Exception as e:
        print(f"配置pdfkit失败: {e}")
except ImportError:
    print("警告: pdfkit库未安装，将使用备用打印方法")

# 打印相关模块
if platform.system() == 'Windows':
    import win32print
    import win32ui
    import win32con
    import win32api
    from PIL import Image, ImageWin


class PrintClient:
    def __init__(self):
        self.config_file = os.path.join(os.path.expanduser('~'), '.print_client_config.ini')
        self.username = None
        self.password = None
        self.connected = False
        self.printer_name = None
        self.config = configparser.ConfigParser()
        self.load_config()
        # 用于存储当前监听任务的引用
        self.listen_task = None

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

    def save_config(self):
        if 'print_client' not in self.config:
            self.config['print_client'] = {}
        if self.username:
            self.config['print_client']['username'] = self.username
        if self.password:
            self.config['print_client']['password'] = self.password
        if self.printer_name:
            self.config['print_client']['printer'] = self.printer_name
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

    def modify_config(self):
        """运行中修改配置的菜单"""
        print("\n=== 配置修改菜单 ===")
        print("1. 修改用户名和密码")
        print("2. 修改默认打印机")
        print("3. 返回")
        choice = input("请选择 (1/2/3): ").strip()
        if choice == '1':
            self.set_user_credentials()
        elif choice == '2':
            self.select_printer()
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
        # 检查是否是HTML内容
        is_html = '<html>' in content.lower() or '<body>' in content.lower() or settings.get('content_type') == 'html'

        # 临时文件路径
        temp_file = os.path.join(os.environ.get('TEMP', '/tmp'), f'print_{datetime.now().timestamp()}')

        # 如果是HTML内容且pdfkit可用，转换为PDF
        if is_html and pdfkit_available:
            try:
                # 保存HTML文件，确保添加字体支持
                html_file = temp_file + '.html'

                # 检查HTML是否已经有DOCTYPE和head部分
                if '<!DOCTYPE html>' not in content.lower() or '<head>' not in content.lower():
                    # 如果没有，添加基本的HTML结构和字体支持
                    html_content = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>打印文档</title>
    <style>
        /* 添加中文字体支持 */
        @font-face {
            font-family: "SimSun";
            src: local("SimSun"), local("宋体");
        }
        @font-face {
            font-family: "SimHei";
            src: local("SimHei"), local("黑体");
        }
        @font-face {
            font-family: "Microsoft YaHei";
            src: local("Microsoft YaHei"), local("微软雅黑");
        }
        body {
            font-family: "SimSun", "宋体", "Microsoft YaHei", "微软雅黑", sans-serif;
            font-size: 12pt;
            line-height: 1.5;
            color: #333;
        }
    </style>
</head>
<body>
'''
                    html_content += content
                    html_content += '''
</body>
</html>'''
                else:
                    # 如果已经有HTML结构，确保添加字体支持
                    html_content = content
                    # 检查是否有head部分
                    if '<head>' in html_content:
                        # 在head标签内添加字体支持
                        font_css = '''
    <style>
        /* 添加中文字体支持 */
        @font-face {
            font-family: "SimSun";
            src: local("SimSun"), local("宋体");
        }
        @font-face {
            font-family: "SimHei";
            src: local("SimHei"), local("黑体");
        }
        @font-face {
            font-family: "Microsoft YaHei";
            src: local("Microsoft YaHei"), local("微软雅黑");
        }
        body {
            font-family: "SimSun", "宋体", "Microsoft YaHei", "微软雅黑", sans-serif;
        }
    </style>'''
                        html_content = html_content.replace('<head>', '<head>' + font_css)
                    # 确保有charset meta标签
                    if 'charset' not in html_content.lower():
                        html_content = html_content.replace('<head>', '<head><meta charset="UTF-8">')

                with open(html_file, 'w', encoding='utf-8') as f:
                    f.write(html_content)

                # 转换为PDF，添加选项确保中文支持
                pdf_file = temp_file + '.pdf'
                print(f"正在使用pdfkit将HTML转换为PDF: {pdf_file}")

                # 添加选项以支持中文并避免网络错误
                options = {
                    'encoding': 'UTF-8',
                    'no-outline': None,
                    'quiet': '',
                    'disable-smart-shrinking': None,
                    'dpi': 300,
                    'image-dpi': 300,
                    'image-quality': 94,
                    'disable-external-links': None,
                    'disable-javascript': None,
                    'load-error-handling': 'ignore',
                    'load-media-error-handling': 'ignore'
                }

                # 使用配置的pdfkit
                pdfkit.from_file(html_file, pdf_file, configuration=wkhtmltopdf_config, options=options)

                # 打印PDF文件
                print(f"正在打印PDF文件: {pdf_file}")
                os.startfile(pdf_file, "print")
                return
            except Exception as e:
                print(f"pdfkit转换失败: {e}")
                # 转换失败，继续使用备用方法

        # 备用方法：直接处理文件
        extension = '.html' if is_html else '.txt'
        temp_file = temp_file + extension
        with open(temp_file, 'w', encoding='utf-8') as f:
            f.write(content)

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
                    # 尝试使用默认浏览器打开HTML文件
                    if is_html:
                        print("尝试使用默认浏览器打开HTML文件")
                        win32api.ShellExecute(0, "open", temp_file, None, ".", 1)
                    else:
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
        except Exception as e:
            print(f"打印文件URL时出错: {str(e)}")
            # 重新抛出异常，让调用者知道下载失败
            raise
        finally:
            # 清理临时文件
            try:
                os.unlink(temp_file_path)
                print(f"临时文件已清理: {temp_file_path}")
            except:
               pass

    def _print_unix(self, content, settings):
        """Unix-like系统打印实现"""
        # 检查是否是HTML内容
        is_html = '<html>' in content.lower() or '<body>' in content.lower() or settings.get('content_type') == 'html'

        # 临时文件路径
        temp_file = os.path.join('/tmp', f'print_{datetime.now().timestamp()}')

        # 如果是HTML内容且pdfkit可用，转换为PDF
        if is_html and pdfkit_available:
            try:
                # 保存HTML文件，确保添加字体支持
                html_file = temp_file + '.html'

                # 检查HTML是否已经有DOCTYPE和head部分
                if '<!DOCTYPE html>' not in content.lower() or '<head>' not in content.lower():
                    # 如果没有，添加基本的HTML结构和字体支持
                    html_content = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>打印文档</title>
    <style>
        /* 添加中文字体支持 */
        @font-face {
            font-family: "SimSun";
            src: local("SimSun"), local("宋体");
        }
        @font-face {
            font-family: "SimHei";
            src: local("SimHei"), local("黑体");
        }
        @font-face {
            font-family: "Microsoft YaHei";
            src: local("Microsoft YaHei"), local("微软雅黑");
        }
        body {
            font-family: "SimSun", "宋体", "Microsoft YaHei", "微软雅黑", sans-serif;
            font-size: 12pt;
            line-height: 1.5;
            color: #333;
        }
    </style>
</head>
<body>
'''
                    html_content += content
                    html_content += '''
</body>
</html>'''
                else:
                    # 如果已经有HTML结构，确保添加字体支持
                    html_content = content
                    # 检查是否有head部分
                    if '<head>' in html_content:
                        # 在head标签内添加字体支持
                        font_css = '''
    <style>
        /* 添加中文字体支持 */
        @font-face {
            font-family: "SimSun";
            src: local("SimSun"), local("宋体");
        }
        @font-face {
            font-family: "SimHei";
            src: local("SimHei"), local("黑体");
        }
        @font-face {
            font-family: "Microsoft YaHei";
            src: local("Microsoft YaHei"), local("微软雅黑");
        }
        body {
            font-family: "SimSun", "宋体", "Microsoft YaHei", "微软雅黑", sans-serif;
        }
    </style>'''
                        html_content = html_content.replace('<head>', '<head>' + font_css)
                    # 确保有charset meta标签
                    if 'charset' not in html_content.lower():
                        html_content = html_content.replace('<head>', '<head><meta charset="UTF-8">')

                with open(html_file, 'w', encoding='utf-8') as f:
                    f.write(html_content)

                # 转换为PDF，添加选项确保中文支持
                pdf_file = temp_file + '.pdf'
                print(f"正在使用pdfkit将HTML转换为PDF: {pdf_file}")

                # 添加选项以支持中文并避免网络错误
                options = {
                    'encoding': 'UTF-8',
                    'no-outline': None,
                    'quiet': '',
                    'disable-smart-shrinking': None,
                    'dpi': 300,
                    'image-dpi': 300,
                    'image-quality': 94,
                    'disable-external-links': None,
                    'disable-javascript': None,
                    'load-error-handling': 'ignore',
                    'load-media-error-handling': 'ignore',
                    'timeout': 10000
                }

                # 使用配置的pdfkit
                pdfkit.from_file(html_file, pdf_file, configuration=wkhtmltopdf_config, options=options)

                # 打印PDF文件
                print(f"正在打印PDF文件: {pdf_file}")
                subprocess.run(['lpr', '-P', self.printer_name, pdf_file], check=True)
                return
            except Exception as e:
                print(f"pdfkit转换失败: {e}")
                # 转换失败，继续使用备用方法

        # 备用方法：直接处理文件
        extension = '.html' if is_html else '.txt'
        temp_file = temp_file + extension
        with open(temp_file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"正在打印文件: {temp_file}")
        subprocess.run(['lpr', '-P', self.printer_name, temp_file], check=True)

    async def handle_connection(self, websocket):
        """处理WebSocket连接（消息监听循环）"""
        self.connected = True
        print("开始监听打印任务...")
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    print(f"收到打印请求: {data.get('type')}")
                    if data.get('type') == 'print_request':
                        content = data.get('content', '')
                        settings = data.get('settings', {})
                        # 添加content_type到settings中
                        if 'content_type' in data:
                            settings['content_type'] = data['content_type']
                        success = self.print_content(content, settings)
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
        server_url = "wss://print.yhsun.cn"
        print(f"连接到打印服务器: {server_url}")
        try:
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE

            websocket = await asyncio.wait_for(
                websockets.connect(server_url, ssl=ssl_context),
                timeout=10
            )
            print("已连接到打印服务器")

            auth_data = {
                'type': 'client_auth',
                'username': self.username,
                'password': self.password,
                'client_id': f"client_{datetime.now().timestamp()}"
            }
            await websocket.send(json.dumps(auth_data, ensure_ascii=False))
            print(f"发送认证请求，用户名: {self.username}")

            response = await asyncio.wait_for(websocket.recv(), timeout=5)
            response_data = json.loads(response)
            print(f"收到服务器响应: {response_data.get('type')}")

            if response_data.get('type') == 'auth_success':
                print("认证成功，已连接到打印服务器并永久绑定")
                self.save_config()
                await self.handle_connection(websocket)  # 保持连接，处理消息
                return True
            else:
                print(f"认证失败: {response_data.get('message')}")
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
                self.listen_task = asyncio.create_task(self.connect_and_listen())

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
    client = PrintClient()
    print("=== 云打印客户端 ===")

    # 如果缺少凭证或打印机，则必须设置
    if not client.username or not client.password:
        client.set_user_credentials()
    if not client.printer_name:
        client.select_printer()

    # 启动客户端主循环
    await client.start()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n程序已终止")
    except Exception as e:
        print(f"程序运行出错: {str(e)}")
        traceback.print_exc()