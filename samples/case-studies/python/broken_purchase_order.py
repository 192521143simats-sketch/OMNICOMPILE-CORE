def purchase_total(rows)
    return sum(qty*price for qty,price in rows)
print(purchase_total([(2,10)]))
