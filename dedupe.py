import os
from PyQt5.QtWidgets import QMessageBox

def deduplicate_file(filename="find.txt"):
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except FileNotFoundError:
        QMessageBox.warning(None, "错误", f"文件 {filename} 未找到!")
        return 0
    except Exception as e:
        QMessageBox.warning(None, "错误", f"读取文件 {filename} 时发生错误: {e}")
        return 0

    # 移除每行首尾的空白字符并排序
    lines = [line.strip() for line in lines]
    lines.sort()

    # 去重，保留第一个
    unique_lines = []
    duplicates_count = 0
    seen = set()
    for line in lines:
        if line not in seen:
            unique_lines.append(line)
            seen.add(line)
        else:
            duplicates_count += 1

    # 再次排序
    unique_lines.sort()

    # 写回文件
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            f.writelines(line + '\n' for line in unique_lines)
    except Exception as e:
        QMessageBox.warning(None, "错误", f"写入文件 {filename} 时发生错误: {e}")
        return 0

    QMessageBox.information(None, "完成", f"已删除 {duplicates_count} 条重复条目。")
    return duplicates_count

if __name__ == '__main__':
    deduplicate_file()