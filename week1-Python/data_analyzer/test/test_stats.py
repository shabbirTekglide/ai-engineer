import pytest
from ..analyzer import compute_column_stat, extract_numeric_column

@pytest.fixture
def sample_test():
    TEST_DATA = [
        {"name": "Ali", "age": "25", "salary": 50000},
        {"name": "Sara", "age": 30, "salary": 60000},
        {"name": "Ahmed", "age": "invalid", "salary": 45000}]
    return TEST_DATA

def test_extract_numeric_column(sample_test):
    ages = extract_numeric_column(sample_test, "age")
    assert ages == [25,30]

def test_compute_column_stat(sample_test):
    stats = compute_column_stat(sample_test, "salary")
    assert stats["count"] == 3
    assert stats["mean"] == pytest.approx(51666.66)
    assert stats["min"] == 45000
    assert stats["max"] == 60000

def test_compute_column_stat_invalid_column():
    stats = compute_column_stat(sample_test, "height")
    assert "error" in stats
