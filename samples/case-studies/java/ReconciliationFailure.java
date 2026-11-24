public class ReconciliationFailure {
    public static void main(String[] args) {
        int ledger=12000,bank=11900;
        if(ledger!=bank)throw new IllegalStateException("reconciliation mismatch");
    }
}
