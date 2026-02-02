#!/usr/bin/env python3
"""
ETC交通仿真系统 - 主入口

使用方法:
    python main.py                    # 使用默认配置运行
    python main.py config.json        # 使用指定配置文件
    python main.py --json config.json # 导出配置为JSON并退出
"""

import os
import sys
import json
from pathlib import Path

# 添加当前目录到路径
sys.path.insert(0, str(Path(__file__).parent))

from etc_sim import SimulationEngine, SimulationConfig, load_config
from etc_sim.config.defaults import DEFAULT_CONFIG
from etc_sim.output.database import DatabaseOutput
from etc_sim.output.csv_writer import CSVWriter


def main():
    """主函数"""
    print("=" * 60)
    print("ETC交通仿真系统")
    print("基于IDM和MOBIL模型的交通流仿真")
    print("=" * 60)
    
    # 解析命令行参数
    config_path = None
    export_json = False
    
    for i, arg in enumerate(sys.argv[1:]):
        if arg == '--json':
            export_json = True
        elif arg.endswith('.json'):
            config_path = arg
    
    # 加载配置
    if config_path and os.path.exists(config_path):
        print(f"加载配置文件: {config_path}")
        config = load_config(config_path)
    else:
        print("使用默认配置")
        config = DEFAULT_CONFIG
    
    # 导出配置为JSON（如果指定）
    if export_json:
        config_path = 'etc_sim_config.json'
        config.to_json(config_path)
        print(f"配置已导出到: {config_path}")
        return
    
    # 显示配置信息
    print(f"\n仿真参数:")
    print(f"  道路长度: {config.road_length_km} km")
    print(f"  区间长度: {config.segment_length_km} km")
    print(f"  车道数: {config.num_lanes}")
    print(f"  目标车辆数: {config.total_vehicles}")
    print(f"  仿真时间步长: {config.simulation_dt} s")
    print(f"  最大仿真时间: {config.max_simulation_time} s")
    print(f"\n异常参数:")
    print(f"  异常比例: {config.anomaly_ratio * 100}%")
    print(f"  全局开始时间: {config.global_anomaly_start} s")
    print(f"  安全运行时间: {config.vehicle_safe_run_time} s")
    print("=" * 60)
    
    # 创建仿真引擎
    engine = SimulationEngine(config)
    
    # 设置输出
    output_dir = './output'
    
    # 数据库输出
    db_path = os.path.join(output_dir, 'simulation.db')
    db_output = DatabaseOutput(db_path)
    engine.add_output(db_output)
    
    # CSV输出
    csv_writer = CSVWriter(os.path.join(output_dir, 'csv'))
    
    # 运行仿真
    print("\n开始仿真...")
    engine.run()
    
    # 获取结果
    results = engine.export_to_dict()
    
    # 保存输出
    print("\n保存输出...")
    db_output.save_all(results)
    csv_writer.save_all(results)
    
    # 打印统计信息
    print("\n仿真统计:")
    print(f"  完成车辆数: {len(results['vehicle_records'])}")
    print(f"  异常事件数: {len(results['anomaly_logs'])}")
    print(f"  仿真时长: {results['simulation_time']:.0f}秒")
    
    print("\n仿真完成!")
    print("=" * 60)


if __name__ == '__main__':
    main()
