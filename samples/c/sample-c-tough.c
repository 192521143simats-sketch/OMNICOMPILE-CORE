int gcd(int left, int right) {
    while (right != 0) {
        int remainder = left % right;
        left = right;
        right = remainder;
    }
    return left;
}

int fibonacci(int count) {
    int first = 0;
    int second = 1;
    int index = 0;
    while (index < count) {
        int next = first + second;
        first = second;
        second = next;
        index = index + 1;
    }
    return first;
}

int checksum(int limit) {
    int index = 1;
    int total = 0;
    while (index <= limit) {
        total = total + gcd(index * 84, 126) + fibonacci(index % 20);
        index = index + 1;
    }
    return total;
}

int main(void) {
    int result = checksum(1000);
    return result > 0;
}
