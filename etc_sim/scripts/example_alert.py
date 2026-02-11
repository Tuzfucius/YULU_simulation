"""
ETC 门架异常检测示例脚本

可用变量：
    gate_data: ETCGateData — 门架数据工具类实例
    
    gate_data.list_files(ext=".csv")   → 列出 output 中的文件
    gate_data.read_csv(path)           → 读取 CSV 为字典列表
    gate_data.read_json(path)          → 读取 JSON 文件
"""

# 列出可用数据文件
files = gate_data.list_files(".csv")
print(f"🗂️ 找到 {len(files)} 个 CSV 文件：")
for f in files[:10]:
    print(f"   {f}")

# 示例：读取第一个 CSV 查看数据
if files:
    data = gate_data.read_csv(files[0])
    print(f"\n📊 {files[0]} 中有 {len(data)} 条记录")
    if data:
        print(f"   字段: {list(data[0].keys())}")
        print(f"   前 3 条:")
        for row in data[:3]:
            print(f"   {row}")

# TODO: 在这里编写你自己的预警逻辑
# 例如：检测某个门架的平均速度过低
# SPEED_THRESHOLD = 60
# ...

print("\n✅ 示例脚本执行完毕")
