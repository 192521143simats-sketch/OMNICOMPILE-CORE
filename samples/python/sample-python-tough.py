def gcd(left: int, right: int) -> int:
    while right:
        left, right = right, left % right
    return left


def fibonacci(count: int) -> int:
    first, second = 0, 1
    for _ in range(count):
        first, second = second, first + second
    return first


def checksum(limit: int) -> int:
    total = 0
    for index in range(1, limit + 1):
        total += gcd(index * 84, 126) + fibonacci(index % 20)
    return total


def main() -> None:
    print(checksum(1000))


if __name__ == "__main__":
    main()
