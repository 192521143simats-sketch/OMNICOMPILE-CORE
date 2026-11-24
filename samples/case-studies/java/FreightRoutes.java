public class FreightRoutes {
    public static void main(String[] args) {
        int inf=100000;
        int[][] d={{0,4,10,inf},{inf,0,3,12},{inf,inf,0,2},{inf,inf,inf,0}};
        for(int k=0;k<4;k++)for(int i=0;i<4;i++)for(int j=0;j<4;j++)
            d[i][j]=Math.min(d[i][j],d[i][k]+d[k][j]);
        System.out.println("cheapest_route="+d[0][3]);
        if(d[0][3]!=9)throw new AssertionError("routing cost differs");
    }
}
