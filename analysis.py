import os
import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
from db import fetch_all


def main():
    os.makedirs("charts", exist_ok=True)
    os.makedirs("reports", exist_ok=True)

    transactions = fetch_all(
        "SELECT * FROM transactions ORDER BY transaction_time"
    )

    alerts = fetch_all(
        "SELECT * FROM alerts ORDER BY created_at"
    )

    if not transactions:
        print("No transactions found. Run python seed_data.py first.")
        return

    df = pd.DataFrame(transactions)
    df["amount"] = pd.to_numeric(df["amount"])

    print("TRANSACTION ANALYSIS")
    print("====================")
    print(f"Total transactions: {len(df)}")
    print(f"Total transaction value: {df['amount'].sum():.2f}")
    print(f"Average transaction amount: {df['amount'].mean():.2f}")
    print(f"Median transaction amount: {df['amount'].median():.2f}")
    print(f"Standard deviation: {np.std(df['amount']):.2f}")

    df.to_csv("reports/transactions_report.csv", index=False)

    # Amount distribution
    plt.figure()
    plt.hist(df["amount"], bins=10)
    plt.title("Transaction Amount Distribution")
    plt.xlabel("Transaction Amount")
    plt.ylabel("Number of Transactions")
    plt.tight_layout()
    plt.savefig("charts/transaction_amount_distribution.png")
    plt.close()

    # Transaction count by region
    region_counts = df.groupby("region").size()

    plt.figure()
    region_counts.plot(kind="bar")
    plt.title("Transactions by Region")
    plt.xlabel("Region")
    plt.ylabel("Number of Transactions")
    plt.tight_layout()
    plt.savefig("charts/transactions_by_region.png")
    plt.close()

    if alerts:
        alert_df = pd.DataFrame(alerts)
        alert_df.to_csv("reports/alerts_report.csv", index=False)

        risk_counts = alert_df["risk_level"].value_counts()

        plt.figure()
        risk_counts.plot(kind="bar")
        plt.title("Risk Alerts by Risk Level")
        plt.xlabel("Risk Level")
        plt.ylabel("Alert Records")
        plt.tight_layout()
        plt.savefig("charts/alerts_by_risk_level.png")
        plt.close()

    print("\nReports generated in the reports/ folder.")
    print("Charts generated in the charts/ folder.")


if __name__ == "__main__":
    main()