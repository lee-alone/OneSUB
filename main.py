import sys
from PyQt5.QtWidgets import QApplication
from ui import MainWindow
import subscription_manager
from subscription_parser import SubscriptionParser

if __name__ == '__main__':
    subscription_manager.create_sub_file()  # 检查并创建 sub.json 文件
    app = QApplication(sys.argv)
    window = MainWindow()
    parser = SubscriptionParser()
    window.parser = parser  # 将解析器实例添加到窗口对象中
    window.show()
    sys.exit(app.exec_())