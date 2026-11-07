int main(void) {
    int index = 0;
    int total = 0;
    while (index < 10000) {
        total = total + index;
        index = index + 1;
    }
    return total == 49995000;
}
