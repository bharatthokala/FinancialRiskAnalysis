from datetime import timedelta

MAX_TRANSACTION_AMOUNT = 50000
FREQUENCY_WINDOW_MINUTES = 10
FREQUENCY_LIMIT = 5

RISK_WEIGHTS = {
"HIGH_AMOUNT": 40,
"HIGH_FREQUENCY": 35,
"REGION_CHANGE": 25
}

def evaluate_transaction(transaction, history, config=None):
    amount = float(transaction["amount"])
    transaction_time = transaction["transaction_time"]
    region = transaction["region"]

    reasons = []
    score = 0

    # Rule 1: High transaction amount
    if amount > MAX_TRANSACTION_AMOUNT:
        reasons.append("HIGH_AMOUNT")
        score += RISK_WEIGHTS["HIGH_AMOUNT"]

    # Find previous transactions from the same account
    account_history = [
        item for item in history
        if item["account_id"] == transaction["account_id"]
        and item["transaction_id"] != transaction["transaction_id"]
        and item["transaction_time"] <= transaction_time
]

    # Rule 2: High transaction frequency
    recent_transactions = [
        item for item in account_history
        if timedelta(0) <= transaction_time - item["transaction_time"]
        <= timedelta(minutes=FREQUENCY_WINDOW_MINUTES)
]

    if len(recent_transactions) >= FREQUENCY_LIMIT:
        reasons.append("HIGH_FREQUENCY")
        score += RISK_WEIGHTS["HIGH_FREQUENCY"]

    # Rule 3: Region change
    previous_transactions = [
        item for item in account_history
        if item["transaction_time"] < transaction_time
    ]

    if previous_transactions:
        previous = max(
            previous_transactions,
            key=lambda item: item["transaction_time"]
        )

        if previous["region"] != region:
            reasons.append("REGION_CHANGE")
            score += RISK_WEIGHTS["REGION_CHANGE"]

    # Limit score to 100
    score = min(score, 100)

    # Determine risk level
    if score >= 80:
        level = "CRITICAL"
    elif score >= 60:
        level = "HIGH"
    elif score >= 30:
        level = "MEDIUM"
    else:
        level = "LOW"

    return {
        "risk_score": score,
        "risk_level": level,
        "reasons": reasons
}

