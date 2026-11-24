#include <stdio.h>
int main(void) {
    int ledger=12000, bank=11900;
    if(ledger!=bank) { fputs("reconciliation mismatch\n",stderr); return 2; }
    return 0;
}
