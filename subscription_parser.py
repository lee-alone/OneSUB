import base64
import json
import yaml
import re
import urllib.parse

class SubscriptionParser:
    def __init__(self):
        self.supported_protocols = ['vmess', 'vless', 'ss', 'trojan', 'hysteria2']
        self.error_messages = []
        
    def parse_subscription(self, content):
        """解析订阅内容"""
        self.error_messages = []  # 重置错误消息
        try:
            # 尝试 base64 解码
            decoded_content = self._try_base64_decode(content)
            if not decoded_content:
                decoded_content = content

            # 检查是否为 Clash 格式
            if self._is_clash_format(decoded_content):
                return self._parse_clash(decoded_content)
            
            # 处理普通订阅格式
            return self._parse_normal_subscription(decoded_content)
        except Exception as e:
            error_msg = f"解析订阅时出错: {str(e)}"
            self.error_messages.append(error_msg)
            print(error_msg)
            return []

    def get_errors(self):
        """获取解析过程中的错误信息"""
        return self.error_messages

    def _try_base64_decode(self, content):
        """尝试 base64 解码"""
        try:
            # 处理可能的 padding 问题
            padding = 4 - len(content) % 4
            if padding != 4:
                content += '=' * padding
            return base64.b64decode(content).decode('utf-8')
        except:
            return None

    def _is_clash_format(self, content):
        """检查是否为 Clash 配置格式"""
        try:
            if 'proxies:' in content:
                return True
            return False
        except:
            return False

    def _parse_clash(self, content):
        """解析 Clash 格式配置"""
        try:
            config = yaml.safe_load(content)
            if 'proxies' not in config:
                return []
            
            results = []
            for proxy in config['proxies']:
                if proxy['type'] not in self.supported_protocols:
                    continue
                
                if proxy['type'] == 'vmess':
                    results.append(self._convert_vmess_to_uri(proxy))
                elif proxy['type'] == 'vless':
                    results.append(self._convert_vless_to_uri(proxy))
                elif proxy['type'] == 'ss':
                    results.append(self._convert_ss_to_uri(proxy))
                elif proxy['type'] == 'trojan':
                    results.append(self._convert_trojan_to_uri(proxy))
                
            return results
        except Exception as e:
            print(f"解析 Clash 配置时出错: {str(e)}")
            return []

    def _convert_vmess_to_uri(self, proxy):
        """转换 Vmess 配置为统一 URI 格式"""
        config = {
            "v": "2",
            "ps": proxy.get('name', ''),
            "add": proxy['server'],
            "port": str(proxy['port']),
            "id": proxy['uuid'],
            "aid": str(proxy.get('alterId', 0)),
            "net": proxy.get('network', 'tcp'),
            "type": proxy.get('type', 'none'),
            "host": proxy.get('ws-opts', {}).get('headers', {}).get('Host', ''),
            "path": proxy.get('ws-opts', {}).get('path', ''),
            "tls": "tls" if proxy.get('tls', False) else ""
        }
        return f"vmess://{base64.b64encode(json.dumps(config).encode()).decode()}"

    def _convert_vless_to_uri(self, proxy):
        """转换 VLESS 配置为统一 URI 格式"""
        params = {
            'type': proxy.get('network', 'tcp'),
            'security': 'tls' if proxy.get('tls', False) else 'none',
            'path': proxy.get('ws-opts', {}).get('path', ''),
            'host': proxy.get('ws-opts', {}).get('headers', {}).get('Host', '')
        }
        query = urllib.parse.urlencode({k: v for k, v in params.items() if v})
        return f"vless://{proxy['uuid']}@{proxy['server']}:{proxy['port']}?{query}#{urllib.parse.quote(proxy.get('name', ''))}"

    def _convert_ss_to_uri(self, proxy):
        """转换 Shadowsocks 配置为统一 URI 格式"""
        user_info = base64.b64encode(f"{proxy['cipher']}:{proxy['password']}".encode()).decode()
        return f"ss://{user_info}@{proxy['server']}:{proxy['port']}#{urllib.parse.quote(proxy.get('name', ''))}"

    def _convert_trojan_to_uri(self, proxy):
        """转换 Trojan 配置为统一 URI 格式"""
        params = {
            'type': proxy.get('network', 'tcp'),
            'security': proxy.get('tls', 'tls'),
            'path': proxy.get('ws-opts', {}).get('path', ''),
            'host': proxy.get('ws-opts', {}).get('headers', {}).get('Host', '')
        }
        query = urllib.parse.urlencode({k: v for k, v in params.items() if v})
        return f"trojan://{proxy['password']}@{proxy['server']}:{proxy['port']}?{query}#{urllib.parse.quote(proxy.get('name', ''))}"

    def _parse_normal_subscription(self, content):
        """解析普通订阅格式"""
        results = []
        for line in content.splitlines():
            line = line.strip()
            if not line:
                continue
            
            for protocol in self.supported_protocols:
                if line.startswith(f"{protocol}://"):
                    results.append(line)
                    break
        
        return results

    def save_to_file(self, servers, filename='find.txt'):
        """保存服务器信息到文件"""
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                for server in servers:
                    f.write(f"{server}\n")
            print(f"成功保存服务器信息到 {filename}")
        except Exception as e:
            print(f"保存文件时出错: {str(e)}")