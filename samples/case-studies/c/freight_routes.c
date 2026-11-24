#include <stdio.h>
#define N 4
#define INF 100000
int main(void) {
    int d[N][N]={{0,4,10,INF},{INF,0,3,12},{INF,INF,0,2},{INF,INF,INF,0}};
    for(int k=0;k<N;k++) for(int i=0;i<N;i++) for(int j=0;j<N;j++)
        if(d[i][k]+d[k][j]<d[i][j]) d[i][j]=d[i][k]+d[k][j];
    printf("cheapest_route=%d\n",d[0][3]);
    return d[0][3]==9?0:1;
}
