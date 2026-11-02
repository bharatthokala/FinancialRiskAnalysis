document.addEventListener("DOMContentLoaded", function () {
    const tableBody = document.getElementById("alertsTableBody");
    const refreshButton = document.getElementById("refreshAlertsButton");
    const notice = document.getElementById("alertsNotice");

    const searchInput = document.getElementById("alertSearchInput");
    const statusFilter = document.getElementById("alertStatusFilter");
    const riskFilter = document.getElementById("alertRiskFilter");
    const startDateInput = document.getElementById("alertStartDate");
    const endDateInput = document.getElementById("alertEndDate");
    const sortSelect = document.getElementById("alertSortOrder");
    const resetButton = document.getElementById("resetAlertFiltersButton");
    const resultsCount = document.getElementById("alertResultsCount");

    if (!tableBody || !refreshButton || !notice) {
        console.error("Risk Alerts page is missing required HTML elements.");
        return;
    }

    const allowedStatuses = [
        "PENDING",
        "UNDER_REVIEW",
        "RESOLVED",
        "FALSE_POSITIVE"
    ];

    let latestAlerts = [];
    let savingAlertIds = new Set();
    let deletingAlertIds = new Set();
    let isLoading = false;

    function escapeHTML(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function showNotice(message, isError = false) {
        notice.textContent = message;
        notice.classList.remove("hidden", "error");

        if (isError) {
            notice.classList.add("error");
        }
    }

    function riskLevel(score) {
        if (score >= 80) return "CRITICAL";
        if (score >= 60) return "HIGH";
        if (score >= 30) return "MEDIUM";
        return "LOW";
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(String(value).replace(" ", "T"));

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return date.toLocaleString("en-IN");
    }

    function getAlertDate(alert) {
        if (!alert.created_at) return null;

        const date = new Date(
            String(alert.created_at).replace(" ", "T")
        );

        return Number.isNaN(date.getTime()) ? null : date;
    }

    function updateStatistics(alerts) {
        const totalElement = document.getElementById("alertsTotal");
        const pendingElement = document.getElementById("alertsPending");
        const highRiskElement = document.getElementById("alertsHighRisk");
        const reviewedElement = document.getElementById("alertsReviewed");

        const pendingCount = alerts.filter(function (alert) {
            return String(alert.review_status || "PENDING").toUpperCase()
                === "PENDING";
        }).length;

        const highRiskCount = alerts.filter(function (alert) {
            return Number(alert.risk_score || 0) >= 60;
        }).length;

        const reviewedCount = alerts.length - pendingCount;

        if (totalElement) totalElement.textContent = alerts.length;
        if (pendingElement) pendingElement.textContent = pendingCount;
        if (highRiskElement) highRiskElement.textContent = highRiskCount;
        if (reviewedElement) reviewedElement.textContent = reviewedCount;
    }

    function getFilteredAlerts() {
        const searchTerm = searchInput
            ? searchInput.value.trim().toLowerCase()
            : "";

        const selectedStatus = statusFilter ? statusFilter.value : "";
        const selectedRisk = riskFilter ? riskFilter.value : "";
        const startDate = startDateInput ? startDateInput.value : "";
        const endDate = endDateInput ? endDateInput.value : "";
        const sortOrder = sortSelect ? sortSelect.value : "newest";

        let filtered = latestAlerts.filter(function (alert) {
            const alertId = String(alert.alert_id ?? "").toLowerCase();
            const transactionId = String(
                alert.transaction_id ?? ""
            ).toLowerCase();

            const normalizedSearch = searchTerm.replace(/^#/, "");

            if (
                searchTerm &&
                !alertId.includes(normalizedSearch) &&
                !transactionId.includes(normalizedSearch)
            ) {
                return false;
            }

            const status = String(
                alert.review_status || "PENDING"
            ).toUpperCase();

            if (selectedStatus && status !== selectedStatus) {
                return false;
            }

            const level = riskLevel(Number(alert.risk_score || 0));

            if (selectedRisk && level !== selectedRisk) {
                return false;
            }

            const date = getAlertDate(alert);

            if (startDate || endDate) {
                if (!date) return false;

                const alertDay =
                    date.getFullYear() + "-" +
                    String(date.getMonth() + 1).padStart(2, "0") + "-" +
                    String(date.getDate()).padStart(2, "0");

                if (startDate && alertDay < startDate) return false;
                if (endDate && alertDay > endDate) return false;
            }

            return true;
        });

        filtered.sort(function (a, b) {
            const dateA = getAlertDate(a);
            const dateB = getAlertDate(b);

            const timeA = dateA ? dateA.getTime() : 0;
            const timeB = dateB ? dateB.getTime() : 0;

            const scoreA = Number(a.risk_score || 0);
            const scoreB = Number(b.risk_score || 0);

            switch (sortOrder) {
                case "oldest":
                    return timeA - timeB;

                case "risk_high":
                    return scoreB - scoreA || timeB - timeA;

                case "risk_low":
                    return scoreA - scoreB || timeB - timeA;

                default:
                    return timeB - timeA;
            }
        });

        return filtered;
    }

    function renderAlerts() {
        const filteredAlerts = getFilteredAlerts();

        if (resultsCount) {
            resultsCount.textContent =
                "Showing " + filteredAlerts.length +
                " of " + latestAlerts.length + " alerts";
        }

        if (filteredAlerts.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="empty-cell">
                        No alerts match your search or filters.
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filteredAlerts.map(function (alert) {
            const score = Number(alert.risk_score || 0);
            const level = riskLevel(score);

            const status = String(
                alert.review_status || "PENDING"
            ).toUpperCase();

            const alertId = Number(alert.alert_id);
            const transactionId = alert.transaction_id;

            const options = allowedStatuses.map(function (option) {
                return `
                    <option value="${option}"
                        ${status === option ? "selected" : ""}>
                        ${option.replace(/_/g, " ")}
                    </option>
                `;
            }).join("");

            const isSaving = savingAlertIds.has(alertId);
            const isDeleting = deletingAlertIds.has(alertId);

            return `
                <tr>
                    <td>#${escapeHTML(alert.alert_id)}</td>

                    <td>#${escapeHTML(transactionId)}</td>

                    <td>${escapeHTML(alert.rule_name || "—")}</td>

                    <td><strong>${score}</strong>/100</td>

                    <td>
                        <span class="risk-badge risk-${level.toLowerCase()}">
                            ${level}
                        </span>
                    </td>

                    <td>
                        <select
                            class="alert-status-select"
                            data-alert-id="${escapeHTML(alertId)}"
                            aria-label="Review status for alert ${escapeHTML(alertId)}"
                            ${isSaving || isDeleting ? "disabled" : ""}
                        >
                            ${options}
                        </select>
                    </td>

                    <td>
                        ${escapeHTML(
                            alert.explanation || "No explanation provided"
                        )}
                    </td>

                    <td>${escapeHTML(formatDate(alert.created_at))}</td>

                    <td>
                        <button
                            type="button"
                            class="alert-delete-button"
                            data-alert-id="${escapeHTML(alertId)}"
                            ${isDeleting || isSaving ? "disabled" : ""}
                            aria-label="Delete alert ${escapeHTML(alertId)}"
                        >
                            <i data-lucide="trash-2"></i>
                            ${isDeleting ? "Deleting..." : "Delete"}
                        </button>
                    </td>
                </tr>
            `;
        }).join("");

        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    async function loadAlerts() {
        if (isLoading) return;

        isLoading = true;
        refreshButton.disabled = true;

        const originalButtonHTML = refreshButton.innerHTML;
        refreshButton.textContent = "Loading...";

        try {
            const response = await fetch("/alerts", {
                headers: {
                    "Accept": "application/json"
                }
            });

            const alerts = await response.json();

            if (!response.ok) {
                throw new Error(
                    alerts.error || "Unable to retrieve alerts."
                );
            }

            if (!Array.isArray(alerts)) {
                throw new Error(
                    "The server returned an unexpected response."
                );
            }

            latestAlerts = alerts;

            updateStatistics(latestAlerts);
            renderAlerts();

            showNotice(
                "Successfully loaded " + latestAlerts.length +
                " alert records."
            );

        } catch (error) {
            console.error("Alerts loading error:", error);

            showNotice(
                error.message || "Unable to load alerts.",
                true
            );

        } finally {
            isLoading = false;
            refreshButton.disabled = false;
            refreshButton.innerHTML = originalButtonHTML;

            if (window.lucide) {
                window.lucide.createIcons();
            }
        }
    }

    async function updateAlertStatus(alertId, newStatus, selectElement) {
        const alert = latestAlerts.find(function (item) {
            return Number(item.alert_id) === alertId;
        });

        if (!alert) {
            showNotice("Alert not found in the current list.", true);
            await loadAlerts();
            return;
        }

        const previousStatus = String(
            alert.review_status || "PENDING"
        ).toUpperCase();

        if (!allowedStatuses.includes(newStatus)) {
            showNotice("Invalid review status.", true);
            renderAlerts();
            return;
        }

        if (newStatus === previousStatus) return;
        if (savingAlertIds.has(alertId)) return;

        savingAlertIds.add(alertId);
        selectElement.disabled = true;

        try {
            const response = await fetch(
                "/api/alerts/" + encodeURIComponent(alertId) + "/status",
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({
                        review_status: newStatus
                    })
                }
            );

            const result = await response.json();

            if (!response.ok || result.success !== true) {
                throw new Error(
                    result.error || "Unable to update alert status."
                );
            }

            alert.review_status = result.review_status;

            updateStatistics(latestAlerts);
            renderAlerts();

            showNotice(
                "Alert #" + alertId + " status updated to " +
                result.review_status.replace(/_/g, " ") + "."
            );

        } catch (error) {
            console.error("Alert status update error:", error);

            showNotice(
                error.message || "Unable to update alert status.",
                true
            );

        } finally {
            savingAlertIds.delete(alertId);
            await loadAlerts();
        }
    }

    async function deleteAlert(alertId) {
        if (deletingAlertIds.has(alertId)) return;

        const alert = latestAlerts.find(function (item) {
            return Number(item.alert_id) === alertId;
        });

        if (!alert) {
            showNotice("Alert not found.", true);
            return;
        }

        const confirmed = window.confirm(
            "Are you sure you want to permanently delete Alert #" +
            alertId + "?\n\n" +
            "This will permanently remove this alert record. " +
            "The associated transaction will not be deleted."
        );

        if (!confirmed) return;

        deletingAlertIds.add(alertId);
        renderAlerts();

        try {
            const response = await fetch(
                "/api/alerts/" + encodeURIComponent(alertId),
                {
                    method: "DELETE",
                    headers: {
                        "Accept": "application/json"
                    }
                }
            );

            const result = await response.json();

            if (!response.ok || result.success !== true) {
                throw new Error(
                    result.error || "Unable to delete alert."
                );
            }

            latestAlerts = latestAlerts.filter(function (item) {
                return Number(item.alert_id) !== alertId;
            });

            updateStatistics(latestAlerts);
            renderAlerts();

            showNotice(
                "Alert #" + alertId + " deleted successfully."
            );

        } catch (error) {
            console.error("Alert deletion error:", error);

            showNotice(
                error.message || "Unable to delete alert.",
                true
            );

            await loadAlerts();

        } finally {
            deletingAlertIds.delete(alertId);
        }
    }

    // Handle status changes.
    tableBody.addEventListener("change", function (event) {
        const selectElement = event.target.closest(".alert-status-select");

        if (!selectElement) return;

        const alertId = Number(selectElement.dataset.alertId);
        const newStatus = selectElement.value;

        if (!Number.isSafeInteger(alertId) || alertId <= 0) {
            showNotice("Invalid alert ID.", true);
            return;
        }

        updateAlertStatus(alertId, newStatus, selectElement);
    });

    // Handle alert deletion.
    tableBody.addEventListener("click", function (event) {
        const deleteButton = event.target.closest(".alert-delete-button");

        if (!deleteButton) return;

        const alertId = Number(deleteButton.dataset.alertId);

        if (!Number.isSafeInteger(alertId) || alertId <= 0) {
            showNotice("Invalid alert ID.", true);
            return;
        }

        deleteAlert(alertId);
    });

    // Search.
    if (searchInput) {
        searchInput.addEventListener("input", renderAlerts);
    }

    // Filters and sorting.
    [
        statusFilter,
        riskFilter,
        startDateInput,
        endDateInput,
        sortSelect
    ].forEach(function (element) {
        if (element) {
            element.addEventListener("change", renderAlerts);
        }
    });

    // Reset filters.
    if (resetButton) {
        resetButton.addEventListener("click", function () {
            if (searchInput) searchInput.value = "";
            if (statusFilter) statusFilter.value = "";
            if (riskFilter) riskFilter.value = "";
            if (startDateInput) startDateInput.value = "";
            if (endDateInput) endDateInput.value = "";
            if (sortSelect) sortSelect.value = "newest";

            renderAlerts();
            showNotice("All alert filters have been reset.");
        });
    }

    // Validate date range.
    if (startDateInput && endDateInput) {
        startDateInput.addEventListener("change", function () {
            endDateInput.min = startDateInput.value || "";

            if (
                endDateInput.value &&
                startDateInput.value &&
                endDateInput.value < startDateInput.value
            ) {
                endDateInput.value = "";
            }

            renderAlerts();
        });

        endDateInput.addEventListener("change", function () {
            startDateInput.max = endDateInput.value || "";

            if (
                startDateInput.value &&
                endDateInput.value &&
                startDateInput.value > endDateInput.value
            ) {
                startDateInput.value = "";
            }

            renderAlerts();
        });
    }

    refreshButton.addEventListener("click", loadAlerts);

    loadAlerts();
});