class Food:
    base_hearts = 1
    def __init__(self, incrededients):
        self.incrededients = incrededients,
        self.hearts = Food.calculate_hearts(incrededients) 
    @classmethod
    def calculate_hearts(cls,incrededients):
        # print(f"Calculating hearts for incrededients: {cls.incrededients}")
        hearts = cls.base_hearts
        for incrededient in incrededients:
            if incrededient in ["mushrooms"]:
                hearts += 2
            else:
                hearts += 1
        return hearts
    @classmethod
    def from_nothing(cls, hearts):
        food = cls([])
        food.hearts = hearts
        return food

def main():
    mushroom_skewer = Food(["mushrooms", "onions", "peppers"])
    print(f"Mushroom Skewer has {mushroom_skewer.hearts} hearts.")

    mushroom_skewer = Food.from_nothing(2)
    print(f"Mushroom Skewer has {mushroom_skewer.hearts} hearts.")

main()