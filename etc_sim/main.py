#!/usr/bin/env python3
"""
ETC Traffic Simulation System - Main Entry

Usage:
    python main.py                    # Run with default config
    python main.py config.json        # Run with specified config
    python main.py --json config.json # Export config and exit
"""

import os
import sys
import json
from datetime import datetime

os.environ['PYTHONIOENCODING'] = 'utf-8'

_parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)

from etc_sim.config.parameters import SimulationConfig, load_config
from etc_sim.config.defaults import DEFAULT_CONFIG
from etc_sim.simulation.engine import SimulationEngine


def save_result(results: dict, output_dir: str):
    """Save simulation result to JSON file"""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"sim_{timestamp}.json"
    filepath = os.path.join(output_dir, filename)
    
    os.makedirs(output_dir, exist_ok=True)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print(f"Result saved to: {filepath}")
    return filepath


def main():
    """Main function"""
    print("=" * 60)
    print("ETC Traffic Simulation System")
    print("Based on IDM and MOBIL models")
    print("=" * 60)
    
    config_path = None
    export_json = False
    
    for i, arg in enumerate(sys.argv[1:]):
        if arg == '--json':
            export_json = True
        elif arg.endswith('.json'):
            config_path = arg
    
    if config_path and os.path.exists(config_path):
        print(f"Loading config: {config_path}")
        config = load_config(config_path)
    else:
        print("Using default config")
        config = DEFAULT_CONFIG
    
    if export_json:
        config_path = 'etc_sim_config.json'
        config.to_json(config_path)
        print(f"Config exported to: {config_path}")
        return
    
    print(f"\nSimulation Parameters:")
    print(f"  Road Length: {config.road_length_km} km")
    print(f"  Segment Length: {config.segment_length_km} km")
    print(f"  Lanes: {config.num_lanes}")
    print(f"  Target Vehicles: {config.total_vehicles}")
    print(f"  Time Step: {config.simulation_dt} s")
    print(f"  Max Time: {config.max_simulation_time} s")
    print(f"\nAnomaly Parameters:")
    print(f"  Anomaly Ratio: {config.anomaly_ratio * 100}%")
    print(f"  Global Start: {config.global_anomaly_start} s")
    print(f"  Safe Run Time: {config.vehicle_safe_run_time} s")
    print("=" * 60)
    
    engine = SimulationEngine(config)
    
    print("\nStarting simulation...")
    engine.run()
    
    results = engine.export_to_dict()
    
    print("\nSaving output...")
    data_dir = os.path.join(_parent_dir, 'data', 'results')
    save_result(results, data_dir)
    
    print("\nSimulation Statistics:")
    print(f"  Completed Vehicles: {len(results['vehicle_records'])}")
    print(f"  Anomaly Events: {len(results['anomaly_logs'])}")
    sim_time = results.get('simulation_time') or results.get('statistics', {}).get('simulation_time', 0)
    print(f"  Simulation Duration: {sim_time:.0f}s" if sim_time else "  Simulation Duration: N/A")
    
    print("\nSimulation Complete!")
    print("=" * 60)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
