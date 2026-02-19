
import sys
import os
import shutil
from pathlib import Path

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from plotter import ChartGenerator

OUTPUT_DIR = "test_output"

if os.path.exists(OUTPUT_DIR):
    shutil.rmtree(OUTPUT_DIR)
os.makedirs(OUTPUT_DIR)

def test_spatial_exclusivity():
    plotter = ChartGenerator(output_dir=OUTPUT_DIR)
    
    # Case 1: No data
    print("Testing Case 1: No anomaly_logs")
    result = plotter.generate_spatial_exclusivity({})
    print(f"Result 1: {result}")
    
    # Case 2: Only Type 2/3 logs
    print("\nTesting Case 2: Only Type 2/3 logs")
    data_type2 = {
        'anomaly_logs': [
            {'type': 2, 'pos_km': 1.0, 'time': 100},
            {'type': 3, 'pos_km': 2.0, 'time': 120}
        ]
    }
    result = plotter.generate_spatial_exclusivity(data_type2)
    print(f"Result 2: {result}")
    
    # Case 3: With Type 1 logs
    print("\nTesting Case 3: With Type 1 logs")
    data_type1 = {
        'anomaly_logs': [
            {'type': 1, 'pos_km': 1.5, 'time': 150},
            {'type': 1, 'pos_km': 3.5, 'time': 200}
        ]
    }
    result = plotter.generate_spatial_exclusivity(data_type1)
    print(f"Result 3: {result}")
    
    # Check if files exist
    output_path = Path(OUTPUT_DIR) / "spatial_exclusivity.png"
    if output_path.exists():
        print(f"\nSUCCESS: File generated at {output_path}")
    else:
        print(f"\nFAILURE: File not generated")

if __name__ == "__main__":
    test_spatial_exclusivity()
