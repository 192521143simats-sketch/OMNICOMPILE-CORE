class SampleJavaTough {
    static int gcd(int left, int right) {
        while (right != 0) {
            int remainder = left % right;
            left = right;
            right = remainder;
        }
        return left;
    }

    static int fibonacci(int count) {
        int first = 0;
        int second = 1;
        for (int index = 0; index < count; index++) {
            int next = first + second;
            first = second;
            second = next;
        }
        return first;
    }

    static long checksum(int limit) {
        long total = 0;
        for (int index = 1; index <= limit; index++) {
            total += gcd(index * 84, 126) + fibonacci(index % 20);
        }
        return total;
    }

    public static void main(String[] args) {
        System.out.println(checksum(1000));
    }
}
