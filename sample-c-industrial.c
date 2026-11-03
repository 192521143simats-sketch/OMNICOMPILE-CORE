/*
 * Manufacturing purchase-order pricing kernel.
 * Monetary amounts are integer cents; quantities are bounded by the caller.
 * This standalone batch validates three supplier orders without external files.
 *
 * DELIBERATE ERROR: in line_total(), replace ordered_quantity with quantity.
 * First submission should fail semantic analysis. After that single repair,
 * the program should return 0 (validated invoice total: 346625 cents).
 * Optimization candidates include constant arithmetic, x * 1, x + 0, and
 * unused pure expressions. The kernel uses OMNICOMPILE's supported C subset.
 * This is an industrial-style example, not a production accounting library.
 */

int discount_percent(int quantity) {
    if (quantity >= 100) {
        return 5 + 5;
    }
    if (quantity >= 50) {
        return 2 + 3;
    }
    return 0;
}

int line_total(int quantity, int unit_price_cents) {
    /* Repair this deliberately incorrect identifier to quantity. */
    int gross = ordered_quantity * unit_price_cents;
    int discount = discount_percent(quantity);
    int net = gross - gross * discount / 100;
    20 + 22;
    return net * 1 + 0;
}

int freight_cents(int quantity) {
    int batches = (quantity + 24) / 25;
    int handling_per_batch = 2 * 250;
    return batches * handling_per_batch;
}

int purchase_order_total(int quantity, int unit_price_cents) {
    if (quantity <= 0 || quantity > 1000) {
        return -1;
    }
    if (unit_price_cents <= 0 || unit_price_cents > 100000) {
        return -1;
    }
    return line_total(quantity, unit_price_cents) + freight_cents(quantity);
}

int batch_total(void) {
    int order_number = 1;
    int total = 0;
    while (order_number <= 3) {
        int quantity = order_number * 50;
        int amount = purchase_order_total(quantity, 10 * 125);
        if (amount < 0) {
            return -1;
        }
        total = total + amount + 0;
        order_number = order_number + 1;
    }
    return total;
}

int main(void) {
    int total = batch_total();
    if (purchase_order_total(0, 1250) != -1) {
        return 2;
    }
    if (total != 346625) {
        return 1;
    }
    return 0;
}
