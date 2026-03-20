#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试端口检测功能
"""

import socket
import sys

sys.path.insert(0, '.')

from print_server import is_port_available, find_available_port

print("=== 测试端口检测功能 ===\n")

# 测试端口8770
port = 8770
available = is_port_available('127.0.0.1', port)
print(f"端口 {port} 是否可用: {available}")

# 查找可用端口
try:
    found_port = find_available_port('127.0.0.1', 8770)
    print(f"找到可用端口: {found_port}")
except Exception as e:
    print(f"错误: {e}")

print("\n=== 测试完成 ===")
