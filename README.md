# Financial Risk Analysis and Rule-Based Fraud Detection System

## Overview

A Python-based financial transaction monitoring project using Flask, MySQL, Pandas, NumPy, and Matplotlib.

The system evaluates synthetic transactions against configurable rules and generates risk alerts for manual review.

Alerts indicate rule matches and do not confirm fraud.

## Features

* Synthetic financial transaction data
* MySQL relational database
* Flask REST API
* Rule-based risk scoring
* High-amount detection
* High-frequency detection
* Region-change detection
* Alert review workflow
* Audit logs
* Statistical analysis and charts
* CSV reports
* Automated tests

## Run the project

Install dependencies:

```bash
python -m pip install -r requirements.txt
```

Create the database by executing `database/schema.sql` in MySQL Workbench.

Configure database credentials in `.env`.

Insert sample data:

```bash
python seed_data.py
```

Start the application:

```bash
python app.py
```

Run risk detection by sending `POST /api/detect`.

Generate reports:

```bash
python analysis.py
```

Run tests:

```bash
python -m pytest -v
```

## API endpoints

* `GET /`
* `GET /api/health`
* `GET /api/transactions`
* `GET /api/alerts`
* `POST /api/detect`
* `PATCH /api/alerts/<alert_id>/review`
* `GET /api/reports/summary`

## Limitations

The rules are demonstration logic, not a validated fraud model.

Thresholds can produce false positives and false negatives.

Only synthetic data is used.

The application is intended for educational purposes.
