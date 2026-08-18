from os import error
import argparse
import sys
from .reader import load_data
from .stats import compute_column_stat

def main():
    parser = argparse.ArgumentParser(description="A CLI tool to analyze CSV or JSON data")
    parser.add_argument("file",help="Path to the CSV or JSON file to analyze")
    parser.add_argument("column",required=True,help="Column name to compute statistics for")
    args = parser.parse_args()
    try:
        print(f"Loading data from {args.file}")
        data = load_data(args.file)
        if not data:
            print("Empty Data!")
        print(f"Analyzing Column: {args.column}'\n'")
        stats = compute_column_stat(data, args.column)
        
        if error in stats:
            print(f"Error : {stats[error]}")
        
        else:
            print("-" *30)
            print(f"Results for '{args.column}'")
            for key,value in stats.items():
                print(f"{key.upper()}: {value}")
            print("-" *30)

    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        sys.exit(1)
    

if __name__ == "__main__":
    main()
        
    
    