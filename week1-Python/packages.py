class Package:
    def __init__(self, number, sender, recipient, weight):
        self.number = number
        self.sender = sender
        self.recipient = recipient
        self.weight = weight
    def calculate_cost(self, cost_per_kg):
        return self.weight * cost_per_kg
    def __str__(self):
        return f"Package {self.number} from {self.sender} to {self.recipient} weighs {self.weight} kg."
def main():
    
    packages = [
        Package(1, "Alice", "Bob", 2.5),
        Package(2, "Bob", "Charlie", 1.2),
        Package(3, "Charlie", "Alice", 0.8),
        Package(4, "Alice", "Bob", 3.0),
        Package(5, "Bob", "Charlie", 2.0)
    ]
    for package in packages:
        print(package)
main() 