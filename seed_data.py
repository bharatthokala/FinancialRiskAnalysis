from datetime import datetime, timedelta
from db import execute_query, fetch_all


def seed_data():
    customers = fetch_all(
        "SELECT customer_id FROM customers "
        "WHERE customer_code = %s",
        ("DEMO_CUSTOMER_001",)
    )

    if customers:
        customer_id = customers[0]["customer_id"]
    else:
        customer_id = execute_query(
            """
            INSERT INTO customers (customer_code, full_name)
            VALUES (%s, %s)
            """,
            ("DEMO_CUSTOMER_001", "Synthetic Demo Customer")
        )

    accounts = fetch_all(
        "SELECT account_id FROM accounts WHERE account_code = %s",
        ("DEMO_ACCOUNT_001",)
    )

    if accounts:
        account_id = accounts[0]["account_id"]
    else:
        account_id = execute_query(
            """
            INSERT INTO accounts (account_code, customer_id, balance)
            VALUES (%s, %s, %s)
            """,
            ("DEMO_ACCOUNT_001", customer_id, 100000)
        )

    existing = fetch_all(
        "SELECT transaction_id FROM transactions WHERE account_id = %s",
        (account_id,)
    )

    if existing:
        print("Synthetic transactions already exist. Skipping insertion.")
        return

    now = datetime.now().replace(microsecond=0)

    sample_transactions = [
        ("TXN001", 1500, "DEBIT", "Chennai", now - timedelta(minutes=30)),
        ("TXN002", 2200, "DEBIT", "Chennai", now - timedelta(minutes=20)),
        ("TXN003", 1800, "CREDIT", "Chennai", now - timedelta(minutes=15)),
        ("TXN004", 3200, "DEBIT", "Chennai", now - timedelta(minutes=5)),
        ("TXN005", 75000, "DEBIT", "Delhi", now),
    ]

    for reference, amount, kind, region, timestamp in sample_transactions:
        execute_query(
            """
            INSERT INTO transactions
            (transaction_ref, account_id, amount,
             transaction_type, region, transaction_time)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (reference, account_id, amount, kind, region, timestamp)
        )

    print("Synthetic customer, account, and transactions created.")


if __name__ == "__main__":
    seed_data()