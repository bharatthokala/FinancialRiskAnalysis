document.addEventListener("DOMContentLoaded", () => {
    const tbody = document.getElementById("transactionsTableBody");
    const notice = document.getElementById("transactionsNotice");
    const form = document.getElementById("addTransactionForm");
    const formPanel = document.getElementById("transactionFormPanel");
    const toggleButton = document.getElementById("toggleTransactionForm");
    const cancelButton = document.getElementById("cancelTransactionForm");
    const closeFormButton = document.getElementById("closeTransactionForm");
    const saveButton = document.getElementById("saveTransactionButton");
    const refreshButton = document.getElementById("refreshTransactions");
    const accountSelect = document.getElementById("account_id");
    const searchInput = document.getElementById("transactionSearch");
    const clearSearchButton = document.getElementById("clearTransactionSearch");
    const resultCount = document.getElementById("transactionResultCount");
    const tableSummary = document.getElementById("transactionTableSummary");
    const formTitle = document.getElementById("transactionFormTitle");
    const formDescription = document.getElementById("transactionFormDescription");
    const formEyebrow = document.getElementById("transactionFormEyebrow");
    const transactionIdInput = document.getElementById("transaction_id");

    const totalElement = document.getElementById("transactionsTotal");
    const amountTotalElement = document.getElementById("transactionsAmountTotal");
    const accountsTotalElement = document.getElementById("transactionsAccountsTotal");

    const deleteDialog = document.getElementById("deleteTransactionDialog");
    const deleteDescription = document.getElementById("deleteTransactionDescription");
    const confirmDeleteButton = document.getElementById("confirmDeleteTransaction");
    const cancelDeleteButton = document.getElementById("cancelDeleteTransaction");
    const closeDeleteDialogButton = document.getElementById("closeDeleteTransactionDialog");
    const tableTopButton = document.getElementById("transactionTableTop");

    let transactions = [];
    let accounts = [];
    let editingTransactionId = null;
    let deletingTransactionId = null;
    let noticeTimer = null;

    // -----------------------------------------------------
    // HELPERS
    // -----------------------------------------------------

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function formatMoney(value) {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Number(value) || 0);
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(String(value).replace(" ", "T"));

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

    function toDateTimeLocal(value) {
        if (!value) return "";

        const date = new Date(String(value).replace(" ", "T"));

        if (Number.isNaN(date.getTime())) {
            return String(value).replace(" ", "T").slice(0, 16);
        }

        const pad = number => String(number).padStart(2, "0");

        return [
            date.getFullYear(),
            "-",
            pad(date.getMonth() + 1),
            "-",
            pad(date.getDate()),
            "T",
            pad(date.getHours()),
            ":",
            pad(date.getMinutes())
        ].join("");
    }

    async function readResponse(response) {
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                result.error || result.message || `Request failed (${response.status}).`
            );
        }

        return result;
    }

    function setButtonLoading(button, loading, loadingText, normalHTML) {
        if (!button) return;

        button.disabled = loading;

        if (loading) {
            button.textContent = loadingText;
        } else if (normalHTML) {
            button.innerHTML = normalHTML;
        }

        refreshIcons();
    }

    function refreshIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    function showNotice(message, type = "success") {
        if (!notice) return;

        clearTimeout(noticeTimer);

        notice.textContent = message;
        notice.classList.remove("hidden", "error");

        if (type === "error") {
            notice.classList.add("error");
        }

        noticeTimer = setTimeout(() => {
            notice.classList.add("hidden");
        }, 6000);
    }

    function hideNotice() {
        if (!notice) return;

        clearTimeout(noticeTimer);
        notice.textContent = "";
        notice.classList.add("hidden");
        notice.classList.remove("error");
    }

    function setEmptyRow(message) {
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-cell">
                    ${escapeHTML(message)}
                </td>
            </tr>
        `;
    }

    // -----------------------------------------------------
    // STATISTICS
    // -----------------------------------------------------

    function updateStatistics(list = transactions) {
        const totalAmount = list.reduce(
            (sum, transaction) => sum + (Number(transaction.amount) || 0),
            0
        );

        const uniqueAccounts = new Set(
            list.map(transaction => String(transaction.account_id))
        );

        if (totalElement) {
            totalElement.textContent = list.length.toLocaleString("en-IN");
        }

        if (amountTotalElement) {
            amountTotalElement.textContent = formatMoney(totalAmount);
        }

        if (accountsTotalElement) {
            accountsTotalElement.textContent = uniqueAccounts.size.toLocaleString("en-IN");
        }
    }

    // -----------------------------------------------------
    // SEARCH AND FILTER
    // -----------------------------------------------------

    function getFilteredTransactions() {
        const query = (searchInput?.value || "").trim().toLowerCase();

        if (!query) return transactions;

        return transactions.filter(transaction => {
            const searchableValues = [
                transaction.transaction_id,
                transaction.account_id,
                transaction.amount,
                transaction.transaction_type,
                transaction.channel,
                transaction.region,
                transaction.transaction_datetime
            ];

            return searchableValues.some(value =>
                String(value ?? "").toLowerCase().includes(query)
            );
        });
    }

    // -----------------------------------------------------
    // RENDER TRANSACTIONS
    // -----------------------------------------------------

    function renderTransactions() {
        if (!tbody) return;

        const filtered = getFilteredTransactions();

        if (resultCount) {
            resultCount.textContent =
                `${filtered.length} transaction${filtered.length === 1 ? "" : "s"}`;
        }

        if (tableSummary) {
            tableSummary.textContent =
                `Showing ${filtered.length} of ${transactions.length} transactions`;
        }

        if (filtered.length === 0) {
            setEmptyRow(
                transactions.length === 0
                    ? "No transactions found. Add your first transaction."
                    : "No transactions match your search."
            );

            updateStatistics([]);
            return;
        }

        tbody.innerHTML = filtered.map(transaction => {
            const id = Number(transaction.transaction_id);
            const type = String(transaction.transaction_type || "").toUpperCase();

            const typeClass = type === "CREDIT"
                ? "badge-reviewed"
                : "badge-pending";

            return `
                <tr>
                    <td>#${escapeHTML(id)}</td>

                    <td>
                        ${escapeHTML(transaction.account_id)}
                    </td>

                    <td>
                        <strong>${escapeHTML(formatMoney(transaction.amount))}</strong>
                    </td>

                    <td>
                        <span class="badge ${typeClass}">
                            ${escapeHTML(type || "—")}
                        </span>
                    </td>

                    <td>${escapeHTML(transaction.channel || "—")}</td>

                    <td>${escapeHTML(transaction.region || "—")}</td>

                    <td>${escapeHTML(formatDate(transaction.transaction_datetime))}</td>

                    <td>
                        <div class="table-actions">
                            <button
                                type="button"
                                class="secondary-button transaction-edit-button"
                                data-id="${escapeHTML(id)}"
                                aria-label="Edit transaction ${escapeHTML(id)}"
                                title="Edit transaction">
                                <i data-lucide="pencil"></i>
                                Edit
                            </button>

                            <button
                                type="button"
                                class="secondary-button transaction-delete-button"
                                data-id="${escapeHTML(id)}"
                                aria-label="Delete transaction ${escapeHTML(id)}"
                                title="Delete transaction">
                                <i data-lucide="trash-2"></i>
                                Delete
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        updateStatistics(filtered);
        refreshIcons();
    }

    // -----------------------------------------------------
    // LOAD TRANSACTIONS
    // -----------------------------------------------------

    async function loadTransactions() {
        if (!tbody) return;

        setButtonLoading(
            refreshButton,
            true,
            "Refreshing...",
            '<i data-lucide="refresh-cw"></i> Refresh'
        );

        try {
            const response = await fetch("/transactions", {
                headers: { "Accept": "application/json" }
            });

            const data = await readResponse(response);

            if (!Array.isArray(data)) {
                throw new Error("The server returned an invalid transaction list.");
            }

            transactions = data;
            renderTransactions();

        } catch (error) {
            console.error("Transaction loading error:", error);
            setEmptyRow("Unable to load transactions. Please refresh.");

            showNotice(error.message, "error");

        } finally {
            setButtonLoading(
                refreshButton,
                false,
                "",
                '<i data-lucide="refresh-cw"></i> Refresh'
            );
        }
    }

    // -----------------------------------------------------
    // LOAD ACCOUNTS
    // -----------------------------------------------------

    async function loadAccounts(selectedAccountId = null) {
        if (!accountSelect) return;

        accountSelect.innerHTML = '<option value="">Loading accounts...</option>';

        try {
            const response = await fetch("/accounts", {
                headers: { "Accept": "application/json" }
            });

            const data = await readResponse(response);

            if (!Array.isArray(data)) {
                throw new Error("The server returned an invalid account list.");
            }

            accounts = data;

            if (accounts.length === 0) {
                accountSelect.innerHTML =
                    '<option value="">No accounts available</option>';

                accountSelect.disabled = true;

                showNotice(
                    "Create an account before adding a transaction.",
                    "error"
                );

                return;
            }

            accountSelect.innerHTML = `
                <option value="">Select an account</option>
                ${accounts.map(account => `
                    <option value="${escapeHTML(account.account_id)}">
                        ${escapeHTML(account.account_code)}
                        (ID: ${escapeHTML(account.account_id)})
                    </option>
                `).join("")}
            `;

            accountSelect.disabled = false;

            if (selectedAccountId !== null) {
                accountSelect.value = String(selectedAccountId);
            }

        } catch (error) {
            console.error("Account loading error:", error);

            accountSelect.innerHTML =
                '<option value="">Unable to load accounts</option>';

            accountSelect.disabled = true;

            showNotice(error.message, "error");
        }
    }

    // -----------------------------------------------------
    // FORM MODE: CREATE OR EDIT
    // -----------------------------------------------------

    function setFormMode(mode) {
        const isEditing = mode === "edit";

        if (formTitle) {
            formTitle.textContent = isEditing
                ? "Edit Transaction"
                : "New Transaction";
        }

        if (formDescription) {
            formDescription.textContent = isEditing
                ? "Update the transaction details below."
                : "Enter the transaction details below.";
        }

        if (formEyebrow) {
            formEyebrow.textContent = isEditing
                ? "EDIT TRANSACTION"
                : "TRANSACTION DETAILS";
        }

        if (saveButton) {
            saveButton.innerHTML = isEditing
                ? '<i data-lucide="save"></i> Update Transaction'
                : '<i data-lucide="check"></i> Save Transaction';
        }

        refreshIcons();
    }

    function openForm() {
        hideNotice();

        if (formPanel) {
            formPanel.hidden = false;
            formPanel.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }

        if (toggleButton) {
            toggleButton.innerHTML =
                '<i data-lucide="x"></i> Close Form';
        }

        refreshIcons();
    }

    function closeForm() {
        if (formPanel) {
            formPanel.hidden = true;
        }

        if (toggleButton) {
            toggleButton.innerHTML =
                '<i data-lucide="plus"></i> Add Transaction';
        }

        refreshIcons();
    }

    function resetForm() {
        if (form) form.reset();

        editingTransactionId = null;

        if (transactionIdInput) {
            transactionIdInput.value = "";
        }

        setFormMode("create");
    }

    function startNewTransaction() {
        resetForm();
        openForm();

        if (accountSelect && accountSelect.disabled) {
            showNotice(
                "Create an account before adding a transaction.",
                "error"
            );
        }
    }

    if (toggleButton) {
        toggleButton.addEventListener("click", () => {
            if (formPanel && !formPanel.hidden) {
                closeForm();
            } else {
                startNewTransaction();
            }
        });
    }

    if (cancelButton) {
        cancelButton.addEventListener("click", () => {
            resetForm();
            closeForm();
            hideNotice();
        });
    }

    if (closeFormButton) {
        closeFormButton.addEventListener("click", () => {
            resetForm();
            closeForm();
        });
    }

    // -----------------------------------------------------
    // EDIT TRANSACTION
    // -----------------------------------------------------

    async function editTransaction(id) {
        const transaction = transactions.find(
            item => Number(item.transaction_id) === Number(id)
        );

        if (!transaction) {
            showNotice("Transaction not found. Refresh the page.", "error");
            return;
        }

        hideNotice();
        resetForm();

        editingTransactionId = Number(id);

        if (transactionIdInput) {
            transactionIdInput.value = String(id);
        }

        await loadAccounts(transaction.account_id);

        const dateInput = document.getElementById("transaction_datetime");
        const amountInput = document.getElementById("amount");
        const typeInput = document.getElementById("transaction_type");
        const channelInput = document.getElementById("channel");
        const regionInput = document.getElementById("region");

        if (accountSelect) {
            accountSelect.value = String(transaction.account_id);
        }

        if (dateInput) {
            dateInput.value = toDateTimeLocal(
                transaction.transaction_datetime
            );
        }

        if (amountInput) {
            amountInput.value = transaction.amount;
        }

        if (typeInput) {
            const existingType = String(
                transaction.transaction_type || ""
            ).toUpperCase();

            if (
                !Array.from(typeInput.options).some(
                    option => option.value.toUpperCase() === existingType
                )
            ) {
                typeInput.add(new Option(existingType, existingType));
            }

            typeInput.value = existingType;
        }

        if (channelInput) {
            const existingChannel = String(transaction.channel || "");

            if (
                !Array.from(channelInput.options).some(
                    option => option.value === existingChannel
                )
            ) {
                channelInput.add(new Option(existingChannel, existingChannel));
            }

            channelInput.value = existingChannel;
        }

        if (regionInput) {
            regionInput.value = transaction.region || "";
        }

        setFormMode("edit");
        openForm();

        if (formTitle) {
            formTitle.focus?.();
        }
    }

    // -----------------------------------------------------
    // CREATE OR UPDATE TRANSACTION
    // -----------------------------------------------------

    if (form) {
        form.addEventListener("submit", async event => {
            event.preventDefault();
            hideNotice();

            if (!form.reportValidity()) return;

            if (accountSelect?.disabled) {
                showNotice("A valid account is required.", "error");
                return;
            }

            const formData = new FormData(form);

            const transaction = {
                account_id: formData.get("account_id"),
                transaction_datetime: formData.get("transaction_datetime"),
                amount: formData.get("amount"),
                transaction_type: formData.get("transaction_type"),
                channel: formData.get("channel"),
                region: formData.get("region") || ""
            };

            const isEditing = editingTransactionId !== null;

            const url = isEditing
                ? `/api/transactions/${editingTransactionId}`
                : "/api/transactions";

            const method = isEditing ? "PUT" : "POST";

            const originalHTML = isEditing
                ? '<i data-lucide="save"></i> Update Transaction'
                : '<i data-lucide="check"></i> Save Transaction';

            setButtonLoading(
                saveButton,
                true,
                isEditing ? "Updating..." : "Saving...",
                originalHTML
            );

            try {
                const response = await fetch(url, {
                    method,
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify(transaction)
                });

                const result = await readResponse(response);

                showNotice(
                    result.message || (
                        isEditing
                            ? "Transaction updated successfully."
                            : "Transaction added successfully."
                    ),
                    "success"
                );

                resetForm();
                closeForm();

                await loadTransactions();

            } catch (error) {
                console.error("Save/update transaction error:", error);
                showNotice(error.message, "error");

            } finally {
                setButtonLoading(
                    saveButton,
                    false,
                    "",
                    originalHTML
                );
            }
        });
    }

    // -----------------------------------------------------
    // DELETE TRANSACTION DIALOG
    // -----------------------------------------------------

    function closeDeleteDialog() {
        deletingTransactionId = null;

        if (deleteDialog?.open) {
            deleteDialog.close();
        }
    }

    function requestDeleteTransaction(id) {
        const transaction = transactions.find(
            item => Number(item.transaction_id) === Number(id)
        );

        if (!transaction) {
            showNotice("Transaction not found. Refresh the page.", "error");
            return;
        }

        deletingTransactionId = Number(id);

        if (deleteDescription) {
            deleteDescription.textContent =
                `Delete transaction #${id} (${formatMoney(transaction.amount)})? ` +
                "This action cannot be undone. Transactions with linked risk alerts cannot be deleted.";
        }

        if (deleteDialog && typeof deleteDialog.showModal === "function") {
            deleteDialog.showModal();
        } else {
            const confirmed = window.confirm(
                deleteDescription?.textContent ||
                `Delete transaction #${id}?`
            );

            if (confirmed) {
                performDeleteTransaction();
            } else {
                deletingTransactionId = null;
            }
        }
    }

    async function performDeleteTransaction() {
        if (deletingTransactionId === null) return;

        const id = deletingTransactionId;
        hideNotice();

        setButtonLoading(
            confirmDeleteButton,
            true,
            "Deleting...",
            '<i data-lucide="trash-2"></i> Delete Transaction'
        );

        try {
            const response = await fetch(`/api/transactions/${id}`, {
                method: "DELETE",
                headers: {
                    "Accept": "application/json"
                }
            });

            const result = await readResponse(response);

            closeDeleteDialog();

            showNotice(
                result.message || "Transaction deleted successfully.",
                "success"
            );

            await loadTransactions();

        } catch (error) {
            console.error("Delete transaction error:", error);

            closeDeleteDialog();
            showNotice(error.message, "error");

        } finally {
            setButtonLoading(
                confirmDeleteButton,
                false,
                "",
                '<i data-lucide="trash-2"></i> Delete Transaction'
            );
        }
    }

    if (confirmDeleteButton) {
        confirmDeleteButton.addEventListener("click", performDeleteTransaction);
    }

    if (cancelDeleteButton) {
        cancelDeleteButton.addEventListener("click", closeDeleteDialog);
    }

    if (closeDeleteDialogButton) {
        closeDeleteDialogButton.addEventListener("click", closeDeleteDialog);
    }

    if (deleteDialog) {
        deleteDialog.addEventListener("click", event => {
            if (event.target === deleteDialog) {
                closeDeleteDialog();
            }
        });
    }

    // -----------------------------------------------------
    // TABLE ACTIONS
    // -----------------------------------------------------

    if (tbody) {
        tbody.addEventListener("click", event => {
            const editButton = event.target.closest(
                ".transaction-edit-button"
            );

            const deleteButton = event.target.closest(
                ".transaction-delete-button"
            );

            if (editButton) {
                editTransaction(editButton.dataset.id);
                return;
            }

            if (deleteButton) {
                requestDeleteTransaction(deleteButton.dataset.id);
            }
        });
    }

    // -----------------------------------------------------
    // SEARCH EVENTS
    // -----------------------------------------------------

    if (searchInput) {
        searchInput.addEventListener("input", renderTransactions);
    }

    if (clearSearchButton) {
        clearSearchButton.addEventListener("click", () => {
            if (searchInput) {
                searchInput.value = "";
                renderTransactions();
                searchInput.focus();
            }
        });
    }

    // -----------------------------------------------------
    // REFRESH
    // -----------------------------------------------------

    if (refreshButton) {
        refreshButton.addEventListener("click", async () => {
            hideNotice();
            await loadTransactions();
        });
    }

    if (tableTopButton) {
        tableTopButton.addEventListener("click", () => {
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });
    }

    // -----------------------------------------------------
    // INITIALIZE
    // -----------------------------------------------------

    loadTransactions();
    loadAccounts();
    refreshIcons();
});
