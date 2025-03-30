import json
import os
import base64
import yaml
import requests

SUB_FILE = "sub.json"


def create_sub_file():
    """创建 sub.json 文件，如果文件不存在。"""
    if not os.path.exists(SUB_FILE):
        with open(SUB_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, ensure_ascii=False, indent=4)


def read_subscriptions():
    """读取 sub.json 文件中的订阅信息。"""
    try:
        with open(SUB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []
    except json.JSONDecodeError:
        return []


def write_subscriptions(subscriptions):
    """将订阅信息写入 sub.json 文件。"""
    with open(SUB_FILE, "w", encoding="utf-8") as f:
        json.dump(subscriptions, f, ensure_ascii=False, indent=4)


def add_subscription(alias, url, type):
    """添加新的订阅信息到 sub.json 文件。"""
    subscriptions = read_subscriptions()
    subscriptions.append({"alias": alias, "url": url, "type": type})
    write_subscriptions(subscriptions)


def update_subscription(index, alias, url):
    """更新指定索引的订阅信息。"""
    subscriptions = read_subscriptions()
    if 0 <= index < len(subscriptions):
        subscriptions[index]["alias"] = alias if alias else subscriptions[index]["alias"]
        subscriptions[index]["url"] = url if url else subscriptions[index]["url"]
        write_subscriptions(subscriptions)


def delete_subscriptions(indices):
    """删除指定索引的订阅信息。"""
    subscriptions = read_subscriptions()
    new_subscriptions = [sub for i, sub in enumerate(subscriptions) if i not in indices]
    write_subscriptions(new_subscriptions)
    return new_subscriptions

def check_subscription_type(content):
    try:
        # 情况1：检查是否为base64编码
        try:
            # 尝试解码base64
            base64.b64decode(content)
            return "base64"
        except:
            pass
        
        # 情况2：检查是否为clash格式（通常是yaml格式且包含proxies字段）
        try:
            # 尝试解析yaml格式
            config = yaml.safe_load(content)
            if isinstance(config, dict) and 'proxies' in config:
                return "clash"
        except:
            pass
        
        # 情况3：默认情况下认为是明文
        return "明文"
        
    except FileNotFoundError:
        return "文件不存在"
    except Exception as e:
        return f"发生错误: {str(e)}"

def get_total_protocol_counts():
    """统计find.txt中所有服务器的协议数量"""
    try:
        with open("find.txt", "r", encoding="utf-8") as f:
            content = f.read()
        protocol_counts = {}
        for protocol in ["ss", "vless", "vmess", "trojan", "hysteria2"]:
            count = content.count(f"{protocol}://")
            if count > 0:
                protocol_counts[protocol] = count
        return protocol_counts
    except FileNotFoundError:
        return {}
    except Exception as e:
        print(f"统计总协议数量时出错: {str(e)}")
        return {}

def update_all_subscriptions(subscriptions):
    from subscription_parser import SubscriptionParser
    parser = SubscriptionParser()
    all_servers = []
    
    for sub in subscriptions:
        try:
            response = requests.get(sub["url"], timeout=10)
            response.raise_for_status()
            content = response.text.strip()
            sub["type"] = check_subscription_type(content)
            
            # 解析订阅内容
            servers = parser.parse_subscription(content)
            all_servers.extend(servers)
            
        except requests.exceptions.RequestException as e:
            sub["type"] = f"下载失败: {str(e)}"
        except Exception as e:
            sub["type"] = f"发生错误: {str(e)}"
    
    # 保存所有解析到的服务器信息
    if all_servers:
        parser.save_to_file(all_servers)
    
    write_subscriptions(subscriptions)


def get_protocol_counts(subscription_url):
    """
    获取订阅地址中各种协议的数量。
    """
    try:
        response = requests.get(subscription_url, timeout=10)
        response.raise_for_status()
        content = response.text.strip()
        subscription_type = check_subscription_type(content)

        # 如果是clash格式，先使用SubscriptionParser进行解析
        if subscription_type == "clash":
            from subscription_parser import SubscriptionParser
            parser = SubscriptionParser()
            parsed_servers = parser.parse_subscription(content)
            content = "\n".join(parsed_servers) if parsed_servers else ""
        elif subscription_type == "base64":
            try:
                content = base64.b64decode(content).decode("utf-8")
            except:
                content = ""

        protocol_counts = {}
        for protocol in ["ss", "vless", "vmess", "trojan", "hysteria2"]:
            count = content.count(f"{protocol}://")
            if count > 0:
                protocol_counts[protocol] = count
        return protocol_counts
    except requests.exceptions.RequestException as e:
        print(f"Error fetching subscription: {e}")
        return {}
    except Exception as e:
        print(f"Error processing subscription: {e}")
        return {}

if __name__ == '__main__':
    create_sub_file()
    add_subscription("测试订阅", "http://example.com/sub", "测试类型")
    subs = read_subscriptions()
    print(subs)