from typing import Union
import statistics
from typing import List, Dict,Any

def extract_numeric_column(data: List[Dict[str,Any]], column_name: str) -> List[float]:
    """
    Extract numeric columns from list of dictionaries
    """
    values = []
    for row in data:
        if column_name in row:
            try:
                values.append(float(row[column_name]))
            except ValueError:
                pass
    return values

def compute_column_stat(data: List[Dict[str,Any]], column_name: str) -> Dict[str, Union[float, int]]:
    """
    Computes mean, median, max, min for a specific numeric column.
    """
    values = extract_numeric_column(data,column_name)
    if not values:
        raise ValueError(f"No numeric values found for column '{column_name}'")
    return {
        "count": len(values),
        "mean": statistics.mean(values),
        "median": statistics.median(values),
        "max": max(values),
        "min": min(values)
    }
