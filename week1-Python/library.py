# random
# import random

# coin = random.choice(["heads", "tails"])

# print(coin)

# cards = ["ace", 2, 3, 4, 5, 6, 7, 8, 9, 10, "jack", "queen", "king"]

# random.shuffle(cards)

# print(cards)

# statistics

# import statistics

# print(statistics.mean([100,90]))

# command Line arguments

# import sys

# if len(sys.argv) >2 :
#     print("too many arguments")
# elif len(sys.argv) < 2:
#     print("not enough arguments")
# else:
#     print("Hello, " + sys.argv[1] + "!")

# packagaes
# import cowsay
# import sys

# if len(sys.argv) == 2:
#     cowsay.cow("hello, " + sys.argv[1])


# APis

# import requests
# import sys
# import json

# if len(sys.argv) != 2:
#     sys.exit()

# response = requests.get("https://itunes.apple.com/search?entity=song&limit=1&term=" + sys.argv[1])
# o = response.json()
# for result in o["results"]:
#     print(result["trackName"])


# make my own package

def hello(name):
    print(f"hello, {name}")


def goodbye(name):
    print(f"goodbye, {name}")