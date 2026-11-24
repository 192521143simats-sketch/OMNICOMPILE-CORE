def invoice(units):
    handling=2+3
    if False:
        raise RuntimeError('unreachable legacy pricing')
    return units*100+handling
result=invoice(12)
print('invoice_cents='+str(result))
assert result==1205
