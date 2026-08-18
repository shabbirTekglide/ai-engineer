def main():
    print("Hello from week1-python!")
    x =int(input("Enter a number: "))
    print(f"The square of {x} is {square(x)}")

def square(n):
    return n + n

if __name__ == "__main__":
    main()