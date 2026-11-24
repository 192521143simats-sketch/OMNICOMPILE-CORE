public class WarehouseReorder {
    record Item(int stock,int daily,int lead,int pack) {}
    static int demand(Item x) { return x.daily()*x.lead(); }
    static int reorder(Item x) { int shortfall=Math.max(0,demand(x)-x.stock());return (shortfall+x.pack()-1)/x.pack()*x.pack(); }
    public static void main(String[] args) {
        Item[] items={new Item(20,8,5,12),new Item(100,4,7,10),new Item(0,3,3,5)};
        int total=0;for(Item item:items)total+=reorder(item);
        System.out.println("reorder_units="+total);
        if(total!=34)throw new AssertionError("purchase plan differs");
    }
}
