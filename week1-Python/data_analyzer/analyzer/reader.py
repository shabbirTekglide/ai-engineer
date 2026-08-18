import csv
import json
from typing import List, Dict,Any

def read_csv(file_path: str) -> List[Dict[str, Any]]:
    """
    Read csv file and return list of dictionaries
    """
    try:
        with open(file_path,'r',encoding='utf-8') as file:
            reader = csv.DictReader(file)
            return [row for row in reader]
    except FileNotFoundError:
        raise FileNotFoundError(f"Error csv path '{file_path}' not found.")
    except Exception as e:
        raise Exception(f"Error reading csv file: {e}")
            
def read_json(file_path: str) -> List[Dict[str, Any]]:
    """
    Read json file and return list of dictionaries
    """
    try:
        with open(file_path,'r',encoding='utf-8') as file:
            reader = json.load(file)
            if not isinstance(reader,list):
                raise ValueError("JSON file must be a list of objects")
            return reader
    except FileNotFoundError:
        raise FileNotFoundError(f"Error json path '{file_path}' not found.")
    except Exception as e:
        raise Exception(f"Error reading json file: {e}")

def load_data(file_path: str) -> List[Dict[str, Any]]:
    """
    Read csv file and return list of dictionaries
    """
    if file_path.endswith(".csv"):
        return read_csv(file_path)
    elif file_path.endswith(".json"):
        return read_json(file_path)
    else:
        raise ValueError(f"Unsupported file format: {file_path}")