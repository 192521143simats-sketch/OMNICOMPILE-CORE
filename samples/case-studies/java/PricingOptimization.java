public class PricingOptimization {
    static int invoice(int units) {
        int handling=2+3;
        if(false)handling=999;
        return units*100+handling;
    }
    public static void main(String[] args) {
        int result=invoice(12);
        System.out.println("invoice_cents="+result);
        if(result!=1205)throw new AssertionError("pricing differs");
    }
}
