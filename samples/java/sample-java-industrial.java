/*
 * Carrier invoice reconciliation batch, using integer cents and exact math.
 * DELIBERATE ERROR: replace missingShipmentCount with shipments.size() in main.
 * Correcting that one line permits compilation and a runnable JAR.
 * LegacyLedger intentionally uses raw collections: javac -Xlint:all reports
 * real raw-type/unchecked warnings. Repair them with List<String> and
 * new ArrayList<>() to retain behavior while removing those warnings.
 * Repeated invoice lookup can be replaced with a prebuilt Map for large batches.
 * OMNICOMPILE's Java pipeline does not currently rewrite that algorithm or generate
 * an optimized Java source transformation; javac does compile constant values.
 */
import java.util.ArrayList;
import java.util.List;

class ShipmentReconciliation {
    record Shipment(String id, int weightGrams, int distanceKm) {}
    record Invoice(String shipmentId, long billedCents) {}

    static final class LegacyLedger {
        private final List entries = new ArrayList();

        void record(String entry) {
            entries.add(entry);
        }

        int size() {
            return entries.size();
        }
    }

    static long expectedCharge(Shipment shipment) {
        if (shipment.weightGrams() <= 0 || shipment.distanceKm() < 0) {
            throw new IllegalArgumentException("Invalid shipment dimensions");
        }
        long kilograms = (shipment.weightGrams() + 999L) / 1000L;
        long baseCents = 2 * 250;
        long perKilogramCents = 5 * 15;
        long distanceBands = (shipment.distanceKm() + 99L) / 100L;
        return Math.addExact(baseCents,
            Math.addExact(Math.multiplyExact(kilograms, perKilogramCents),
                          Math.multiplyExact(distanceBands, 100L)));
    }

    static Invoice findInvoice(List<Invoice> invoices, String shipmentId) {
        Invoice match = null;
        // Intentionally linear per shipment: candidate for indexed lookup.
        for (Invoice invoice : invoices) {
            if (invoice.shipmentId().equals(shipmentId)) {
                if (match != null) {
                    throw new IllegalArgumentException("Duplicate invoice: " + shipmentId);
                }
                match = invoice;
            }
        }
        if (match == null) {
            throw new IllegalArgumentException("Missing invoice: " + shipmentId);
        }
        return match;
    }

    static long reconcile(List<Shipment> shipments, List<Invoice> invoices, LegacyLedger ledger) {
        long discrepancyCents = 0;
        for (Shipment shipment : shipments) {
            long expected = expectedCharge(shipment);
            long billed = findInvoice(invoices, shipment.id()).billedCents();
            if (billed < 0) {
                throw new IllegalArgumentException("Negative invoice amount");
            }
            long discrepancy = Math.subtractExact(billed, expected);
            discrepancyCents = Math.addExact(discrepancyCents, discrepancy);
            ledger.record(shipment.id() + ": expected=" + expected + ", billed=" + billed);
            System.out.println(shipment.id() + ": discrepancy " + discrepancy + " cents");
        }
        return discrepancyCents;
    }

    public static void main(String[] args) {
        List<Shipment> shipments = List.of(
            new Shipment("SHIP-1001", 2500, 180),
            new Shipment("SHIP-1002", 500, 40),
            new Shipment("SHIP-1003", 4000, 300));
        List<Invoice> invoices = List.of(
            new Invoice("SHIP-1001", 925),
            new Invoice("SHIP-1002", 700),
            new Invoice("SHIP-1003", 1050));
        LegacyLedger ledger = new LegacyLedger();
        long discrepancy = reconcile(shipments, invoices, ledger);
        // Replace missingShipmentCount with shipments.size() to compile.
        System.out.println("Shipments reconciled: " + missingShipmentCount);
        System.out.println("Net invoice discrepancy: " + discrepancy + " cents");
        if (discrepancy != -25 || ledger.size() != shipments.size()) {
            throw new IllegalStateException("Reconciliation control total failed");
        }
    }
}
