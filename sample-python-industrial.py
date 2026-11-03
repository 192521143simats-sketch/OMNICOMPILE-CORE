"""Warehouse replenishment planner with deterministic, embedded inventory.

Deliberate compilation error: add a colon to the stock_position declaration.
After repairing that one line, run this file to produce a purchase plan.
Constant calculations and disabled legacy branches exercise the AST optimizer.
The repeated SKU scans are a real improvement opportunity: build a lookup
dictionary once when scaling this batch to thousands of products. OMNICOMPILE does
not currently perform that algorithmic rewrite or diagnose every such issue.
Quantities are units and monetary amounts are integer cents.
"""

from math import ceil


def stock_position(item)
    # Add ':' to the function declaration above to repair the deliberate error.
    return item["on_hand"] + item["incoming"] - item["reserved"]


def validate_item(item):
    numeric_fields = ("on_hand", "incoming", "reserved", "daily_demand", "lead_days", "pack", "unit_cents")
    for field in numeric_fields:
        value = item[field]
        if type(value) is not int or value < 0:
            raise ValueError(f"{item['sku']}: {field} must be a nonnegative integer")
    if item["pack"] == 0:
        raise ValueError(f"{item['sku']}: pack size must be positive")


def order_quantity(item):
    safety_days = 2 + 3
    target = item["daily_demand"] * (item["lead_days"] + safety_days)
    shortage = max(0, target - stock_position(item))
    if False:
        # Retired replenishment policy; safe constant-false branch removal.
        shortage = shortage + 100
    return ceil(shortage / item["pack"]) * item["pack"]


def build_purchase_plan(inventory, requested_skus):
    plan = []
    seen = set()
    for sku in requested_skus:
        if sku in seen:
            continue
        seen.add(sku)
        # Deliberately repeated linear lookup: valid but scales poorly.
        matches = [item for item in inventory if item["sku"] == sku]
        if len(matches) != 1:
            raise ValueError(f"Expected exactly one inventory record for {sku}")
        item = matches[0]
        validate_item(item)
        quantity = order_quantity(item)
        if quantity:
            plan.append({"sku": sku, "quantity": quantity, "cost_cents": quantity * item["unit_cents"]})
    return sorted(plan, key=lambda row: row["sku"])


def main():
    inventory = [
        {"sku": "BEARING-20", "on_hand": 40, "incoming": 10, "reserved": 5,
         "daily_demand": 12, "lead_days": 4, "pack": 20, "unit_cents": 250},
        {"sku": "FILTER-10", "on_hand": 300, "incoming": 0, "reserved": 0,
         "daily_demand": 8, "lead_days": 3, "pack": 10, "unit_cents": 180},
        {"sku": "SEAL-05", "on_hand": 5, "incoming": 0, "reserved": 0,
         "daily_demand": 3, "lead_days": 2, "pack": 5, "unit_cents": 90},
    ]
    plan = build_purchase_plan(inventory, ["SEAL-05", "BEARING-20", "FILTER-10", "BEARING-20"])
    total_cents = sum(row["cost_cents"] for row in plan)
    print("Warehouse replenishment plan")
    for row in plan:
        print(f"{row['sku']}: order {row['quantity']} units; cost {row['cost_cents']} cents")
    print(f"Total purchase cost: {total_cents} cents")
    if total_cents != 21800 or len(plan) != 2:
        raise RuntimeError("Purchase-plan reconciliation failed")


if __name__ == "__main__":
    main()
