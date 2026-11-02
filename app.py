from flask import Flask, jsonify, render_template, request
from datetime import datetime
from decimal import Decimal, InvalidOperation
import mysql.connector
import config

app = Flask(__name__)


# =========================================================
# SHARED HELPERS
# =========================================================

def get_json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def api_error(message, status_code=400):
    return jsonify({
        "success": False,
        "error": message
    }), status_code


def valid_positive_id(value):
    if isinstance(value, bool):
        return None

    try:
        if isinstance(value, float) and not value.is_integer():
            return None

        text = str(value).strip()

        if not text or not text.isdigit():
            return None

        result = int(text)
        return result if result > 0 else None

    except (ValueError, TypeError, OverflowError):
        return None


def validate_code(value, field_name):
    if not isinstance(value, str):
        return None, f"{field_name} must be text."

    value = value.strip()

    if not value:
        return None, f"{field_name} is required."

    if len(value) > 30:
        return None, f"{field_name} cannot exceed 30 characters."

    return value, None


def database_error_response(exception, entity_name):
    if isinstance(exception, mysql.connector.IntegrityError):
        error_code = getattr(exception, "errno", None)

        if error_code == 1062:
            return api_error(
                f"This {entity_name} code already exists.",
                409
            )

        if error_code == 1451:
            return api_error(
                f"Cannot delete this {entity_name} because related "
                "records exist. Remove or reassign those records first.",
                409
            )

        if error_code == 1452:
            return api_error(
                "The selected customer or account does not exist.",
                400
            )

    app.logger.exception(
        "Database operation failed for %s",
        entity_name
    )

    return api_error(
        f"Unable to complete the {entity_name} operation. "
        "Check the application logs.",
        500
    )


def close_database(mydb, mc):
    if mc is not None:
        try:
            mc.close()
        except Exception:
            app.logger.exception("Failed to close database cursor")

    if mydb is not None:
        try:
            if mydb.is_connected():
                mydb.close()
        except Exception:
            app.logger.exception("Failed to close database connection")


def validate_transaction_data(data):
    account_id = valid_positive_id(data.get("account_id"))

    if account_id is None:
        return None, "Account ID must be a positive integer."

    transaction_datetime_value = data.get("transaction_datetime")
    amount_value = data.get("amount")
    transaction_type_value = data.get("transaction_type")
    channel_value = data.get("channel")
    region_value = data.get("region", "")

    required_fields = {
        "transaction_datetime": transaction_datetime_value,
        "amount": amount_value,
        "transaction_type": transaction_type_value,
        "channel": channel_value
    }

    for field, value in required_fields.items():
        if value is None or str(value).strip() == "":
            return None, (
                f"{field.replace('_', ' ').capitalize()} is required."
            )

    try:
        amount = Decimal(str(amount_value).strip())

        if (
            not amount.is_finite()
            or amount <= 0
            or amount > Decimal("9999999999999.99")
            or amount.as_tuple().exponent < -2
        ):
            raise InvalidOperation

    except (InvalidOperation, ValueError, TypeError):
        return None, (
            "Enter a valid positive amount with at most "
            "two decimal places."
        )

    try:
        transaction_datetime = datetime.strptime(
            str(transaction_datetime_value).strip(),
            "%Y-%m-%dT%H:%M"
        )
    except (ValueError, TypeError):
        return None, "Enter a valid transaction date and time."

    if not isinstance(transaction_type_value, str):
        return None, "Transaction type must be text."

    transaction_type = transaction_type_value.strip().upper()

    if not transaction_type or len(transaction_type) > 20:
        return None, "Transaction type must contain 1–20 characters."

    if not isinstance(channel_value, str):
        return None, "Channel must be text."

    channel = channel_value.strip()

    if not channel or len(channel) > 30:
        return None, "Channel must contain 1–30 characters."

    if region_value is None:
        region_value = ""

    if not isinstance(region_value, str):
        return None, "Region must be text."

    region = region_value.strip()

    if len(region) > 100:
        return None, "Region cannot exceed 100 characters."

    return {
        "account_id": account_id,
        "transaction_datetime": transaction_datetime,
        "amount": amount,
        "transaction_type": transaction_type,
        "channel": channel,
        "region": region or None
    }, None


# =========================================================
# FRONTEND PAGES
# =========================================================

@app.route("/")
def home():
    return render_template("dashboard.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@app.route("/transactions-page")
def transactions_page():
    return render_template("transactions.html")


@app.route("/alerts-page")
def alerts_page():
    return render_template("alerts.html")


@app.route("/analytics")
def analytics_page():
    return render_template("analytics.html")


@app.route("/customers-page")
def customers_page():
    return render_template("customers.html")


@app.route("/accounts-page")
def accounts_page():
    return render_template("accounts.html")


# =========================================================
# TRANSACTION API — READ ALL
# =========================================================

@app.route("/transactions", methods=["GET"])
def all_transactions():
    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT *
            FROM transactions
            ORDER BY transaction_datetime DESC;
        """)

        return jsonify(mc.fetchall())

    except Exception:
        app.logger.exception("Failed to retrieve transactions")
        return api_error("Unable to retrieve transactions.", 500)

    finally:
        close_database(mydb, mc)


# =========================================================
# TRANSACTION API — READ ONE
# =========================================================

@app.route("/transactions/<int:id>", methods=["GET"])
def one_transaction(id):
    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT *
            FROM transactions
            WHERE transaction_id = %s;
        """, (id,))

        transaction = mc.fetchone()

        if transaction is None:
            return api_error("Transaction not found.", 404)

        return jsonify(transaction)

    except Exception:
        app.logger.exception("Failed to retrieve transaction")
        return api_error("Unable to retrieve transaction.", 500)

    finally:
        close_database(mydb, mc)


# =========================================================
# TRANSACTION API — READ BY REGION
# =========================================================

@app.route("/transactions/region/<string:region>", methods=["GET"])
def region_transactions(region):
    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT *
            FROM transactions
            WHERE region = %s
            ORDER BY transaction_datetime DESC;
        """, (region,))

        return jsonify(mc.fetchall())

    except Exception:
        app.logger.exception("Failed to retrieve regional transactions")
        return api_error(
            "Unable to retrieve regional transactions.",
            500
        )

    finally:
        close_database(mydb, mc)


# =========================================================
# TRANSACTION API — READ HIGH-RISK TRANSACTIONS
# =========================================================

@app.route("/transactions/high-risk", methods=["GET"])
def high_risk_transactions():
    mydb = None
    mc = None

    try:
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

        return jsonify(mc.fetchall())

    except Exception:
        app.logger.exception("Failed to retrieve high-risk transactions")
        return api_error(
            "Unable to retrieve high-risk transactions.",
            500
        )

    finally:
        close_database(mydb, mc)


# =========================================================
# TRANSACTION API — CREATE
# =========================================================

@app.route("/api/transactions", methods=["POST"])
def add_transaction():
    data = get_json_body()

    if data is None:
        return api_error("A valid JSON request body is required.")

    values, error = validate_transaction_data(data)

    if error:
        return api_error(error)

    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor()

        account_id = values["account_id"]

        mc.execute("""
            SELECT account_id
            FROM accounts
            WHERE account_id = %s;
        """, (account_id,))

        if mc.fetchone() is None:
            return api_error("The selected account does not exist.")

        mc.execute("""
            INSERT INTO transactions (
                account_id,
                transaction_datetime,
                amount,
                transaction_type,
                channel,
                region
            )
            VALUES (%s, %s, %s, %s, %s, %s);
        """, (
            account_id,
            values["transaction_datetime"],
            values["amount"],
            values["transaction_type"],
            values["channel"],
            values["region"]
        ))

        transaction_id = mc.lastrowid
        mydb.commit()

        detection_success = detect_risk_for_account(account_id)

        return jsonify({
            "success": True,
            "message": "Transaction added successfully.",
            "transaction_id": transaction_id,
            "risk_detection": (
                "completed" if detection_success else "failed"
            )
        }), 201

    except Exception as exception:
        if mydb is not None and mydb.is_connected():
            mydb.rollback()

        return database_error_response(exception, "transaction")

    finally:
        close_database(mydb, mc)


# =========================================================
# TRANSACTION API — UPDATE
# =========================================================

@app.route("/api/transactions/<int:transaction_id>", methods=["PUT"])
def update_transaction(transaction_id):
    data = get_json_body()

    if data is None:
        return api_error("A valid JSON request body is required.")

    values, error = validate_transaction_data(data)

    if error:
        return api_error(error)

    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT transaction_id
            FROM transactions
            WHERE transaction_id = %s;
        """, (transaction_id,))

        if mc.fetchone() is None:
            return api_error("Transaction not found.", 404)

        mc.execute("""
            SELECT account_id
            FROM accounts
            WHERE account_id = %s;
        """, (values["account_id"],))

        if mc.fetchone() is None:
            return api_error("The selected account does not exist.")

        mc.execute("""
            UPDATE transactions
            SET account_id = %s,
                transaction_datetime = %s,
                amount = %s,
                transaction_type = %s,
                channel = %s,
                region = %s
            WHERE transaction_id = %s;
        """, (
            values["account_id"],
            values["transaction_datetime"],
            values["amount"],
            values["transaction_type"],
            values["channel"],
            values["region"],
            transaction_id
        ))

        mydb.commit()

        detection_success = detect_risk_for_account(values["account_id"])

        return jsonify({
            "success": True,
            "message": "Transaction updated successfully.",
            "transaction_id": transaction_id,
            "risk_detection": (
                "completed" if detection_success else "failed"
            )
        })

    except Exception as exception:
        if mydb is not None and mydb.is_connected():
            mydb.rollback()

        return database_error_response(exception, "transaction")

    finally:
        close_database(mydb, mc)


# =========================================================
# TRANSACTION API — DELETE
# =========================================================

@app.route("/api/transactions/<int:transaction_id>", methods=["DELETE"])
def delete_transaction(transaction_id):
    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT transaction_id
            FROM transactions
            WHERE transaction_id = %s;
        """, (transaction_id,))

        if mc.fetchone() is None:
            return api_error("Transaction not found.", 404)

        mc.execute("""
            SELECT COUNT(*) AS total
            FROM alerts
            WHERE transaction_id = %s;
        """, (transaction_id,))

        alert_count = mc.fetchone()["total"]

        if alert_count > 0:
            return api_error(
                f"This transaction has {alert_count} associated "
                "risk alert(s). It cannot be deleted while those "
                "alerts exist.",
                409
            )

        mc.execute("""
            DELETE FROM transactions
            WHERE transaction_id = %s;
        """, (transaction_id,))

        mydb.commit()

        return jsonify({
            "success": True,
            "message": "Transaction deleted successfully.",
            "transaction_id": transaction_id
        })

    except Exception as exception:
        if mydb is not None and mydb.is_connected():
            mydb.rollback()

        return database_error_response(exception, "transaction")

    finally:
        close_database(mydb, mc)


# =========================================================
# CUSTOMER API — READ ALL
# =========================================================

@app.route("/customers", methods=["GET"])
def all_customers():
    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT
                c.customer_id,
                c.customer_code,
                c.created_at,
                COUNT(a.account_id) AS account_count
            FROM customers AS c
            LEFT JOIN accounts AS a
                ON a.customer_id = c.customer_id
            GROUP BY
                c.customer_id,
                c.customer_code,
                c.created_at
            ORDER BY c.customer_id DESC;
        """)

        return jsonify(mc.fetchall())

    except Exception:
        app.logger.exception("Failed to retrieve customers")
        return api_error("Unable to retrieve customers.", 500)

    finally:
        close_database(mydb, mc)


# =========================================================
# CUSTOMER API — READ ONE
# =========================================================

@app.route("/api/customers/<int:customer_id>", methods=["GET"])
def get_customer(customer_id):
    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT
                c.customer_id,
                c.customer_code,
                c.created_at,
                COUNT(a.account_id) AS account_count
            FROM customers AS c
            LEFT JOIN accounts AS a
                ON a.customer_id = c.customer_id
            WHERE c.customer_id = %s
            GROUP BY
                c.customer_id,
                c.customer_code,
                c.created_at;
        """, (customer_id,))

        customer = mc.fetchone()

        if customer is None:
            return api_error("Customer not found.", 404)

        return jsonify(customer)

    except Exception:
        app.logger.exception("Failed to retrieve customer")
        return api_error("Unable to retrieve customer.", 500)

    finally:
        close_database(mydb, mc)


# =========================================================
# CUSTOMER API — CREATE
# =========================================================

@app.route("/api/customers", methods=["POST"])
def create_customer():
    data = get_json_body()

    if data is None:
        return api_error("A valid JSON request body is required.")

    customer_code, error = validate_code(
        data.get("customer_code"),
        "Customer code"
    )

    if error:
        return api_error(error)

    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor()

        mc.execute("""
            INSERT INTO customers (customer_code)
            VALUES (%s);
        """, (customer_code,))

        customer_id = mc.lastrowid
        mydb.commit()

        return jsonify({
            "success": True,
            "message": "Customer created successfully.",
            "customer": {
                "customer_id": customer_id,
                "customer_code": customer_code
            }
        }), 201

    except Exception as exception:
        if mydb is not None and mydb.is_connected():
            mydb.rollback()

        return database_error_response(exception, "customer")

    finally:
        close_database(mydb, mc)


# =========================================================
# CUSTOMER API — UPDATE
# =========================================================

@app.route("/api/customers/<int:customer_id>", methods=["PUT"])
def update_customer(customer_id):
    data = get_json_body()

    if data is None:
        return api_error("A valid JSON request body is required.")

    customer_code, error = validate_code(
        data.get("customer_code"),
        "Customer code"
    )

    if error:
        return api_error(error)

    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT customer_id
            FROM customers
            WHERE customer_id = %s;
        """, (customer_id,))

        if mc.fetchone() is None:
            return api_error("Customer not found.", 404)

        mc.execute("""
            UPDATE customers
            SET customer_code = %s
            WHERE customer_id = %s;
        """, (customer_code, customer_id))

        mydb.commit()

        return jsonify({
            "success": True,
            "message": "Customer updated successfully.",
            "customer_id": customer_id,
            "customer_code": customer_code
        })

    except Exception as exception:
        if mydb is not None and mydb.is_connected():
            mydb.rollback()

        return database_error_response(exception, "customer")

    finally:
        close_database(mydb, mc)


# =========================================================
# CUSTOMER API — DELETE
# =========================================================

@app.route("/api/customers/<int:customer_id>", methods=["DELETE"])
def delete_customer(customer_id):
    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT customer_id
            FROM customers
            WHERE customer_id = %s;
        """, (customer_id,))

        if mc.fetchone() is None:
            return api_error("Customer not found.", 404)

        mc.execute("""
            SELECT COUNT(*) AS total
            FROM accounts
            WHERE customer_id = %s;
        """, (customer_id,))

        account_count = mc.fetchone()["total"]

        if account_count > 0:
            return api_error(
                f"This customer has {account_count} associated account(s). "
                "Reassign or remove those accounts before deleting "
                "the customer.",
                409
            )

        mc.execute("""
            DELETE FROM customers
            WHERE customer_id = %s;
        """, (customer_id,))

        mydb.commit()

        return jsonify({
            "success": True,
            "message": "Customer deleted successfully."
        })

    except Exception as exception:
        if mydb is not None and mydb.is_connected():
            mydb.rollback()

        return database_error_response(exception, "customer")

    finally:
        close_database(mydb, mc)


# =========================================================
# ACCOUNT API — READ ALL
# =========================================================

@app.route("/accounts", methods=["GET"])
def all_accounts():
    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT
                a.account_id,
                a.customer_id,
                a.account_code,
                a.created_at,
                c.customer_code,
                COUNT(t.transaction_id) AS transaction_count
            FROM accounts AS a
            JOIN customers AS c
                ON c.customer_id = a.customer_id
            LEFT JOIN transactions AS t
                ON t.account_id = a.account_id
            GROUP BY
                a.account_id,
                a.customer_id,
                a.account_code,
                a.created_at,
                c.customer_code
            ORDER BY a.account_id DESC;
        """)

        return jsonify(mc.fetchall())

    except Exception:
        app.logger.exception("Failed to retrieve accounts")
        return api_error("Unable to retrieve accounts.", 500)

    finally:
        close_database(mydb, mc)


# =========================================================
# ACCOUNT API — READ ONE
# =========================================================

@app.route("/api/accounts/<int:account_id>", methods=["GET"])
def get_account(account_id):
    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT
                a.account_id,
                a.customer_id,
                a.account_code,
                a.created_at,
                c.customer_code,
                COUNT(t.transaction_id) AS transaction_count
            FROM accounts AS a
            JOIN customers AS c
                ON c.customer_id = a.customer_id
            LEFT JOIN transactions AS t
                ON t.account_id = a.account_id
            WHERE a.account_id = %s
            GROUP BY
                a.account_id,
                a.customer_id,
                a.account_code,
                a.created_at,
                c.customer_code;
        """, (account_id,))

        account = mc.fetchone()

        if account is None:
            return api_error("Account not found.", 404)

        return jsonify(account)

    except Exception:
        app.logger.exception("Failed to retrieve account")
        return api_error("Unable to retrieve account.", 500)

    finally:
        close_database(mydb, mc)


# =========================================================
# ACCOUNT API — CREATE
# =========================================================

@app.route("/api/accounts", methods=["POST"])
def create_account():
    data = get_json_body()

    if data is None:
        return api_error("A valid JSON request body is required.")

    customer_id = valid_positive_id(data.get("customer_id"))

    if customer_id is None:
        return api_error("Select a valid customer.")

    account_code, error = validate_code(
        data.get("account_code"),
        "Account code"
    )

    if error:
        return api_error(error)

    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor()

        mc.execute("""
            SELECT customer_id
            FROM customers
            WHERE customer_id = %s;
        """, (customer_id,))

        if mc.fetchone() is None:
            return api_error("The selected customer does not exist.")

        mc.execute("""
            INSERT INTO accounts (
                customer_id,
                account_code
            )
            VALUES (%s, %s);
        """, (customer_id, account_code))

        account_id = mc.lastrowid
        mydb.commit()

        return jsonify({
            "success": True,
            "message": "Account created successfully.",
            "account": {
                "account_id": account_id,
                "customer_id": customer_id,
                "account_code": account_code
            }
        }), 201

    except Exception as exception:
        if mydb is not None and mydb.is_connected():
            mydb.rollback()

        return database_error_response(exception, "account")

    finally:
        close_database(mydb, mc)


# =========================================================
# ACCOUNT API — UPDATE
# =========================================================

@app.route("/api/accounts/<int:account_id>", methods=["PUT"])
def update_account(account_id):
    data = get_json_body()

    if data is None:
        return api_error("A valid JSON request body is required.")

    customer_id = valid_positive_id(data.get("customer_id"))

    if customer_id is None:
        return api_error("Select a valid customer.")

    account_code, error = validate_code(
        data.get("account_code"),
        "Account code"
    )

    if error:
        return api_error(error)

    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor()

        mc.execute("""
            SELECT account_id
            FROM accounts
            WHERE account_id = %s;
        """, (account_id,))

        if mc.fetchone() is None:
            return api_error("Account not found.", 404)

        mc.execute("""
            SELECT customer_id
            FROM customers
            WHERE customer_id = %s;
        """, (customer_id,))

        if mc.fetchone() is None:
            return api_error("The selected customer does not exist.")

        mc.execute("""
            UPDATE accounts
            SET customer_id = %s,
                account_code = %s
            WHERE account_id = %s;
        """, (customer_id, account_code, account_id))

        mydb.commit()

        return jsonify({
            "success": True,
            "message": "Account updated successfully.",
            "account_id": account_id,
            "customer_id": customer_id,
            "account_code": account_code
        })

    except Exception as exception:
        if mydb is not None and mydb.is_connected():
            mydb.rollback()

        return database_error_response(exception, "account")

    finally:
        close_database(mydb, mc)


# =========================================================
# ACCOUNT API — DELETE
# =========================================================

@app.route("/api/accounts/<int:account_id>", methods=["DELETE"])
def delete_account(account_id):
    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT account_id
            FROM accounts
            WHERE account_id = %s;
        """, (account_id,))

        if mc.fetchone() is None:
            return api_error("Account not found.", 404)

        mc.execute("""
            SELECT COUNT(*) AS total
            FROM transactions
            WHERE account_id = %s;
        """, (account_id,))

        transaction_count = mc.fetchone()["total"]

        if transaction_count > 0:
            return api_error(
                f"This account has {transaction_count} associated "
                "transaction(s). It cannot be deleted while those "
                "transactions exist.",
                409
            )

        mc.execute("""
            DELETE FROM accounts
            WHERE account_id = %s;
        """, (account_id,))

        mydb.commit()

        return jsonify({
            "success": True,
            "message": "Account deleted successfully."
        })

    except Exception as exception:
        if mydb is not None and mydb.is_connected():
            mydb.rollback()

        return database_error_response(exception, "account")

    finally:
        close_database(mydb, mc)


# =========================================================
# ALERT API — READ
# =========================================================

@app.route("/alerts", methods=["GET"])
def all_alerts():
    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT *
            FROM alerts
            ORDER BY created_at DESC;
        """)

        return jsonify(mc.fetchall())

    except Exception:
        app.logger.exception("Failed to retrieve alerts")
        return api_error("Unable to retrieve alerts.", 500)

    finally:
        close_database(mydb, mc)


# =========================================================
# ALERT API — DELETE
# =========================================================

@app.route("/api/alerts/<int:alert_id>", methods=["DELETE"])
def delete_alert(alert_id):
    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT alert_id, transaction_id
            FROM alerts
            WHERE alert_id = %s;
        """, (alert_id,))

        alert = mc.fetchone()

        if alert is None:
            return api_error("Alert not found.", 404)

        transaction_id = alert["transaction_id"]

        mc.execute("""
            DELETE FROM alerts
            WHERE alert_id = %s;
        """, (alert_id,))

        mydb.commit()

        return jsonify({
            "success": True,
            "message": "Alert deleted successfully.",
            "alert_id": alert_id,
            "transaction_id": transaction_id
        })

    except Exception:
        if mydb is not None and mydb.is_connected():
            mydb.rollback()

        app.logger.exception("Failed to delete alert")

        return api_error(
            "Unable to delete alert. Check the application logs.",
            500
        )

    finally:
        close_database(mydb, mc)


# =========================================================
# ALERT API — UPDATE REVIEW STATUS
# =========================================================

@app.route("/api/alerts/<int:alert_id>/status", methods=["PUT"])
def update_alert_status(alert_id):
    data = get_json_body()

    if data is None:
        return api_error("A valid JSON request body is required.")

    review_status = data.get("review_status")

    allowed_statuses = {
        "PENDING",
        "UNDER_REVIEW",
        "RESOLVED",
        "FALSE_POSITIVE"
    }

    if not isinstance(review_status, str):
        return api_error("Review status must be text.")

    review_status = review_status.strip().upper()

    if review_status not in allowed_statuses:
        return api_error(
            "Invalid review status. Choose PENDING, UNDER_REVIEW, "
            "RESOLVED, or FALSE_POSITIVE."
        )

    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT alert_id
            FROM alerts
            WHERE alert_id = %s;
        """, (alert_id,))

        if mc.fetchone() is None:
            return api_error("Alert not found.", 404)

        mc.execute("""
            UPDATE alerts
            SET review_status = %s
            WHERE alert_id = %s;
        """, (review_status, alert_id))

        mydb.commit()

        return jsonify({
            "success": True,
            "message": "Alert status updated successfully.",
            "alert_id": alert_id,
            "review_status": review_status
        })

    except Exception:
        if mydb is not None and mydb.is_connected():
            mydb.rollback()

        app.logger.exception("Failed to update alert status")

        return api_error(
            "Unable to update alert status. Check the application logs.",
            500
        )

    finally:
        close_database(mydb, mc)


# =========================================================
# DASHBOARD STATISTICS — CORRECTED
# =========================================================

@app.route("/api/dashboard-stats", methods=["GET"])
def dashboard_stats():
    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT COUNT(*) AS total
            FROM transactions;
        """)
        total_transactions = mc.fetchone()["total"]

        mc.execute("""
            SELECT COUNT(*) AS total
            FROM alerts;
        """)
        total_alerts = mc.fetchone()["total"]

        mc.execute("""
            SELECT COUNT(*) AS total
            FROM alerts
            WHERE review_status = 'PENDING';
        """)
        pending_alerts = mc.fetchone()["total"]

        mc.execute("""
            SELECT COUNT(*) AS total
            FROM (
                SELECT
                    transaction_id,
                    MAX(risk_score) AS risk_score
                FROM alerts
                GROUP BY transaction_id
                HAVING MAX(risk_score) >= 60
            ) AS high_risk;
        """)
        high_risk_transactions = mc.fetchone()["total"]

        mc.execute("""
            SELECT
                rule_name,
                COUNT(*) AS total
            FROM alerts
            GROUP BY rule_name
            ORDER BY total DESC;
        """)
        alerts_by_rule = mc.fetchall()

        mc.execute("""
            SELECT
                COALESCE(region, 'Unknown') AS region,
                COUNT(*) AS total
            FROM transactions
            GROUP BY region
            ORDER BY total DESC;
        """)
        transactions_by_region = mc.fetchall()

        # FIXED: Same expression in SELECT and GROUP BY.
        mc.execute("""
            SELECT
                DATE_FORMAT(
                    transaction_datetime,
                    '%Y-%m-%d'
                ) AS date,
                COUNT(*) AS total
            FROM transactions
            GROUP BY DATE_FORMAT(
                transaction_datetime,
                '%Y-%m-%d'
            )
            ORDER BY date ASC;
        """)
        transaction_trend = mc.fetchall()

        mc.execute("""
            SELECT
                review_status,
                COUNT(*) AS total
            FROM alerts
            GROUP BY review_status
            ORDER BY total DESC;
        """)
        alerts_by_status = mc.fetchall()

        mc.execute("""
            SELECT
                CASE
                    WHEN risk_score >= 80 THEN 'CRITICAL'
                    WHEN risk_score >= 60 THEN 'HIGH'
                    WHEN risk_score >= 30 THEN 'MEDIUM'
                    ELSE 'LOW'
                END AS risk_level,
                COUNT(*) AS total
            FROM (
                SELECT
                    transaction_id,
                    MAX(risk_score) AS risk_score
                FROM alerts
                GROUP BY transaction_id
            ) AS transaction_risks
            GROUP BY risk_level
            ORDER BY
                CASE risk_level
                    WHEN 'CRITICAL' THEN 1
                    WHEN 'HIGH' THEN 2
                    WHEN 'MEDIUM' THEN 3
                    WHEN 'LOW' THEN 4
                END;
        """)
        risk_distribution = mc.fetchall()

        return jsonify({
            "success": True,
            "total_transactions": total_transactions,
            "total_alerts": total_alerts,
            "pending_alerts": pending_alerts,
            "high_risk_transactions": high_risk_transactions,
            "alerts_by_rule": alerts_by_rule,
            "transactions_by_region": transactions_by_region,
            "transaction_trend": transaction_trend,
            "alerts_by_status": alerts_by_status,
            "risk_distribution": risk_distribution
        }), 200

    except Exception as e:
        app.logger.exception("Failed to retrieve dashboard statistics")

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

    finally:
        close_database(mydb, mc)


# =========================================================
# HEALTH CHECK
# =========================================================

@app.route("/api/health", methods=["GET"])
def health():
    mydb = None

    try:
        mydb = config.connect()

        return jsonify({
            "status": "healthy",
            "database": "connected"
        })

    except Exception:
        app.logger.exception("Health check failed")

        return jsonify({
            "status": "unhealthy",
            "error": "Database connection failed"
        }), 500

    finally:
        close_database(mydb, None)


# =========================================================
# AUTOMATIC RISK DETECTION FOR ONE ACCOUNT
# =========================================================

def detect_risk_for_account(account_id):
    """
    Evaluate all transactions belonging to one account
    and update their risk alerts.
    """

    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT
                transaction_id,
                account_id,
                transaction_datetime,
                amount,
                region
            FROM transactions
            WHERE account_id = %s
            ORDER BY transaction_datetime ASC, transaction_id ASC;
        """, (account_id,))

        transactions = mc.fetchall()
        previous_transactions = []

        for transaction in transactions:
            reasons = []
            score = 0

            current_datetime = transaction["transaction_datetime"]
            current_region = transaction["region"]

            if Decimal(str(transaction["amount"])) > Decimal("50000"):
                reasons.append("HIGH_AMOUNT")
                score += 40

            if previous_transactions:
                previous_region = previous_transactions[-1]["region"]

                if (
                    current_region
                    and previous_region
                    and current_region.strip().casefold()
                    != previous_region.strip().casefold()
                ):
                    reasons.append("REGION_CHANGE")
                    score += 25

            recent_count = 0

            for previous in reversed(previous_transactions):
                elapsed = (
                    current_datetime - previous["transaction_datetime"]
                ).total_seconds()

                if elapsed > 600:
                    break

                if elapsed >= 0:
                    recent_count += 1

            if recent_count >= 5:
                reasons.append("HIGH_FREQUENCY")
                score += 35

            score = min(score, 100)

            if score >= 80:
                risk_level = "CRITICAL"
            elif score >= 60:
                risk_level = "HIGH"
            elif score >= 30:
                risk_level = "MEDIUM"
            else:
                risk_level = "LOW"

            for reason in reasons:
                explanation = (
                    f"Rule triggered: {reason}. "
                    f"Overall transaction risk score: {score}/100. "
                    f"Risk level: {risk_level}."
                )

                mc.execute("""
                    INSERT INTO alerts (
                        transaction_id,
                        rule_name,
                        risk_score,
                        explanation,
                        review_status
                    )
                    VALUES (%s, %s, %s, %s, 'PENDING')
                    ON DUPLICATE KEY UPDATE
                        risk_score = VALUES(risk_score),
                        explanation = VALUES(explanation);
                """, (
                    transaction["transaction_id"],
                    reason,
                    score,
                    explanation
                ))

            previous_transactions.append(transaction)

        mydb.commit()

        return True

    except Exception:
        if mydb is not None and mydb.is_connected():
            mydb.rollback()

        app.logger.exception(
            "Automatic risk detection failed for account %s",
            account_id
        )

        return False

    finally:
        close_database(mydb, mc)


# =========================================================
# MANUAL RISK DETECTION — ALL TRANSACTIONS
# =========================================================

@app.route("/api/detect", methods=["POST"])
def detect_risk():
    mydb = None
    mc = None

    try:
        mydb = config.connect()
        mc = mydb.cursor(dictionary=True)

        mc.execute("""
            SELECT
                transaction_id,
                account_id,
                transaction_datetime,
                amount,
                transaction_type,
                channel,
                region
            FROM transactions
            ORDER BY
                account_id ASC,
                transaction_datetime ASC,
                transaction_id ASC;
        """)

        transactions = mc.fetchall()

        account_transactions = {}

        for transaction in transactions:
            account_id = transaction["account_id"]

            account_transactions.setdefault(account_id, []).append(
                transaction
            )

        transactions_evaluated = 0
        alert_operations_processed = 0
        rules_triggered = 0

        for account_records in account_transactions.values():
            previous_transactions = []

            for transaction in account_records:
                transactions_evaluated += 1

                reasons = []
                score = 0

                current_datetime = transaction["transaction_datetime"]
                current_region = transaction["region"]

                amount = Decimal(str(transaction["amount"]))

                if amount > Decimal("50000"):
                    reasons.append("HIGH_AMOUNT")
                    score += 40

                if previous_transactions:
                    previous_region = previous_transactions[-1]["region"]

                    if (
                        current_region
                        and previous_region
                        and current_region.strip().casefold()
                        != previous_region.strip().casefold()
                    ):
                        reasons.append("REGION_CHANGE")
                        score += 25

                recent_count = 0

                for previous in reversed(previous_transactions):
                    elapsed_seconds = (
                        current_datetime
                        - previous["transaction_datetime"]
                    ).total_seconds()

                    if elapsed_seconds > 600:
                        break

                    if elapsed_seconds >= 0:
                        recent_count += 1

                if recent_count >= 5:
                    reasons.append("HIGH_FREQUENCY")
                    score += 35

                score = min(score, 100)

                if score >= 80:
                    risk_level = "CRITICAL"
                elif score >= 60:
                    risk_level = "HIGH"
                elif score >= 30:
                    risk_level = "MEDIUM"
                else:
                    risk_level = "LOW"

                for reason in reasons:
                    explanation = (
                        f"Rule triggered: {reason}. "
                        f"Overall transaction risk score: {score}/100. "
                        f"Risk level: {risk_level}."
                    )

                    mc.execute("""
                        INSERT INTO alerts (
                            transaction_id,
                            rule_name,
                            risk_score,
                            explanation,
                            review_status
                        )
                        VALUES (%s, %s, %s, %s, 'PENDING')
                        ON DUPLICATE KEY UPDATE
                            risk_score = VALUES(risk_score),
                            explanation = VALUES(explanation);
                    """, (
                        transaction["transaction_id"],
                        reason,
                        score,
                        explanation
                    ))

                    alert_operations_processed += 1
                    rules_triggered += 1

                previous_transactions.append(transaction)

        mydb.commit()

        return jsonify({
            "success": True,
            "message": "Risk detection completed successfully.",
            "transactions_evaluated": transactions_evaluated,
            "alert_operations_processed": alert_operations_processed,
            "rules_triggered": rules_triggered,
            "risk_rules": [
                "HIGH_AMOUNT",
                "REGION_CHANGE",
                "HIGH_FREQUENCY"
            ],
            "note": (
                "Risk scores represent the combined score of "
                "the rules triggered for each transaction. "
                "Existing alert review statuses are preserved. "
                "Alerts indicate transactions for manual review "
                "and do not confirm fraud."
            )
        })

    except Exception:
        if mydb is not None and mydb.is_connected():
            mydb.rollback()

        app.logger.exception("Risk detection failed")

        return api_error(
            "Risk detection failed. Check the application logs.",
            500
        )

    finally:
        close_database(mydb, mc)


# =========================================================
# APPLICATION ENTRY POINT
# =========================================================

if __name__ == "__main__":
    app.run(debug=True)