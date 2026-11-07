class SampleJavaEasy {
    public static void main(String[] args) {
        long total = 0;
        for (int value = 0; value < 10000; value++) {
            total += value;
        }
        System.out.println(total);
    }
}
