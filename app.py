from flask import Flask, jsonify, request
import config

app = Flask(__name__)


@app.route("/")
def home():
    return "Welcome to Financial Risk Analysis System"


@app.route("/transactions")
def all_transactions():
    mydb = config.connect()
    mc = mydb.cursor(dictionary=True)

    mc.execute("SELECT * FROM transactions;")
    r = mc.fetchall()

    mc.close()
    mydb.close()

    return jsonify(r)


@app.route("/alerts")
def all_alerts():
    mydb = config.connect()
    mc = mydb.cursor(dictionary=True)

    mc.execute("SELECT * FROM alerts;")
    r = mc.fetchall()

    mc.close()
    mydb.close()

    return jsonify(r)


@app.route("/transactions/<int:id>")
def one_transaction(id):
    mydb = config.connect()
    mc = mydb.cursor(dictionary=True)

    mc.execute(
        "SELECT * FROM transactions WHERE transaction_id = %s;",
        (id,)
    )
    r = mc.fetchall()

    mc.close()
    mydb.close()

    return jsonify(r)


@app.route("/transactions/region/<string:region>")
def region_transactions(region):
    mydb = config.connect()
    mc = mydb.cursor(dictionary=True)

    mc.execute(
        "SELECT * FROM transactions WHERE region = %s;",
        (region,)
    )
    r = mc.fetchall()

    mc.close()
    mydb.close()

    return jsonify(r)


@app.route("/transactions/high-risk")
def high_risk_transactions():
    mydb = config.connect()
    mc = mydb.cursor(dictionary=True)

    mc.execute("""
        SELECT
            t.*,
            a.alert_id,
            a.rule_name,
            a.risk_score,
            CASE
                WHEN a.risk_score >= 80 THEN 'CRITICAL'
                WHEN a.risk_score >= 60 THEN 'HIGH'
                WHEN a.risk_score >= 30 THEN 'MEDIUM'
                ELSE 'LOW'
            END AS risk_level,
            a.review_status,
            a.explanation
        FROM transactions AS t
        JOIN alerts AS a
            ON t.transaction_id = a.transaction_id
        WHERE a.risk_score >= 60
        ORDER BY a.risk_score DESC;
    """)

    r = mc.fetchall()

    mc.close()
    mydb.close()

    return jsonify(r)


@app.route("/customers")
def all_customers():
    mydb = config.connect()
    mc = mydb.cursor(dictionary=True)

    mc.execute("SELECT * FROM customers;")
    r = mc.fetchall()

    mc.close()
    mydb.close()

    return jsonify(r)


@app.route("/accounts")
def all_accounts():
    mydb = config.connect()
    mc = mydb.cursor(dictionary=True)

    mc.execute("SELECT * FROM accounts;")
    r = mc.fetchall()

    mc.close()
    mydb.close()

    return jsonify(r)


@app.route("/api/health")
def health():
    try:
        mydb = config.connect()
        mydb.close()

        return jsonify({
            "status": "healthy",
            "database": "connected"
        })

    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "error": str(e)
        }), 500


@app.route("/api/detect", methods=["POST"])
def detect_risk():
    mydb = config.connect()
    mc = mydb.cursor(dictionary=True)

    mc.execute("""
        SELECT *
        FROM transactions
        ORDER BY account_id, transaction_datetime;
    """)

    transactions = mc.fetchall()

    alerts_created = 0

    for i, transaction in enumerate(transactions):
        reasons = []
        score = 0

        # Rule 1: High transaction amount
        if float(transaction["amount"]) > 50000:
            reasons.append("HIGH_AMOUNT")
            score += 40

        # Previous transactions for the same account
        previous = [
            t for t in transactions[:i]
            if t["account_id"] == transaction["account_id"]
        ]

        # Rule 2: Different transaction region
        if previous:
            if previous[-1]["region"] != transaction["region"]:
                reasons.append("REGION_CHANGE")
                score += 25

        # Rule 3: High transaction frequency within 10 minutes
        recent = [
            t for t in previous
            if 0 <= (
                    transaction["transaction_datetime"] - t["transaction_datetime"]
            ).total_seconds() <= 600
        ]

        if len(recent) >= 5:
            reasons.append("HIGH_FREQUENCY")
            score += 35

        score = min(score, 100)

        if score >= 80:
            level = "CRITICAL"
        elif score >= 60:
            level = "HIGH"
        elif score >= 30:
            level = "MEDIUM"
        else:
            level = "LOW"

        for reason in reasons:
            mc.execute("""
                INSERT INTO alerts
                (transaction_id, rule_name, risk_score, explanation, review_status)
                VALUES (%s, %s, %s, %s, 'PENDING')
                ON DUPLICATE KEY UPDATE
                    risk_score = VALUES(risk_score),
                    explanation = VALUES(explanation)
            """, (
                transaction["transaction_id"],
                reason,
                score,
                "Rule triggered: " + reason + ". Risk level: " + level
            ))

            alerts_created += 1

    mydb.commit()

    mc.close()
    mydb.close()

    return jsonify({
        "message": "Risk detection completed",
        "transactions_evaluated": len(transactions),
        "alert_records_processed": alerts_created,
        "note": "Alerts require manual review and do not confirm fraud."
    })


if __name__ == "__main__":
    app.run(debug=True)