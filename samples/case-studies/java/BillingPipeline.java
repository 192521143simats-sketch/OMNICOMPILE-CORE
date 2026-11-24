import java.math.BigDecimal;
import java.util.Map;
import java.util.TreeMap;
public class BillingPipeline {
    record Line(String customer,int qty,String unit) {}
    static BigDecimal amount(Line line) { return new BigDecimal(line.unit()).multiply(BigDecimal.valueOf(line.qty())); }
    public static void main(String[] args) {
        Line[] lines={new Line("ACME",3,"19.95"),new Line("BETA",2,"10.00"),new Line("ACME",1,"5.15")};
        Map<String,BigDecimal> totals=new TreeMap<>();
        for(Line line:lines)totals.merge(line.customer(),amount(line),BigDecimal::add);
        System.out.println("ACME="+totals.get("ACME")+" BETA="+totals.get("BETA"));
        if(totals.get("ACME").compareTo(new BigDecimal("65.00"))!=0)throw new AssertionError("money differs");
    }
}
