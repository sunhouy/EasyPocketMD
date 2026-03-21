#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
云打印客户端 - Qt 图形界面版
"""

import sys
import os
import asyncio
import threading
import json
import platform
import logging
from datetime import datetime

from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QLineEdit, QPushButton, QComboBox, QTextEdit,
    QSystemTrayIcon, QMenu, QGroupBox, QFormLayout, QCheckBox,
    QMessageBox, QTabWidget, QStatusBar
)
from PySide6.QtCore import Qt, Signal, QObject, QThread, QTimer
from PySide6.QtGui import QIcon, QAction, QFont, QPixmap
import qdarkstyle

# 导入原有的打印逻辑
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from print_client import PrintClient, register_startup

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PrintWorkerSignals(QObject):
    """打印工作线程信号"""
    status_changed = Signal(bool, str)  # connected, message
    log_received = Signal(str)
    print_task_received = Signal(str, dict)  # content, settings
    error_occurred = Signal(str)

class PrintWorker(QThread):
    """异步打印工作线程"""
    def __init__(self, client: PrintClient):
        super().__init__()
        self.client = client
        self.signals = PrintWorkerSignals()
        self.loop = None
        self.main_task = None
        self._is_running = True

    def run(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        # 包装 PrintClient 的日志和状态输出
        import builtins
        original_print = builtins.print
        
        def gui_log_callback(msg):
            self.signals.log_received.emit(str(msg))
            
        def gui_status_callback(connected, msg):
            self.signals.status_changed.emit(connected, msg)
            
        # 设置客户端回调，通过信号传递到主线程
        self.client.log_callback = gui_log_callback
        self.client.status_callback = gui_status_callback

        def gui_print(*args, **kwargs):
            msg = " ".join(map(str, args))
            self.signals.log_received.emit(msg)
        
        builtins.print = gui_print

        try:
            # 创建并运行主任务
            self.main_task = self.loop.create_task(self.start_client())
            self.loop.run_until_complete(self.main_task)
        except asyncio.CancelledError:
            # 正常取消，不作为错误处理
            pass
        except Exception as e:
            # 只有在非人为停止的情况下才报错误
            if self._is_running:
                self.signals.error_occurred.emit(str(e))
        finally:
            builtins.print = original_print
            # 确保取消所有剩余任务
            pending = asyncio.all_tasks(self.loop)
            if pending:
                for task in pending:
                    task.cancel()
                self.loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            
            self.loop.close()
            self.loop = None

    async def start_client(self):
        while self._is_running:
            try:
                if not self.client.username or not self.client.password:
                    self.signals.status_changed.emit(False, "等待配置账号密码...")
                    await asyncio.sleep(2)
                    continue

                self.signals.status_changed.emit(False, f"正在连接到 {self.client.server_url}...")
                # connect_and_listen 内部会调用 status_callback 更新为“已连接”
                success = await self.client.connect_and_listen()
                
                if not success:
                    if self._is_running:
                        self.signals.status_changed.emit(False, "连接失败，5秒后重试...")
                        await asyncio.sleep(5)
                else:
                    # 如果从 connect_and_listen 返回，说明连接已正常结束或断开
                    if self._is_running:
                        self.signals.status_changed.emit(False, "连接已断开，准备重连...")
                        await asyncio.sleep(2)
            except asyncio.CancelledError:
                break
            except Exception as e:
                if self._is_running:
                    self.signals.log_received.emit(f"发生错误: {str(e)}")
                    self.signals.status_changed.emit(False, f"错误: {str(e)}")
                    await asyncio.sleep(5)
                else:
                    break

    def stop(self):
        self._is_running = False
        if self.loop and self.main_task:
            # 线程安全地取消主任务
            self.loop.call_soon_threadsafe(self.main_task.cancel)
        self.wait()

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.client = PrintClient(log_callback=self.on_log_received)
        self.worker = None
        
        self.init_ui()
        self.setup_tray()
        
        # 如果已经有配置，自动启动
        if self.client.username and self.client.password and self.client.printer_name:
            self.start_worker()

    def init_ui(self):
        self.setWindowTitle("云打印客户端")
        self.setMinimumSize(600, 500)
        
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)

        # 选项卡界面
        self.tabs = QTabWidget()
        main_layout.addWidget(self.tabs)

        # 1. 仪表盘
        self.dashboard_tab = QWidget()
        self.setup_dashboard_tab()
        self.tabs.addTab(self.dashboard_tab, "状态")

        # 2. 设置
        self.settings_tab = QWidget()
        self.setup_settings_tab()
        self.tabs.addTab(self.settings_tab, "设置")

        # 3. 日志
        self.logs_tab = QWidget()
        self.setup_logs_tab()
        self.tabs.addTab(self.logs_tab, "运行日志")

        # 状态栏
        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self.status_bar.showMessage("就绪")

    def setup_dashboard_tab(self):
        layout = QVBoxLayout(self.dashboard_tab)
        
        # 状态展示区
        status_group = QGroupBox("当前连接状态")
        status_layout = QVBoxLayout(status_group)
        
        self.status_label = QLabel("未连接")
        self.status_label.setAlignment(Qt.AlignCenter)
        self.status_label.setStyleSheet("font-size: 24px; color: #ff4444; font-weight: bold;")
        status_layout.addWidget(self.status_label)
        
        self.server_info_label = QLabel(f"服务器: {self.client.server_url or '未设置'}")
        self.server_info_label.setAlignment(Qt.AlignCenter)
        status_layout.addWidget(self.server_info_label)
        
        layout.addWidget(status_group)

        # 快捷操作
        actions_group = QGroupBox("快捷操作")
        actions_layout = QHBoxLayout(actions_group)
        
        self.btn_toggle_connect = QPushButton("启动服务")
        self.btn_toggle_connect.setFixedHeight(40)
        self.btn_toggle_connect.clicked.connect(self.toggle_service)
        actions_layout.addWidget(self.btn_toggle_connect)

        self.btn_test_print = QPushButton("测试打印")
        self.btn_test_print.setFixedHeight(40)
        self.btn_test_print.clicked.connect(self.test_print)
        actions_layout.addWidget(self.btn_test_print)
        
        btn_clean = QPushButton("清理临时文件")
        btn_clean.setFixedHeight(40)
        btn_clean.clicked.connect(self.clean_temp_files)
        actions_layout.addWidget(btn_clean)
        
        layout.addWidget(actions_group)
        
        # 最近任务预览
        task_group = QGroupBox("最近任务")
        task_layout = QVBoxLayout(task_group)
        self.recent_log = QTextEdit()
        self.recent_log.setReadOnly(True)
        self.recent_log.setPlaceholderText("等待打印任务...")
        task_layout.addWidget(self.recent_log)
        layout.addWidget(task_group)

    def setup_settings_tab(self):
        layout = QVBoxLayout(self.settings_tab)
        form_group = QGroupBox("账号与服务器配置")
        form_layout = QFormLayout(form_group)
        
        self.edit_username = QLineEdit(self.client.username or "")
        self.edit_password = QLineEdit(self.client.password or "")
        self.edit_password.setEchoMode(QLineEdit.Password)
        self.edit_server = QLineEdit(self.client.server_url or "wss://print.yhsun.cn")
        
        form_layout.addRow("用户名:", self.edit_username)
        form_layout.addRow("密码:", self.edit_password)
        form_layout.addRow("服务器:", self.edit_server)
        
        layout.addWidget(form_group)
        
        # 打印机设置
        printer_group = QGroupBox("打印机设置")
        printer_layout = QFormLayout(printer_group)
        
        self.combo_printers = QComboBox()
        self.refresh_printers()
        
        btn_refresh_printers = QPushButton("刷新打印机列表")
        btn_refresh_printers.clicked.connect(self.refresh_printers)
        
        printer_layout.addRow("选择打印机:", self.combo_printers)
        printer_layout.addRow("", btn_refresh_printers)
        
        layout.addWidget(printer_group)
        
        # 其他选项
        options_group = QGroupBox("其他选项")
        options_layout = QVBoxLayout(options_group)
        
        self.check_autostart = QCheckBox("开机自动启动")
        # 检查现有配置
        autostart_val = self.client.config.get('print_client', 'autostart', fallback='false')
        self.check_autostart.setChecked(autostart_val == 'true')
        options_layout.addWidget(self.check_autostart)
        
        layout.addWidget(options_group)
        
        # 保存按钮
        self.btn_save_settings = QPushButton("保存配置并重启服务")
        self.btn_save_settings.setFixedHeight(40)
        self.btn_save_settings.setStyleSheet("background-color: #0078d4; color: white; font-weight: bold;")
        self.btn_save_settings.clicked.connect(self.save_settings)
        layout.addWidget(self.btn_save_settings)
        
        layout.addStretch()

    def setup_logs_tab(self):
        layout = QVBoxLayout(self.logs_tab)
        self.log_display = QTextEdit()
        self.log_display.setReadOnly(True)
        layout.addWidget(self.log_display)
        
        btn_clear_log = QPushButton("清除日志")
        btn_clear_log.clicked.connect(lambda: self.log_display.clear())
        layout.addWidget(btn_clear_log)

    def setup_tray(self):
        self.tray_icon = QSystemTrayIcon(self)
        # 尝试设置图标，如果没有图标文件则使用默认
        icon = QIcon.fromTheme("printer")
        if icon.isNull():
            # 创建一个简单的圆形图标
            pixmap = QPixmap(32, 32)
            pixmap.fill(Qt.transparent)
            from PySide6.QtGui import QPainter, QColor
            painter = QPainter(pixmap)
            painter.setBrush(QColor("#0078d4"))
            painter.drawEllipse(4, 4, 24, 24)
            painter.end()
            icon = QIcon(pixmap)
            
        self.tray_icon.setIcon(icon)
        
        tray_menu = QMenu()
        show_action = QAction("显示主窗口", self)
        show_action.triggered.connect(self.show)
        
        quit_action = QAction("退出", self)
        quit_action.triggered.connect(QApplication.instance().quit)
        
        tray_menu.addAction(show_action)
        tray_menu.addSeparator()
        tray_menu.addAction(quit_action)
        
        self.tray_icon.setContextMenu(tray_menu)
        self.tray_icon.show()
        self.tray_icon.activated.connect(self.tray_icon_activated)

    def tray_icon_activated(self, reason):
        if reason == QSystemTrayIcon.Trigger:
            if self.isVisible():
                self.hide()
            else:
                self.show()
                self.raise_()
                self.activateWindow()

    def refresh_printers(self):
        self.combo_printers.clear()
        printers = self.client.get_printers()
        self.combo_printers.addItems(printers)
        if self.client.printer_name in printers:
            self.combo_printers.setCurrentText(self.client.printer_name)

    def save_settings(self):
        self.client.username = self.edit_username.text().strip()
        self.client.password = self.edit_password.text().strip()
        self.client.server_url = self.edit_server.text().strip()
        self.client.printer_name = self.combo_printers.currentText()
        
        if not self.client.username or not self.client.password:
            QMessageBox.warning(self, "配置错误", "请输入用户名和密码")
            return
            
        self.client.save_config()
        
        # 处理自启动
        if self.check_autostart.isChecked():
            register_startup(force=True)
        else:
            # 更新配置文件但不需要在这里撤销注册（逻辑在 print_client.py 中是注册而非注销）
            # 实际上可以添加一个 unregister_startup 逻辑，但这里先保持原样
            self.client.config.set('print_client', 'autostart', 'false')
            with open(self.client.config_file, 'w', encoding='utf-8') as f:
                self.client.config.write(f)
        
        self.server_info_label.setText(f"服务器: {self.client.server_url}")
        
        QMessageBox.information(self, "保存成功", "配置已保存，正在重新连接服务...")
        self.restart_worker()

    def toggle_service(self):
        if self.worker and self.worker.isRunning():
            self.stop_worker()
        else:
            if not self.client.username or not self.client.password:
                QMessageBox.warning(self, "配置缺失", "请先在设置中配置账号密码")
                self.tabs.setCurrentIndex(1)
                return
            self.start_worker()

    def start_worker(self):
        if self.worker and self.worker.isRunning():
            return
            
        self.worker = PrintWorker(self.client)
        self.worker.signals.status_changed.connect(self.on_status_changed)
        self.worker.signals.log_received.connect(self.on_log_received)
        self.worker.signals.error_occurred.connect(self.on_error)
        self.worker.start()
        
        self.btn_toggle_connect.setText("停止服务")
        self.btn_toggle_connect.setStyleSheet("background-color: #d83b01; color: white;")

    def stop_worker(self):
        if self.worker:
            self.worker.stop()
            self.worker = None
        
        # 重置客户端回调为本地方法
        self.client.log_callback = self.on_log_received
        self.client.status_callback = None
        
        self.on_status_changed(False, "服务已停止")
        self.btn_toggle_connect.setText("启动服务")
        self.btn_toggle_connect.setStyleSheet("")

    def restart_worker(self):
        self.stop_worker()
        self.start_worker()

    def on_status_changed(self, connected, message):
        if connected:
            self.status_label.setText("已连接")
            self.status_label.setStyleSheet("font-size: 24px; color: #107c10; font-weight: bold;")
            self.status_bar.showMessage(f"服务器已连接: {self.client.server_url}")
            self.tray_icon.setToolTip("云打印客户端 - 已连接")
        else:
            self.status_label.setText("断开连接")
            self.status_label.setStyleSheet("font-size: 24px; color: #ff4444; font-weight: bold;")
            self.status_bar.showMessage(f"状态: {message}")
            self.tray_icon.setToolTip(f"云打印客户端 - {message}")

    def on_log_received(self, message):
        timestamp = datetime.now().strftime("%H:%M:%S")
        formatted_msg = f"[{timestamp}] {message}"
        self.log_display.append(formatted_msg)
        
        # 如果是打印任务相关的，显示在仪表盘
        if "✅ 收到打印请求" in message or "打印成功" in message or "打印失败" in message:
            self.recent_log.append(formatted_msg)
            # 发送系统通知
            if "收到打印请求" in message:
                self.tray_icon.showMessage("云打印", "收到新的打印任务", QSystemTrayIcon.Information, 3000)

    def on_error(self, error_msg):
        self.on_log_received(f"致命错误: {error_msg}")
        QMessageBox.critical(self, "运行错误", f"程序运行遇到错误: {error_msg}")

    def test_print(self):
        if not self.client.printer_name:
            QMessageBox.warning(self, "未设置打印机", "请先在设置中选择打印机")
            self.tabs.setCurrentIndex(1)
            return
            
        reply = QMessageBox.question(self, "确认测试", f"将向打印机 [{self.client.printer_name}] 发送测试页，是否继续？",
                                   QMessageBox.Yes | QMessageBox.No)
        
        if reply == QMessageBox.Yes:
            test_content = f"--- 云打印客户端测试页 ---\n打印时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n用户名: {self.client.username}\n打印机: {self.client.printer_name}\n状态: 测试通过\n---------------------------"
            success = self.client.print_content(test_content, {"print_file": False})
            if success:
                QMessageBox.information(self, "成功", "测试页已发送到打印机")
            else:
                QMessageBox.critical(self, "失败", "测试打印失败，请检查打印机状态")

    def clean_temp_files(self):
        count = self.client.clean_temp_files()
        if count > 0:
            QMessageBox.information(self, "清理完成", f"已成功清理 {count} 个临时文件")
        else:
            QMessageBox.information(self, "清理完成", "临时目录很干净，没有发现需要清理的文件")

    def closeEvent(self, event):
        # 关闭窗口时只隐藏到托盘，不真正退出
        if self.tray_icon.isVisible():
            self.hide()
            self.tray_icon.showMessage("云打印", "程序已最小化到托盘", QSystemTrayIcon.Information, 2000)
            event.ignore()
        else:
            self.stop_worker()
            event.accept()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    
    # 设置应用元数据
    app.setApplicationName("CloudPrintClient")
    app.setOrganizationName("CloudPrint")
    
    # 应用美观的暗色主题
    app.setStyleSheet(qdarkstyle.load_stylesheet(qt_api='pyside6'))
    
    # 设置全局字体
    font = QFont("Microsoft YaHei", 9)
    app.setFont(font)
    
    window = MainWindow()
    window.show()
    
    sys.exit(app.exec())
