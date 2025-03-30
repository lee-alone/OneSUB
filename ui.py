from PyQt5.QtWidgets import QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QTableWidget, QTableWidgetItem, QPushButton, QLineEdit, QDialog, QFormLayout, QMessageBox, QApplication
from PyQt5.QtCore import Qt, pyqtSignal
import subscription_manager
from web_server import WebServer


class MainWindow(QMainWindow):

    def __init__(self):
        super().__init__()
        self.subscriptions = subscription_manager.read_subscriptions()
        self.web_server = WebServer()  # 创建Web服务器实例
        self.initUI()
        self.connect_signals()
        self.load_subscriptions()

    def initUI(self):
        self.setWindowTitle("订阅管理工具")
        self.setGeometry(100, 100, 800, 600)

        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)

        self.layout = QVBoxLayout()
        self.layout.setSpacing(10)

        # 订阅地址表格
        self.table = QTableWidget()
        self.table.setColumnCount(4)  # Alias, URL, Type, Protocol Counts
        self.table.setHorizontalHeaderLabels(["别名", "订阅地址", "订阅类型", "协议数量"])
        self.layout.addWidget(self.table)

        # 按钮布局
        self.button_layout = QHBoxLayout()
        self.add_button = QPushButton("添加订阅")
        self.add_button.clicked.connect(self.add_subscription)
        self.button_layout.addWidget(self.add_button)

        self.update_subscription_button = QPushButton("更新订阅")
        self.button_layout.addWidget(self.update_subscription_button)
        self.update_subscription_button.clicked.connect(self.update_subscriptions)

        self.deduplicate_button = QPushButton("去重")
        self.button_layout.addWidget(self.deduplicate_button)
        self.deduplicate_button.clicked.connect(self.deduplicate)

        self.delete_button = QPushButton("删除订阅")
        self.delete_button.setEnabled(False)
        self.button_layout.addWidget(self.delete_button)

        self.layout.addLayout(self.button_layout)

        self.port_layout = QHBoxLayout()
        self.port_label = QLabel("端口:")
        self.port_layout.addWidget(self.port_label)
        self.port_input = QLineEdit("8000")  # Default port
        self.port_layout.addWidget(self.port_input)
        self.layout.addLayout(self.port_layout)

        self.web_server_layout = QHBoxLayout()
        self.start_web_server_button = QPushButton("启动 Web 服务器")
        self.web_server_layout.addWidget(self.start_web_server_button)

        self.stop_web_server_button = QPushButton("停止 Web 服务器")
        self.web_server_layout.addWidget(self.stop_web_server_button)
        self.layout.addLayout(self.web_server_layout)

        # 添加总体协议统计显示
        self.total_stats_label = QLabel("总体协议统计")
        self.layout.addWidget(self.total_stats_label)
        
        self.status_layout = QHBoxLayout()
        self.status_label = QLabel("就绪")
        self.status_layout.addWidget(self.status_label)
        self.layout.addLayout(self.status_layout)

        self.central_widget.setLayout(self.layout)

    def load_subscriptions(self):
        self.table.setRowCount(0)
        for sub in self.subscriptions:
            row_position = self.table.rowCount()
            self.table.insertRow(row_position)
            self.table.setItem(row_position, 0, QTableWidgetItem(sub["alias"]))
            self.table.setItem(row_position, 1, QTableWidgetItem(sub["url"]))
            self.table.setItem(row_position, 2, QTableWidgetItem(sub["type"]))
            protocol_counts = subscription_manager.get_protocol_counts(sub["url"])
            # 格式化协议数量显示
            if protocol_counts:
                display_text = ", ".join([f"{proto}: {count}" for proto, count in protocol_counts.items()])
            else:
                display_text = "无可用节点"
            protocol_item = QTableWidgetItem(display_text)
            protocol_item.setTextAlignment(Qt.AlignTop | Qt.AlignLeft)
            self.table.setItem(row_position, 3, protocol_item)

    def add_subscription(self):
        dialog = AddSubscriptionDialog(self)
        if dialog.exec_() == QDialog.Accepted:
            alias = dialog.alias_input.text()
            url = dialog.url_input.text()
            subscription_type = dialog.type_input.text()
            subscription_manager.add_subscription(alias, url, subscription_type)
            self.subscriptions = subscription_manager.read_subscriptions()
            self.load_subscriptions()

    def connect_signals(self):
        self.table.itemDoubleClicked.connect(self.edit_subscription)
        self.table.itemSelectionChanged.connect(self.on_table_selection_changed)
        self.delete_button.clicked.connect(self.delete_subscription)
        self.start_web_server_button.clicked.connect(self.start_web_server)
        self.stop_web_server_button.clicked.connect(self.stop_web_server)

    def update_subscriptions(self):
        self.status_label.setText("正在更新订阅...")
        QApplication.processEvents()  # 确保UI更新

        subscription_manager.update_all_subscriptions(self.subscriptions)
        self.subscriptions = subscription_manager.read_subscriptions()
        self.load_subscriptions()
        self.update_total_stats()
        self.load_subscriptions()

        if hasattr(self, 'parser'):
            errors = self.parser.get_errors()
            if errors:
                error_text = "\n".join(errors)
                QMessageBox.warning(self, "解析错误", f"部分订阅解析出现错误：\n{error_text}")
                self.status_label.setText("订阅更新完成，但存在错误")
            else:
                self.status_label.setText("订阅更新完成")

    def edit_subscription(self, item):
        row = item.row()
        col = item.column()
        if col == 0 or col == 1:
            line_edit = QLineEdit(item.text())
            self.table.setCellWidget(row, col, line_edit)
            line_edit.editingFinished.connect(lambda: self.save_subscription(row, col, line_edit.text()))

    def save_subscription(self, row, col, text):
        if col == 0:
            alias = text
            url = self.subscriptions[row]["url"]
        else:
            alias = self.subscriptions[row]["alias"]
            url = text
        subscription_manager.update_subscription(row, alias, url)
        self.subscriptions = subscription_manager.read_subscriptions()
        self.load_subscriptions()  # Refresh table

    def update_total_stats(self):
        """更新总体协议统计信息"""
        total_counts = subscription_manager.get_total_protocol_counts()
        if total_counts:
            stats_text = "总体协议统计: " + ", ".join([f"{proto}: {count}" for proto, count in total_counts.items()])
        else:
            stats_text = "总体协议统计: 无可用节点"
        self.total_stats_label.setText(stats_text)

    def closeEvent(self, event):
        event.accept()

    def on_table_selection_changed(self):
        if self.table.selectedItems():
            self.delete_button.setEnabled(True)
        else:
            self.delete_button.setEnabled(False)

    def delete_subscription(self):
        selected_rows = [item.row() for item in self.table.selectedItems()]
        if not selected_rows:
            QMessageBox.warning(self, "警告", "请选择要删除的订阅。")
            return

        # 删除确认对话框
        reply = QMessageBox.question(self, '删除确认',
                                      f'确定要删除选中的 {len(selected_rows)} 个订阅吗?',
                                      QMessageBox.Yes | QMessageBox.No, QMessageBox.No)

        if reply == QMessageBox.Yes:
            # 调用 subscription_manager.delete_subscriptions 删除订阅
            self.subscriptions = subscription_manager.delete_subscriptions(selected_rows)
            self.load_subscriptions()  # 重新加载表格数据


    def deduplicate(self):
        import dedupe
        dedupe.deduplicate_file()

    def start_web_server(self):
        try:
            port = int(self.port_input.text())
            success, message = self.web_server.start(port)
            if success:
                self.status_label.setText(message)
                self.start_web_server_button.setEnabled(False)
                self.stop_web_server_button.setEnabled(True)
            else:
                QMessageBox.warning(self, "错误", message)
        except ValueError:
            QMessageBox.warning(self, "错误", "请输入有效的端口号")

    def stop_web_server(self):
        success, message = self.web_server.stop()
        if success:
            self.status_label.setText(message)
            self.start_web_server_button.setEnabled(True)
            self.stop_web_server_button.setEnabled(False)
        else:
            QMessageBox.warning(self, "错误", message)

class AddSubscriptionDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("添加订阅地址")
        self.initUI()

    def initUI(self):
        self.layout = QFormLayout()

        self.alias_label = QLabel("订阅别名:")
        self.alias_input = QLineEdit()
        self.layout.addRow(self.alias_label, self.alias_input)

        self.url_label = QLabel("订阅地址:")
        self.url_input = QLineEdit()
        self.layout.addRow(self.url_label, self.url_input)

        self.type_label = QLabel("订阅类型:")
        self.type_input = QLineEdit()
        self.layout.addRow(self.type_label, self.type_input)

        self.buttons = QHBoxLayout()
        self.ok_button = QPushButton("确定")
        self.ok_button.clicked.connect(self.accept)
        self.buttons.addWidget(self.ok_button)

        self.cancel_button = QPushButton("取消")
        self.cancel_button.clicked.connect(self.reject)
        self.buttons.addWidget(self.cancel_button)

        self.layout.addRow(self.buttons)
        self.setLayout(self.layout)
