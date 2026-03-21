#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
启动打印服务器
"""

import os
import sys
import subprocess
import time
import platform
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


class PrintServiceManager:
    def __init__(self):
        self.scripts_dir = os.path.dirname(os.path.abspath(__file__))
        self.print_server_path = os.path.join(self.scripts_dir, 'print_server.py')
        self.processes = []
        self.server_port = 8770  # 新的服务器端口
        # 检查端口是否可用，不可用则自动查找
        if not is_port_available('0.0.0.0', self.server_port):
            original_port = self.server_port
            self.server_port = find_available_port('0.0.0.0', self.server_port)
            print(f"端口 {original_port} 已被占用，自动使用可用端口: {self.server_port}")
    
    def check_python(self):
        """检查Python环境"""
        try:
            result = subprocess.run(['python3', '--version'], capture_output=True, text=True)
            if result.returncode == 0:
                return 'python3'
            
            result = subprocess.run(['python', '--version'], capture_output=True, text=True)
            if result.returncode == 0:
                return 'python'
            
            print("错误: 未找到Python环境")
            return None
        except Exception as e:
            print(f"检查Python环境时出错: {str(e)}")
            return None
    
    def check_dependencies(self, python_cmd):
        """检查依赖包"""
        print("检查依赖包...")
        
        dependencies = ['websockets']
        missing = []
        
        for dep in dependencies:
            try:
                result = subprocess.run([python_cmd, '-c', f'import {dep}'], capture_output=True, text=True)
                if result.returncode != 0:
                    missing.append(dep)
            except Exception as e:
                print(f"检查依赖 {dep} 时出错: {str(e)}")
                missing.append(dep)
        
        if missing:
            print(f"缺少依赖包: {', '.join(missing)}")
            print("正在安装依赖包...")
            
            try:
                result = subprocess.run([python_cmd, '-m', 'pip', 'install', *missing], capture_output=True, text=True)
                if result.returncode == 0:
                    print("依赖包安装成功")
                else:
                    print(f"依赖包安装失败: {result.stderr}")
                    return False
            except Exception as e:
                print(f"安装依赖包时出错: {str(e)}")
                return False
        
        print("依赖包检查完成")
        return True
    
    def start_print_server(self, python_cmd):
        """启动打印服务器"""
        if not os.path.exists(self.print_server_path):
            print(f"错误: 打印服务器脚本不存在: {self.print_server_path}")
            return False
        
        print(f"启动打印服务器: {self.print_server_path}")
        
        try:
            # 启动服务器在指定IP地址和新端口
            if platform.system() == 'Windows':
                process = subprocess.Popen([python_cmd, self.print_server_path, '--host', '0.0.0.0', '--port', str(self.server_port)], 
                                         creationflags=subprocess.CREATE_NEW_CONSOLE)
            else:
                process = subprocess.Popen([python_cmd, self.print_server_path, '--host', '0.0.0.0', '--port', str(self.server_port)])
            
            self.processes.append(process)
            print(f"打印服务器已启动 (0.0.0.0:{self.server_port})")
            print(f"WSS地址: wss://print.yhsun.cn:{self.server_port}")
            return True
        except Exception as e:
            print(f"启动打印服务器时出错: {str(e)}")
            return False
    
    def stop_all(self):
        """停止所有进程"""
        print("停止所有服务...")
        
        for process in self.processes:
            try:
                process.terminate()
                process.wait(timeout=5)
                print(f"进程已停止: {process.pid}")
            except Exception as e:
                print(f"停止进程时出错: {str(e)}")
        
        self.processes.clear()
        print("所有服务已停止")
    
    def run(self):
        """运行服务"""
        print("=== 打印服务器管理器 ===")
        
        # 检查Python环境
        python_cmd = self.check_python()
        if not python_cmd:
            return
        
        # 检查依赖
        if not self.check_dependencies(python_cmd):
            return
        
        # 启动服务
        print_server_ok = self.start_print_server(python_cmd)
        
        if print_server_ok:
            print("\n=== 服务启动成功 ===")
            print(f"打印服务器: wss://print.yhsun.cn:{self.server_port}")
            print("\n按任意键停止服务...")
            
            try:
                input()
            except KeyboardInterrupt:
                pass
            except EOFError:
                # 在无终端交互环境下，input()会引发EOFError
                # 这里捕获异常，让服务可以在后台持续运行
                print("服务已在后台启动，按Ctrl+C停止")
                # 进入无限循环，保持服务运行
                try:
                    while True:
                        time.sleep(1)
                except KeyboardInterrupt:
                    pass
        else:
            print("\n=== 服务启动失败 ===")
        
        # 停止服务
        self.stop_all()
        print("\n服务已全部停止")

def main():
    """主函数"""
    manager = PrintServiceManager()
    manager.run()

if __name__ == "__main__":
    main()
