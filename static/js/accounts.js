document.addEventListener("DOMContentLoaded", function () {
    "use strict";

    // ==========================================
    // DOM ELEMENTS
    // ==========================================

    const body = document.getElementById("accountsTableBody");
    const notice = document.getElementById("accountsNotice");
    const refreshButton = document.getElementById("refreshAccounts");

    const totalElement = document.getElementById("accountsTotal");
    const customerTotalElement =
        document.getElementById("accountsCustomerTotal");
    const transactionsTotalElement =
        document.getElementById("accountsWithTransactions");

    const formPanel = document.getElementById("accountFormPanel");
    const form = document.getElementById("accountForm");
    const accountIdInput = document.getElementById("accountId");
    const accountCodeInput = document.getElementById("accountCode");
    const customerSelect = document.getElementById("accountCustomer");

    const addButton = document.getElementById("addAccountButton");
    const saveButton = document.getElementById("saveAccountButton");
    const cancelButton = document.getElementById("cancelAccountForm");
    const closeFormButton = document.getElementById("closeAccountForm");

    const searchInput = document.getElementById("accountSearch");
    const clearSearchButton =
        document.getElementById("clearAccountSearch");

    const resultCountElement =
        document.getElementById("accountResultCount");
    const tableSummaryElement =
        document.getElementById("accountTableSummary");
    const tableTopButton =
        document.getElementById("accountTableTop");

    const deleteDialog =
        document.getElementById("deleteAccountDialog");
    const deleteTitle =
        document.getElementById("deleteAccountTitle");
    const deleteDescription =
        document.getElementById("deleteAccountDescription");
    const confirmDeleteButton =
        document.getElementById("confirmDeleteAccount");
    const cancelDeleteButton =
        document.getElementById("cancelDeleteAccount");
    const closeDeleteDialogButton =
        document.getElementById("closeDeleteAccountDialog");

    // ==========================================
    // APPLICATION STATE
    // ==========================================

    let allAccounts = [];
    let allCustomers = [];
    let accountToDelete = null;
    let isSaving = false;
    let isDeleting = false;

    if (!body || !notice || !refreshButton || !totalElement) {
        console.error(
            "Accounts page is missing required HTML elements."
        );
        return;
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    function escapeHTML(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function refreshIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    function showNotice(message, isError = false) {
        notice.textContent = message;
        notice.classList.remove("hidden", "error");

        if (isError) {
            notice.classList.add("error");
        }
    }

    function hideNotice() {
        notice.textContent = "";
        notice.classList.add("hidden");
        notice.classList.remove("error");
    }

    async function requestJSON(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error(
                `Invalid server response (HTTP ${response.status}).`
            );
        }

        if (!response.ok) {
            throw new Error(
                data.error ||
                data.message ||
                `Request failed with HTTP ${response.status}.`
            );
        }

        return data;
    }

    function setButtonLoading(button, loading, loadingText, normalHTML) {
        if (!button) return;

        button.disabled = loading;
        button.innerHTML = loading
            ? escapeHTML(loadingText)
            : normalHTML;

        if (!loading) {
            refreshIcons();
        }
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return date.toLocaleString("en-IN", {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function getTransactionCount(account) {
        const count = Number(account.transaction_count || 0);
        return Number.isFinite(count) ? count : 0;
    }

    function getCustomerName(account) {
        return account.customer_code ||
            `Customer #${account.customer_id}`;
    }

    // ==========================================
    // STATISTICS
    // ==========================================

    function updateStatistics() {
        totalElement.textContent =
            allAccounts.length.toLocaleString("en-IN");

        const uniqueCustomers = new Set(
            allAccounts.map(account => String(account.customer_id))
        );

        if (customerTotalElement) {
            customerTotalElement.textContent =
                uniqueCustomers.size.toLocaleString("en-IN");
        }

        const accountsWithTransactions = allAccounts.filter(
            account => getTransactionCount(account) > 0
        ).length;

        if (transactionsTotalElement) {
            transactionsTotalElement.textContent =
                accountsWithTransactions.toLocaleString("en-IN");
        }
    }

    // ==========================================
    // CUSTOMER DROPDOWN
    // ==========================================

    async function loadCustomers(selectedCustomerId = "") {
        if (!customerSelect) return;

        try {
            const customers = await requestJSON("/customers");

            if (!Array.isArray(customers)) {
                throw new Error("Unexpected customer data received.");
            }

            allCustomers = customers;

            customerSelect.innerHTML =
                '<option value="">Select a customer</option>';

            if (allCustomers.length === 0) {
                customerSelect.innerHTML =
                    '<option value="">No customers available</option>';

                return;
            }

            allCustomers.forEach(function (customer) {
                const option = document.createElement("option");

                option.value = customer.customer_id;
                option.textContent =
                    `${customer.customer_code} (ID: ${customer.customer_id})`;

                customerSelect.appendChild(option);
            });

            if (selectedCustomerId !== "") {
                customerSelect.value = String(selectedCustomerId);
            }
        } catch (error) {
            console.error("Customer dropdown error:", error);
            throw new Error(
                "Could not load customers. Please check the Customers API."
            );
        }
    }

    // ==========================================
    // SEARCH
    // ==========================================

    function getFilteredAccounts() {
        const query = searchInput
            ? searchInput.value.trim().toLowerCase()
            : "";

        if (!query) return allAccounts;

        return allAccounts.filter(function (account) {
            const searchableValues = [
                account.account_id,
                account.account_code,
                account.customer_id,
                account.customer_code,
                account.transaction_count,
                account.created_at
            ];

            return searchableValues.some(function (value) {
                return String(value == null ? "" : value)
                    .toLowerCase()
                    .includes(query);
            });
        });
    }

    // ==========================================
    // RENDER TABLE
    // ==========================================

    function renderAccounts(accounts) {
        if (!Array.isArray(accounts) || accounts.length === 0) {
            body.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-cell">
                        ${
                            searchInput && searchInput.value.trim()
                                ? "No accounts match your search."
                                : "No account records found. Add your first account to get started."
                        }
                    </td>
                </tr>
            `;

            updateTableSummary(0);
            return;
        }

        body.innerHTML = accounts.map(function (account) {
            const id = escapeHTML(account.account_id);
            const code = escapeHTML(account.account_code);
            const customer = escapeHTML(getCustomerName(account));
            const transactionCount = getTransactionCount(account);
            const createdAt = escapeHTML(formatDate(account.created_at));

            return `
                <tr>
                    <td>${id}</td>

                    <td>
                        <span class="account-code">${code}</span>
                    </td>

                    <td>
                        <div>${customer}</div>
                        <small>Customer ID: ${
                            escapeHTML(account.customer_id)
                        }</small>
                    </td>

                    <td>
                        <span class="badge ${
                            transactionCount > 0
                                ? "badge-reviewed"
                                : "badge-pending"
                        }">
                            ${transactionCount}
                        </span>
                    </td>

                    <td>${createdAt}</td>

                    <td>
                        <div class="table-actions">
                            <button
                                type="button"
                                class="secondary-button"
                                data-action="edit"
                                data-id="${id}"
                                title="Edit account"
                                aria-label="Edit account ${code}"
                            >
                                <i data-lucide="pencil"></i>
                                Edit
                            </button>

                            <button
                                type="button"
                                class="secondary-button"
                                data-action="delete"
                                data-id="${id}"
                                data-code="${code}"
                                title="Delete account"
                                aria-label="Delete account ${code}"
                            >
                                <i data-lucide="trash-2"></i>
                                Delete
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        updateTableSummary(accounts.length);
        refreshIcons();
    }

    function updateTableSummary(visibleCount) {
        if (resultCountElement) {
            resultCountElement.textContent =
                `${visibleCount} ${
                    visibleCount === 1 ? "account" : "accounts"
                }`;
        }

        if (tableSummaryElement) {
            if (searchInput && searchInput.value.trim()) {
                tableSummaryElement.textContent =
                    `Showing ${visibleCount} matching accounts out of ${allAccounts.length} total accounts.`;
            } else {
                tableSummaryElement.textContent =
                    `Showing ${visibleCount} account records.`;
            }
        }
    }

    function applySearch() {
        renderAccounts(getFilteredAccounts());
    }

    // ==========================================
    // READ: LOAD ACCOUNTS
    // ==========================================

    async function loadAccounts(showSuccessMessage = false) {
        setButtonLoading(
            refreshButton,
            true,
            "Loading...",
            '<i data-lucide="refresh-cw"></i> Refresh'
        );

        body.innerHTML = `
            <tr>
                <td colspan="6" class="empty-cell">
                    Loading accounts...
                </td>
            </tr>
        `;

        try {
            const accounts = await requestJSON("/accounts");

            if (!Array.isArray(accounts)) {
                throw new Error("Unexpected account data received.");
            }

            allAccounts = accounts;

            updateStatistics();
            applySearch();

            if (showSuccessMessage) {
                showNotice(
                    `Account directory refreshed successfully. ${allAccounts.length} records loaded.`
                );
            }
        } catch (error) {
            console.error("Account loading error:", error);

            body.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-cell">
                        Unable to load accounts. Please try refreshing.
                    </td>
                </tr>
            `;

            totalElement.textContent = "—";

            if (customerTotalElement) {
                customerTotalElement.textContent = "—";
            }

            if (transactionsTotalElement) {
                transactionsTotalElement.textContent = "—";
            }

            updateTableSummary(0);
            showNotice(error.message, true);
        } finally {
            setButtonLoading(
                refreshButton,
                false,
                "Loading...",
                '<i data-lucide="refresh-cw"></i> Refresh'
            );
        }
    }

    // ==========================================
    // CREATE: OPEN FORM
    // ==========================================

    async function openCreateForm() {
        if (!formPanel || !form) return;

        hideNotice();
        form.reset();

        if (accountIdInput) {
            accountIdInput.value = "";
        }

        const title = document.getElementById("accountFormTitle");
        const eyebrow = document.getElementById("accountFormEyebrow");
        const description = document.getElementById(
            "accountFormDescription"
        );

        if (title) title.textContent = "Add New Account";
        if (eyebrow) eyebrow.textContent = "ACCOUNT DETAILS";

        if (description) {
            description.textContent =
                "Create an account and associate it with a customer.";
        }

        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML =
                '<i data-lucide="check"></i> Save Account';
        }

        try {
            await loadCustomers();
        } catch (error) {
            showNotice(error.message, true);
            return;
        }

        formPanel.hidden = false;
        formPanel.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        if (accountCodeInput) {
            accountCodeInput.focus();
        }

        refreshIcons();
    }

    function closeAccountForm() {
        if (formPanel) {
            formPanel.hidden = true;
        }

        if (form) {
            form.reset();
        }

        if (accountIdInput) {
            accountIdInput.value = "";
        }
    }

    // ==========================================
    // EDIT: LOAD ACCOUNT
    // ==========================================

    async function editAccount(accountId) {
        hideNotice();

        try {
            const account = await requestJSON(
                `/api/accounts/${encodeURIComponent(accountId)}`
            );

            if (!formPanel || !form || !accountCodeInput) {
                throw new Error("Account form elements are missing.");
            }

            form.reset();

            if (accountIdInput) {
                accountIdInput.value = account.account_id;
            }

            accountCodeInput.value = account.account_code || "";

            await loadCustomers(account.customer_id);

            const title = document.getElementById("accountFormTitle");
            const eyebrow = document.getElementById("accountFormEyebrow");
            const description = document.getElementById(
                "accountFormDescription"
            );

            if (title) title.textContent = "Edit Account";
            if (eyebrow) eyebrow.textContent = "UPDATE ACCOUNT";

            if (description) {
                description.textContent =
                    "Update the account code or change its associated customer.";
            }

            if (saveButton) {
                saveButton.disabled = false;
                saveButton.innerHTML =
                    '<i data-lucide="save"></i> Update Account';
            }

            formPanel.hidden = false;

            formPanel.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

            accountCodeInput.focus();
            refreshIcons();
        } catch (error) {
            console.error("Account edit error:", error);
            showNotice(error.message, true);
        }
    }

    // ==========================================
    // CREATE / UPDATE: SAVE ACCOUNT
    // ==========================================

    async function saveAccount(event) {
        event.preventDefault();

        if (isSaving) return;

        const accountCode = accountCodeInput
            ? accountCodeInput.value.trim()
            : "";

        const customerId = customerSelect
            ? customerSelect.value
            : "";

        const accountId = accountIdInput
            ? accountIdInput.value.trim()
            : "";

        if (!accountCode) {
            showNotice("Please enter an account code.", true);

            if (accountCodeInput) {
                accountCodeInput.focus();
            }

            return;
        }

        if (accountCode.length > 30) {
            showNotice(
                "Account code must not exceed 30 characters.",
                true
            );
            return;
        }

        if (!customerId) {
            showNotice("Please select a customer.", true);

            if (customerSelect) {
                customerSelect.focus();
            }

            return;
        }

        isSaving = true;

        setButtonLoading(
            saveButton,
            true,
            "Saving...",
            '<i data-lucide="check"></i> Save Account'
        );

        try {
            const isEditing = Boolean(accountId);

            const url = isEditing
                ? `/api/accounts/${encodeURIComponent(accountId)}`
                : "/api/accounts";

            const method = isEditing ? "PUT" : "POST";

            const result = await requestJSON(url, {
                method: method,
                body: JSON.stringify({
                    account_code: accountCode,
                    customer_id: Number(customerId)
                })
            });

            closeAccountForm();

            await loadAccounts(false);

            showNotice(
                result.message ||
                (
                    isEditing
                        ? "Account updated successfully."
                        : "Account created successfully."
                )
            );
        } catch (error) {
            console.error("Account save error:", error);
            showNotice(error.message, true);
        } finally {
            isSaving = false;

            if (saveButton) {
                const editing = Boolean(
                    accountIdInput && accountIdInput.value
                );

                saveButton.disabled = false;
                saveButton.innerHTML = editing
                    ? '<i data-lucide="save"></i> Update Account'
                    : '<i data-lucide="check"></i> Save Account';
            }

            refreshIcons();
        }
    }

    // ==========================================
    // DELETE: OPEN CONFIRMATION
    // ==========================================

    function openDeleteDialog(accountId, accountCode) {
        accountToDelete = accountId;

        if (deleteTitle) {
            deleteTitle.textContent = "Delete Account?";
        }

        if (deleteDescription) {
            deleteDescription.textContent =
                `Are you sure you want to delete account "${accountCode}"? ` +
                "Accounts with associated transactions cannot be deleted.";
        }

        if (confirmDeleteButton) {
            confirmDeleteButton.disabled = false;
            confirmDeleteButton.innerHTML =
                '<i data-lucide="trash-2"></i> Delete Account';
        }

        if (deleteDialog &&
            typeof deleteDialog.showModal === "function") {

            if (!deleteDialog.open) {
                deleteDialog.showModal();
            }
        } else {
            const confirmed = window.confirm(
                `Delete account "${accountCode}"?`
            );

            if (confirmed) {
                deleteAccount();
            } else {
                accountToDelete = null;
            }
        }

        refreshIcons();
    }

    function closeDeleteDialog() {
        accountToDelete = null;

        if (deleteDialog && deleteDialog.open) {
            deleteDialog.close();
        }
    }

    // ==========================================
    // DELETE: REMOVE ACCOUNT
    // ==========================================

    async function deleteAccount() {
        if (accountToDelete == null || isDeleting) return;

        isDeleting = true;

        const idToDelete = accountToDelete;

        setButtonLoading(
            confirmDeleteButton,
            true,
            "Deleting...",
            '<i data-lucide="trash-2"></i> Delete Account'
        );

        try {
            const result = await requestJSON(
                `/api/accounts/${encodeURIComponent(idToDelete)}`,
                {
                    method: "DELETE"
                }
            );

            closeDeleteDialog();

            await loadAccounts(false);

            showNotice(
                result.message || "Account deleted successfully."
            );
        } catch (error) {
            console.error("Account delete error:", error);
            showNotice(error.message, true);
        } finally {
            isDeleting = false;

            if (confirmDeleteButton) {
                confirmDeleteButton.disabled = false;
                confirmDeleteButton.innerHTML =
                    '<i data-lucide="trash-2"></i> Delete Account';
            }

            refreshIcons();
        }
    }

    // ==========================================
    // EVENT LISTENERS
    // ==========================================

    refreshButton.addEventListener("click", function () {
        loadAccounts(true);
    });

    if (addButton) {
        addButton.addEventListener("click", openCreateForm);
    }

    if (form) {
        form.addEventListener("submit", saveAccount);
    }

    if (cancelButton) {
        cancelButton.addEventListener("click", closeAccountForm);
    }

    if (closeFormButton) {
        closeFormButton.addEventListener("click", closeAccountForm);
    }

    if (searchInput) {
        searchInput.addEventListener("input", applySearch);
    }

    if (clearSearchButton) {
        clearSearchButton.addEventListener("click", function () {
            if (searchInput) {
                searchInput.value = "";
                searchInput.focus();
            }

            applySearch();
            hideNotice();
        });
    }

    body.addEventListener("click", function (event) {
        const actionButton = event.target.closest("[data-action]");

        if (!actionButton) return;

        const action = actionButton.dataset.action;
        const accountId = actionButton.dataset.id;

        if (!accountId) return;

        if (action === "edit") {
            editAccount(accountId);
        } else if (action === "delete") {
            openDeleteDialog(
                accountId,
                actionButton.dataset.code || accountId
            );
        }
    });

    if (confirmDeleteButton) {
        confirmDeleteButton.addEventListener("click", deleteAccount);
    }

    if (cancelDeleteButton) {
        cancelDeleteButton.addEventListener(
            "click",
            closeDeleteDialog
        );
    }

    if (closeDeleteDialogButton) {
        closeDeleteDialogButton.addEventListener(
            "click",
            closeDeleteDialog
        );
    }

    if (deleteDialog) {
        deleteDialog.addEventListener("click", function (event) {
            if (event.target === deleteDialog && !isDeleting) {
                closeDeleteDialog();
            }
        });

        deleteDialog.addEventListener("cancel", function (event) {
            if (isDeleting) {
                event.preventDefault();
            } else {
                accountToDelete = null;
            }
        });
    }

    if (tableTopButton) {
        tableTopButton.addEventListener("click", function () {
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });
    }

    // ==========================================
    // INITIALIZE
    // ==========================================

    loadAccounts();
    refreshIcons();
});
