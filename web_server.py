import http.server
import socketserver
import threading
import os

class WebServer:
    def __init__(self):
        self.server = None
        self.server_thread = None
        self.is_running = False

    def start(self, port):
        if self.is_running:
            return False, "服务器已在运行"

        try:
            # 创建自定义的请求处理器，用于提供find.txt的内容
            class FindTxtHandler(http.server.SimpleHTTPRequestHandler):
                def do_GET(self):
                    if self.path == '/':
                        try:
                            with open('find.txt', 'r', encoding='utf-8') as f:
                                content = f.read()
                            self.send_response(200)
                            self.send_header('Content-type', 'text/plain; charset=utf-8')
                            self.end_headers()
                            self.wfile.write(content.encode('utf-8'))
                        except Exception as e:
                            self.send_response(500)
                            self.send_header('Content-type', 'text/plain')
                            self.end_headers()
                            self.wfile.write(str(e).encode())
                    else:
                        protocol = self.path.lstrip('/').rstrip('/')  # Extract protocol from path
                        try:
                            with open('find.txt', 'r', encoding='utf-8') as f:
                                lines = f.readlines()
                            filtered_lines = [
                                line for line in lines
                                if line.startswith(protocol + "://") and not any(
                                    other_protocol + "://" in line
                                    for other_protocol in ["vless", "vmess", "trojan", "hysteria2"]
                                    if other_protocol != protocol
                                )
                            ]
                            filtered_content = ''.join(filtered_lines)

                            self.send_response(200)
                            self.send_header('Content-type', 'text/plain; charset=utf-8')
                            self.end_headers()
                            self.wfile.write(filtered_content.encode('utf-8'))
                        except Exception as e:
                            self.send_response(500)
                            self.send_header('Content-type', 'text/plain')
                            self.end_headers()
                            self.wfile.write(str(e).encode())

            # 创建服务器
            self.server = socketserver.TCPServer(('', port), FindTxtHandler)
            self.server_thread = threading.Thread(target=self.server.serve_forever)
            self.server_thread.daemon = True
            self.server_thread.start()
            self.is_running = True
            return True, f"服务器已启动在端口 {port}"

        except Exception as e:
            return False, f"启动服务器失败: {str(e)}"

    def stop(self):
        if not self.is_running:
            return False, "服务器未运行"

        try:
            if self.server:
                self.server.shutdown()
                self.server.server_close()
                self.server = None
                self.server_thread = None
                self.is_running = False
                return True, "服务器已停止"
        except Exception as e:
            return False, f"停止服务器失败: {str(e)}"

    def is_server_running(self):
        return self.is_running