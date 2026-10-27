from datetime import datetime, timedelta
from rules import evaluate_transaction


def make_transaction(amount=1000, region="Chennai", transaction_id=1):
    return {
        "transaction_id": transaction_id,
        "account_id": 1,
        "amount": amount,
        "region": region,
        "transaction_time": datetime(2026, 1, 1, 12, 0, 0),
    }


def test_high_amount_rule():
    transaction = make_transaction(amount=75000)

    result = evaluate_transaction(transaction, [transaction])

    assert "HIGH_AMOUNT" in result["reasons"]
    assert result["risk_score"] >= 40


def test_normal_transaction_has_no_alert():
    transaction = make_transaction()

    result = evaluate_transaction(transaction, [transaction])

    assert result["reasons"] == []
    assert result["risk_score"] == 0


def test_region_change_rule():
    previous = make_transaction(
        region="Chennai",
        transaction_id=1
    )

    current = make_transaction(
        region="Delhi",
        transaction_id=2
    )

    current["transaction_time"] += timedelta(minutes=5)

    result = evaluate_transaction(
        current,
        [previous, current]
    )

    assert "REGION_CHANGE" in result["reasons"]