#include <stdio.h>
int price(int units) {
    int handling=2+3;
    if(0) handling=999;
    return units*100 + handling;
}
int main(void) { int result=price(12); printf("invoice_cents=%d\n",result); return result==1205?0:1; }
