"use strict";

document.addEventListener("DOMContentLoaded", function () {

    const notice = document.getElementById("analyticsNotice");
    const refreshButton = document.getElementById("refreshAnalytics");

    let trendChart = null;
    let ruleChart = null;
    let regionChart = null;
    let riskChart = null;

    // -------------------- COLORS --------------------

    const chartColors = [
        "#252833",
        "#626979",
        "#969dac",
        "#c5cad3"
    ];

    // -------------------- NOTIFICATIONS --------------------

    function showNotice(message, isError = false) {

        if (!notice) return;

        notice.textContent = message;
        notice.classList.remove("hidden", "error");

        if (isError) {
            notice.classList.add("error");
        }
    }

    // -------------------- REFRESH BUTTON --------------------

    function setButtonLoading(loading) {

        if (!refreshButton) return;

        refreshButton.disabled = loading;

        if (loading) {

            refreshButton.innerHTML = `
                <i data-lucide="loader-circle"></i>
                <span>Refreshing...</span>
            `;

        } else {

            refreshButton.innerHTML = `
                <i data-lucide="refresh-cw"></i>
                <span>Refresh Analytics</span>
            `;

        }

        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // -------------------- UPDATE STATISTICS --------------------

    function updateStatistics(data) {

        document.getElementById("analyticsTransactions").textContent =
            Number(data.total_transactions || 0).toLocaleString("en-IN");

        document.getElementById("analyticsAlerts").textContent =
            Number(data.total_alerts || 0).toLocaleString("en-IN");

        document.getElementById("analyticsHighRisk").textContent =
            Number(data.high_risk_transactions || 0).toLocaleString("en-IN");

        document.getElementById("analyticsPending").textContent =
            Number(data.pending_alerts || 0).toLocaleString("en-IN");
    }

    // -------------------- DESTROY OLD CHARTS --------------------

    function destroyCharts() {

        [trendChart, ruleChart, regionChart, riskChart]
            .forEach(chart => {
                if (chart) {
                    chart.destroy();
                }
            });

        trendChart = null;
        ruleChart = null;
        regionChart = null;
        riskChart = null;
    }

    // -------------------- COMMON CHART OPTIONS --------------------

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
            legend: {
                labels: {
                    usePointStyle: true,
                    padding: 18,
                    font: {
                        family: "Manrope"
                    }
                }
            }
        }
    };

    // -------------------- 1. TRANSACTION TREND --------------------

    function renderTrendChart(rows) {

        const canvas = document.getElementById("analyticsTrendChart");

        trendChart = new Chart(canvas, {

            type: "line",

            data: {
                labels: rows.map(item => item.date),

                datasets: [{
                    label: "Transactions",
                    data: rows.map(item => Number(item.total || 0)),

                    borderColor: "#252833",
                    backgroundColor: "rgba(37, 40, 51, 0.08)",

                    fill: true,
                    tension: 0.35,
                    borderWidth: 2,

                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },

            options: {
                ...commonOptions,

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

    // -------------------- 2. ALERTS BY RULE --------------------

    function renderRuleChart(rows) {

        const canvas = document.getElementById("analyticsRuleChart");

        ruleChart = new Chart(canvas, {

            type: "doughnut",

            data: {
                labels: rows.map(item => item.rule_name),

                datasets: [{
                    label: "Alerts",

                    data: rows.map(item => Number(item.total || 0)),

                    backgroundColor: chartColors,
                    borderWidth: 0,
                    hoverOffset: 6
                }]
            },

            options: {
                ...commonOptions,

                cutout: "68%",

                plugins: {
                    legend: {
                        position: "bottom"
                    }
                }
            }
        });
    }

    // -------------------- 3. TRANSACTIONS BY REGION --------------------

    function renderRegionChart(rows) {

        const canvas = document.getElementById("analyticsRegionChart");

        regionChart = new Chart(canvas, {

            type: "bar",

            data: {
                labels: rows.map(item => item.region || "Unknown"),

                datasets: [{
                    label: "Transactions",

                    data: rows.map(item => Number(item.total || 0)),

                    backgroundColor: "#30333d",
                    borderRadius: 5,
                    maxBarThickness: 45
                }]
            },

            options: {
                ...commonOptions,

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

    // -------------------- 4. RISK DISTRIBUTION --------------------

    function renderRiskChart(rows) {

        const canvas = document.getElementById("analyticsRiskChart");

        const riskLabels = [
            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL"
        ];

        const riskValues = riskLabels.map(level => {

            const item = rows.find(
                record => record.risk_level === level
            );

            return item ? Number(item.total || 0) : 0;
        });

        riskChart = new Chart(canvas, {

            type: "doughnut",

            data: {
                labels: riskLabels,

                datasets: [{
                    label: "Transactions",

                    data: riskValues,

                    backgroundColor: [
                        "#c5cad3",
                        "#969dac",
                        "#626979",
                        "#252833"
                    ],

                    borderWidth: 0,
                    hoverOffset: 6
                }]
            },

            options: {
                ...commonOptions,

                cutout: "68%",

                plugins: {
                    legend: {
                        position: "bottom"
                    },

                    tooltip: {
                        callbacks: {
                            label: function (context) {

                                return context.label + ": " +
                                    context.raw + " transactions";
                            }
                        }
                    }
                }
            }
        });
    }

    // -------------------- LOAD ANALYTICS --------------------

    async function loadAnalytics() {

        setButtonLoading(true);

        if (notice) {
            notice.classList.add("hidden");
        }

        try {

            const response = await fetch("/api/dashboard-stats", {
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error("Failed to load analytics data.");
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error("Analytics API returned an unsuccessful response.");
            }

            console.log("Analytics API response:", data);

            // Update statistics
            updateStatistics(data);

            // Check Chart.js
            if (typeof Chart === "undefined") {
                throw new Error("Chart.js is not loaded. Check base.html.");
            }

            // Remove previous charts
            destroyCharts();

            // Render all four charts
            renderTrendChart(data.transaction_trend || []);

            renderRuleChart(data.alerts_by_rule || []);

            renderRegionChart(data.transactions_by_region || []);

            renderRiskChart(data.risk_distribution || []);

            if (window.lucide) {
                window.lucide.createIcons();
            }

            console.log("Analytics dashboard updated successfully.");

            return true;

        } catch (error) {

            console.error("Analytics loading error:", error);

            showNotice(
                "Unable to refresh analytics: " + error.message,
                true
            );

            return false;

        } finally {

            setButtonLoading(false);
        }
    }

    // -------------------- REFRESH BUTTON EVENT --------------------

    if (refreshButton) {

        refreshButton.addEventListener("click", function () {
            loadAnalytics();
        });
    }

    // -------------------- INITIAL LOAD --------------------

    loadAnalytics();

});