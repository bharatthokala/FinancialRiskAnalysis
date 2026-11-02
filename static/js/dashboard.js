"use strict";

// -------------------- CHART INSTANCES --------------------

let trendChartInstance = null;
let ruleChartInstance = null;
let regionChartInstance = null;


// -------------------- UTILITY FUNCTIONS --------------------

const money = (value) =>
    new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(value || 0));


function showNotice(message, isError = false) {
    const notice = document.getElementById("notice");

    if (!notice) {
        console.log(message);
        return;
    }

    notice.textContent = message;
    notice.classList.remove("hidden", "error");

    if (isError) {
        notice.classList.add("error");
    }
}


function escapeHTML(value) {
    const replacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    };

    return String(value ?? "").replace(
        /[&<>"']/g,
        (character) => replacements[character]
    );
}


// -------------------- LOAD DASHBOARD --------------------

async function loadDashboard() {
    try {
        const [statsResponse, transactionsResponse] = await Promise.all([
            fetch("/api/dashboard-stats"),
            fetch("/transactions")
        ]);

        if (!statsResponse.ok || !transactionsResponse.ok) {
            throw new Error(
                "The server could not load dashboard data."
            );
        }

        const stats = await statsResponse.json();
        const transactions = await transactionsResponse.json();

        // Update dashboard statistics
        const totalTransactions = document.getElementById(
            "totalTransactions"
        );

        const totalAlerts = document.getElementById("totalAlerts");

        const highRiskTransactions = document.getElementById(
            "highRiskTransactions"
        );

        const pendingAlerts = document.getElementById("pendingAlerts");

        if (totalTransactions) {
            totalTransactions.textContent =
                Number(stats.total_transactions || 0).toLocaleString("en-IN");
        }

        if (totalAlerts) {
            totalAlerts.textContent =
                Number(stats.total_alerts || 0).toLocaleString("en-IN");
        }

        if (highRiskTransactions) {
            highRiskTransactions.textContent =
                Number(stats.high_risk_transactions || 0)
                    .toLocaleString("en-IN");
        }

        if (pendingAlerts) {
            pendingAlerts.textContent =
                Number(stats.pending_alerts || 0).toLocaleString("en-IN");
        }

        // Render dashboard charts and table
        renderTrendChart(stats.transaction_trend || []);
        renderRuleChart(stats.alerts_by_rule || []);
        renderRegionChart(stats.transactions_by_region || []);
        renderRecentTransactions(transactions);

    } catch (error) {
        console.error("Dashboard loading error:", error);

        showNotice(
            "Unable to load dashboard data. Check that Flask and MySQL are running.",
            true
        );
    }
}


// -------------------- RECENT TRANSACTIONS --------------------

function renderRecentTransactions(transactions) {
    const tbody = document.getElementById("recentTransactions");

    if (!tbody) {
        console.warn(
            'Dashboard element "recentTransactions" was not found.'
        );
        return;
    }

    const recent = [...transactions]
        .sort((a, b) => {
            const dateA = new Date(a.transaction_datetime).getTime();
            const dateB = new Date(b.transaction_datetime).getTime();

            return (Number.isNaN(dateB) ? 0 : dateB) -
                   (Number.isNaN(dateA) ? 0 : dateA);
        })
        .slice(0, 6);

    if (recent.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-cell">
                    No transactions found.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = recent.map((transaction) => `
        <tr>
            <td class="table-id">
                #${escapeHTML(transaction.transaction_id)}
            </td>
            <td>${escapeHTML(transaction.account_id)}</td>
            <td class="amount-cell">
                ${money(transaction.amount)}
            </td>
            <td>${escapeHTML(transaction.region)}</td>
            <td>${escapeHTML(transaction.channel)}</td>
            <td class="muted-text">
                ${escapeHTML(transaction.transaction_datetime)}
            </td>
        </tr>
    `).join("");
}


// -------------------- TRANSACTION TREND CHART --------------------

function renderTrendChart(rows) {
    const canvas = document.getElementById("trendChart");

    if (!canvas) {
        console.warn('Canvas element "trendChart" was not found.');
        return;
    }

    if (typeof Chart === "undefined") {
        console.error("Chart.js has not loaded.");
        showNotice("Charts could not load. Check the Chart.js script.", true);
        return;
    }

    if (trendChartInstance) {
        trendChartInstance.destroy();
    }

    trendChartInstance = new Chart(canvas, {
        type: "line",

        data: {
            labels: rows.map((row) =>
                row.date ? String(row.date).slice(0, 10) : "Unknown"
            ),

            datasets: [{
                label: "Transactions",
                data: rows.map((row) => Number(row.total || 0)),
                borderColor: "#252833",
                backgroundColor: "rgba(37, 40, 51, 0.08)",
                fill: true,
                tension: 0.35,
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: false
                }
            },

            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    },
                    grid: {
                        color: "#f0f1f4"
                    }
                },

                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}


// -------------------- ALERT RULE CHART --------------------

function renderRuleChart(rows) {
    const canvas = document.getElementById("ruleChart");

    if (!canvas) {
        console.warn('Canvas element "ruleChart" was not found.');
        return;
    }

    if (typeof Chart === "undefined") {
        console.error("Chart.js has not loaded.");
        return;
    }

    if (ruleChartInstance) {
        ruleChartInstance.destroy();
    }

    ruleChartInstance = new Chart(canvas, {
        type: "doughnut",

        data: {
            labels: rows.map((row) => row.rule_name),

            datasets: [{
                data: rows.map((row) => Number(row.total || 0)),
                backgroundColor: [
                    "#252833",
                    "#777f91",
                    "#b8bec9",
                    "#dce0e6"
                ],
                borderWidth: 0,
                hoverOffset: 5
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "70%",

            plugins: {
                legend: {
                    position: "bottom",

                    labels: {
                        usePointStyle: true,
                        padding: 18,
                        font: {
                            family: "Manrope",
                            size: 10
                        }
                    }
                }
            }
        }
    });
}


// -------------------- TRANSACTIONS BY REGION CHART --------------------

function renderRegionChart(rows) {
    const canvas = document.getElementById("regionChart");

    if (!canvas) {
        console.warn('Canvas element "regionChart" was not found.');
        return;
    }

    if (typeof Chart === "undefined") {
        console.error("Chart.js has not loaded.");
        return;
    }

    if (regionChartInstance) {
        regionChartInstance.destroy();
    }

    regionChartInstance = new Chart(canvas, {
        type: "bar",

        data: {
            labels: rows.map((row) => row.region || "Unknown"),

            datasets: [{
                label: "Transactions",
                data: rows.map((row) => Number(row.total || 0)),
                backgroundColor: "#30333d",
                borderRadius: 5,
                maxBarThickness: 42
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: false
                }
            },

            scales: {
                y: {
                    beginAtZero: true,

                    ticks: {
                        precision: 0
                    },

                    grid: {
                        color: "#f0f1f4"
                    }
                },

                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}


// -------------------- RISK DETECTION BUTTON --------------------

function setupDetectionButton() {
    const button = document.getElementById("detectButton");

    if (!button) {
        console.warn('Button element "detectButton" was not found.');
        return;
    }

    button.addEventListener("click", async function () {
        const originalContent = button.innerHTML;

        button.disabled = true;
        button.textContent = "Running detection...";

        try {
            const response = await fetch("/api/detect", {
                method: "POST"
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error || "Risk detection failed."
                );
            }

            showNotice(
                `${result.message}. ` +
                `Evaluated ${result.transactions_evaluated} transactions ` +
                `and processed ${result.alert_records_processed} alert records. ` +
                `${result.note}`
            );

            await loadDashboard();

        } catch (error) {
            console.error("Risk detection error:", error);
            showNotice(error.message, true);

        } finally {
            button.disabled = false;
            button.innerHTML = originalContent;

            if (window.lucide) {
                window.lucide.createIcons();
            }
        }
    });
}


// -------------------- INITIALIZE DASHBOARD --------------------

document.addEventListener("DOMContentLoaded", () => {
    setupDetectionButton();
    loadDashboard();
});
