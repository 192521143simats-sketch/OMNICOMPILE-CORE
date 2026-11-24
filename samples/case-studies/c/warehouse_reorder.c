#include <stdio.h>
typedef struct { int stock, daily, lead, pack; } Item;
int demand(Item x) { return x.daily * x.lead; }
int shortage(Item x) { int need=demand(x)-x.stock; return need>0?need:0; }
int reorder(Item x) { int s=shortage(x); return (s+x.pack-1)/x.pack*x.pack; }
int main(void) {
    Item items[]={{20,8,5,12},{100,4,7,10},{0,3,3,5}};
    int total=0;
    for(int i=0;i<3;i++) total+=reorder(items[i]);
    printf("reorder_units=%d\n",total);
    return total==34?0:1;
}
