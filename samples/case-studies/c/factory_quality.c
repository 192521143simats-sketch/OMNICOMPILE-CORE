#include <stdio.h>
int within(int reading,int low,int high) { return reading>=low && reading<=high; }
int rejects(const int *values,int n) { int count=0; for(int i=0;i<n;i++) count+=!within(values[i],97,103); return count; }
int energy(const int *values,int n) { int total=0; for(int i=0;i<n;i++) total+=values[i]*2; return total; }
int main(void) {
    int samples[]={100,96,102,104,99,101};
    int bad=rejects(samples,6), used=energy(samples,6);
    printf("rejects=%d energy=%d\n",bad,used);
    return bad==2 && used==1204?0:1;
}
