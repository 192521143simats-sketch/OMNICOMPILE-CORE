from decimal import Decimal, ROUND_HALF_UP
from collections import defaultdict

def line_total(qty, unit):
    return (Decimal(qty)*Decimal(unit)).quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)

def reconcile(rows):
    totals=defaultdict(lambda: Decimal('0.00'))
    for customer,qty,unit in rows:
        totals[customer]+=line_total(qty,unit)
    return totals

rows=[('ACME',3,'19.95'),('BETA',2,'10.00'),('ACME',1,'5.15')]
totals=reconcile(rows)
print('ACME='+str(totals['ACME'])+' BETA='+str(totals['BETA']))
assert totals['ACME']==Decimal('65.00') and totals['BETA']==Decimal('20.00')
