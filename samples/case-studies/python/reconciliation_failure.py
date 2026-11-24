ledger={'balance':12000}
bank={'balance':11900}
if ledger['balance']!=bank['balance']:
    raise ValueError('reconciliation mismatch')
