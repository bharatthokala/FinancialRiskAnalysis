document.addEventListener("DOMContentLoaded", function () {
    "use strict";

    // ==========================================
    // DOM ELEMENTS
    // ==========================================

    const body = document.getElementById("customersTableBody");
    const notice = document.getElementById("customersNotice");
    const refreshButton = document.getElementById("refreshCustomers");
    const totalElement = document.getElementById("customersTotal");

    const formPanel = document.getElementById("customerFormPanel");
    const form = document.getElementById("customerForm");
    const customerIdInput = document.getElementById("customerId");
    const customerCodeInput = document.getElementById("customerCode");

    const addButton = document.getElementById("addCustomerButton");
    const saveButton = document.getElementById("saveCustomerButton");
    const cancelButton = document.getElementById("cancelCustomerForm");
    const closeFormButton = document.getElementById("closeCustomerForm");

    const searchInput = document.getElementById("customerSearch");
    const clearSearchButton = document.getElementById("clearCustomerSearch");

    const customersWithAccountsElement =
        document.getElementById("customersWithAccounts");

    const accountTotalElement =
        document.getElementById("customersAccountTotal");

    const resultCountElement =
        document.getElementById("customerResultCount");

    const tableSummaryElement =
        document.getElementById("customerTableSummary");

    const tableTopButton =
        document.getElementById("customerTableTop");

    const deleteDialog =
        document.getElementById("deleteCustomerDialog");

    const deleteTitle =
        document.getElementById("deleteCustomerTitle");

    const deleteDescription =
        document.getElementById("deleteCustomerDescription");

    const confirmDeleteButton =
        document.getElementById("confirmDeleteCustomer");

    const cancelDeleteButton =
        document.getElementById("cancelDeleteCustomer");

    const closeDeleteDialogButton =
        document.getElementById("closeDeleteCustomerDialog");

    // ==========================================
    // STATE
    // ==========================================

    let allCustomers = [];
    let customerToDelete = null;
    let isSaving = false;
    let isDeleting = false;

    if (!body || !notice || !refreshButton || !totalElement) {
        console.error(
            "Customers page is missing required HTML elements."
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

    function setButtonLoading(button, loading, loadingText, normalHTML) {
        if (!button) return;

        button.disabled = loading;

        if (loading) {
            button.textContent = loadingText;
        } else {
            button.innerHTML = normalHTML;
            refreshIcons();
        }
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
                `The server returned an invalid response (HTTP ${response.status}).`
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

    function getAccountCount(customer) {
        const count = Number(customer.account_count || 0);
        return Number.isFinite(count) ? count : 0;
    }

    function getFilteredCustomers() {
        const query = searchInput
            ? searchInput.value.trim().toLowerCase()
            : "";

        if (!query) return allCustomers;

        return allCustomers.filter(function (customer) {
            return [
                customer.customer_id,
                customer.customer_code,
                customer.account_count,
                customer.created_at
            ].some(function (value) {
                return String(value == null ? "" : value)
                    .toLowerCase()
                    .includes(query);
            });
        });
    }

    // ==========================================
    // STATISTICS
    // ==========================================

    function updateStatistics() {
        const totalCustomers = allCustomers.length;

        const customersWithAccounts = allCustomers.filter(
            customer => getAccountCount(customer) > 0
        ).length;

        const totalAccounts = allCustomers.reduce(
            (total, customer) => total + getAccountCount(customer),
            0
        );

        totalElement.textContent =
            totalCustomers.toLocaleString("en-IN");

        if (customersWithAccountsElement) {
            customersWithAccountsElement.textContent =
                customersWithAccounts.toLocaleString("en-IN");
        }

        if (accountTotalElement) {
            accountTotalElement.textContent =
                totalAccounts.toLocaleString("en-IN");
        }
    }

    // ==========================================
    // RENDER TABLE
    // ==========================================

    function renderCustomers(customers) {
        if (!Array.isArray(customers) || customers.length === 0) {
            body.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-cell">
                        ${
                            searchInput && searchInput.value.trim()
                                ? "No customers match your search."
                                : "No customer records found. Add your first customer to get started."
                        }
                    </td>
                </tr>
            `;

            updateTableSummary(0);
            return;
        }

        body.innerHTML = customers.map(function (customer) {
            const id = Number(customer.customer_id);
            const code = escapeHTML(customer.customer_code);
            const accountCount = getAccountCount(customer);
            const createdAt = escapeHTML(formatDate(customer.created_at));

            return `
                <tr>
                    <td>${escapeHTML(id)}</td>

                    <td>
                        <span class="customer-code">${code}</span>
                    </td>

                    <td>
                        <span class="badge ${
                            accountCount > 0
                                ? "badge-reviewed"
                                : "badge-pending"
                        }">
                            ${accountCount}
                        </span>
                    </td>

                    <td>${createdAt}</td>

                    <td>
                        <div class="table-actions">
                            <button
                                type="button"
                                class="secondary-button"
                                data-action="edit"
                                data-id="${escapeHTML(id)}"
                                aria-label="Edit customer ${code}"
                                title="Edit customer"
                            >
                                <i data-lucide="pencil"></i>
                                Edit
                            </button>

                            <button
                                type="button"
                                class="secondary-button"
                                data-action="delete"
                                data-id="${escapeHTML(id)}"
                                data-code="${code}"
                                aria-label="Delete customer ${code}"
                                title="Delete customer"
                            >
                                <i data-lucide="trash-2"></i>
                                Delete
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        updateTableSummary(customers.length);
        refreshIcons();
    }

    function updateTableSummary(visibleCount) {
        if (resultCountElement) {
            resultCountElement.textContent =
                `${visibleCount} ${
                    visibleCount === 1 ? "customer" : "customers"
                }`;
        }

        if (tableSummaryElement) {
            if (searchInput && searchInput.value.trim()) {
                tableSummaryElement.textContent =
                    `Showing ${visibleCount} matching records out of ${allCustomers.length} customers.`;
            } else {
                tableSummaryElement.textContent =
                    `Showing ${visibleCount} customer records.`;
            }
        }
    }

    function applySearch() {
        renderCustomers(getFilteredCustomers());
    }

    // ==========================================
    // READ: LOAD CUSTOMERS
    // ==========================================

    async function loadCustomers(showSuccessMessage = false) {
        setButtonLoading(
            refreshButton,
            true,
            "Loading...",
            '<i data-lucide="refresh-cw"></i> Refresh'
        );

        body.innerHTML = `
            <tr>
                <td colspan="5" class="empty-cell">
                    Loading customers...
                </td>
            </tr>
        `;

        try {
            const customers = await requestJSON("/customers");

            if (!Array.isArray(customers)) {
                throw new Error("Unexpected customer data received.");
            }

            allCustomers = customers;

            updateStatistics();
            applySearch();

            if (showSuccessMessage) {
                showNotice(
                    `Customer directory refreshed successfully. ${allCustomers.length} records loaded.`
                );
            }
        } catch (error) {
            console.error("Customer loading error:", error);

            body.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-cell">
                        Unable to load customers. Please try refreshing.
                    </td>
                </tr>
            `;

            totalElement.textContent = "—";

            if (customersWithAccountsElement) {
                customersWithAccountsElement.textContent = "—";
            }

            if (accountTotalElement) {
                accountTotalElement.textContent = "—";
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

    function openCreateForm() {
        if (!form || !formPanel) return;

        form.reset();

        if (customerIdInput) {
            customerIdInput.value = "";
        }

        const title = document.getElementById("customerFormTitle");
        const eyebrow = document.getElementById("customerFormEyebrow");
        const description = document.getElementById(
            "customerFormDescription"
        );

        if (title) title.textContent = "Add New Customer";
        if (eyebrow) eyebrow.textContent = "CUSTOMER DETAILS";

        if (description) {
            description.textContent =
                "Enter a unique customer code to create a customer record.";
        }

        if (saveButton) {
            saveButton.innerHTML =
                '<i data-lucide="check"></i> Save Customer';
            saveButton.disabled = false;
        }

        hideNotice();
        formPanel.hidden = false;
        formPanel.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        if (customerCodeInput) {
            customerCodeInput.focus();
        }

        refreshIcons();
    }

    function closeCustomerForm() {
        if (!formPanel) return;

        formPanel.hidden = true;

        if (form) {
            form.reset();
        }

        if (customerIdInput) {
            customerIdInput.value = "";
        }
    }

    // ==========================================
    // EDIT: LOAD CUSTOMER DETAILS
    // ==========================================

    async function editCustomer(customerId) {
        try {
            hideNotice();

            const customer = await requestJSON(
                `/api/customers/${encodeURIComponent(customerId)}`
            );

            if (!formPanel || !form || !customerCodeInput) {
                throw new Error("Customer form elements are missing.");
            }

            form.reset();

            if (customerIdInput) {
                customerIdInput.value = customer.customer_id;
            }

            customerCodeInput.value = customer.customer_code || "";

            const title = document.getElementById("customerFormTitle");
            const eyebrow = document.getElementById("customerFormEyebrow");
            const description = document.getElementById(
                "customerFormDescription"
            );

            if (title) title.textContent = "Edit Customer";
            if (eyebrow) eyebrow.textContent = "UPDATE CUSTOMER";

            if (description) {
                description.textContent =
                    "Update the customer code. It must remain unique.";
            }

            if (saveButton) {
                saveButton.innerHTML =
                    '<i data-lucide="save"></i> Update Customer';
                saveButton.disabled = false;
            }

            formPanel.hidden = false;
            formPanel.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

            customerCodeInput.focus();
            refreshIcons();
        } catch (error) {
            console.error("Customer edit error:", error);
            showNotice(error.message, true);
        }
    }

    // ==========================================
    // CREATE / UPDATE: SUBMIT FORM
    // ==========================================

    async function saveCustomer(event) {
        event.preventDefault();

        if (isSaving) return;

        if (!customerCodeInput) {
            showNotice("Customer code input is missing.", true);
            return;
        }

        const customerCode = customerCodeInput.value.trim();
        const customerId = customerIdInput
            ? customerIdInput.value.trim()
            : "";

        if (!customerCode) {
            showNotice("Please enter a customer code.", true);
            customerCodeInput.focus();
            return;
        }

        if (customerCode.length > 30) {
            showNotice(
                "Customer code must not exceed 30 characters.",
                true
            );
            customerCodeInput.focus();
            return;
        }

        isSaving = true;

        setButtonLoading(
            saveButton,
            true,
            "Saving...",
            '<i data-lucide="check"></i> Save Customer'
        );

        try {
            const isEditing = Boolean(customerId);

            const url = isEditing
                ? `/api/customers/${encodeURIComponent(customerId)}`
                : "/api/customers";

            const method = isEditing ? "PUT" : "POST";

            const result = await requestJSON(url, {
                method: method,
                body: JSON.stringify({
                    customer_code: customerCode
                })
            });

            closeCustomerForm();

            await loadCustomers(false);

            showNotice(
                result.message ||
                (
                    isEditing
                        ? "Customer updated successfully."
                        : "Customer created successfully."
                )
            );
        } catch (error) {
            console.error("Customer save error:", error);
            showNotice(error.message, true);
        } finally {
            isSaving = false;

            if (saveButton) {
                const editing = Boolean(
                    customerIdInput && customerIdInput.value
                );

                saveButton.innerHTML = editing
                    ? '<i data-lucide="save"></i> Update Customer'
                    : '<i data-lucide="check"></i> Save Customer';

                saveButton.disabled = false;
            }

            refreshIcons();
        }
    }

    // ==========================================
    // DELETE: CONFIRMATION DIALOG
    // ==========================================

    function openDeleteDialog(customerId, customerCode) {
        customerToDelete = customerId;

        if (deleteTitle) {
            deleteTitle.textContent = "Delete Customer?";
        }

        if (deleteDescription) {
            deleteDescription.textContent =
                `Are you sure you want to delete customer "${customerCode}"? ` +
                "Customers with associated accounts cannot be deleted.";
        }

        if (confirmDeleteButton) {
            confirmDeleteButton.disabled = false;
            confirmDeleteButton.innerHTML =
                '<i data-lucide="trash-2"></i> Delete Customer';
        }

        if (deleteDialog && typeof deleteDialog.showModal === "function") {
            if (!deleteDialog.open) {
                deleteDialog.showModal();
            }
        } else {
            const confirmed = window.confirm(
                `Delete customer "${customerCode}"?`
            );

            if (confirmed) {
                deleteCustomer();
            } else {
                customerToDelete = null;
            }
        }

        refreshIcons();
    }

    function closeDeleteDialog() {
        customerToDelete = null;

        if (deleteDialog && deleteDialog.open) {
            deleteDialog.close();
        }
    }

    // ==========================================
    // DELETE: SEND REQUEST
    // ==========================================

    async function deleteCustomer() {
        if (customerToDelete == null || isDeleting) return;

        isDeleting = true;

        const idToDelete = customerToDelete;

        setButtonLoading(
            confirmDeleteButton,
            true,
            "Deleting...",
            '<i data-lucide="trash-2"></i> Delete Customer'
        );

        try {
            const result = await requestJSON(
                `/api/customers/${encodeURIComponent(idToDelete)}`,
                {
                    method: "DELETE"
                }
            );

            closeDeleteDialog();

            await loadCustomers(false);

            showNotice(
                result.message || "Customer deleted successfully."
            );
        } catch (error) {
            console.error("Customer delete error:", error);

            // Keep the confirmation dialog open so the user can cancel.
            showNotice(error.message, true);
        } finally {
            isDeleting = false;

            if (confirmDeleteButton) {
                confirmDeleteButton.disabled = false;
                confirmDeleteButton.innerHTML =
                    '<i data-lucide="trash-2"></i> Delete Customer';
            }

            refreshIcons();
        }
    }

    // ==========================================
    // EVENT LISTENERS
    // ==========================================

    refreshButton.addEventListener("click", function () {
        loadCustomers(true);
    });

    if (addButton) {
        addButton.addEventListener("click", openCreateForm);
    }

    if (form) {
        form.addEventListener("submit", saveCustomer);
    }

    if (cancelButton) {
        cancelButton.addEventListener("click", closeCustomerForm);
    }

    if (closeFormButton) {
        closeFormButton.addEventListener("click", closeCustomerForm);
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

    // Event delegation: works for table rows rendered after loading.
    body.addEventListener("click", function (event) {
        const actionButton = event.target.closest("[data-action]");

        if (!actionButton) return;

        const action = actionButton.dataset.action;
        const customerId = actionButton.dataset.id;

        if (!customerId) return;

        if (action === "edit") {
            editCustomer(customerId);
        } else if (action === "delete") {
            openDeleteDialog(
                customerId,
                actionButton.dataset.code || customerId
            );
        }
    });

    if (confirmDeleteButton) {
        confirmDeleteButton.addEventListener("click", deleteCustomer);
    }

    if (cancelDeleteButton) {
        cancelDeleteButton.addEventListener("click", closeDeleteDialog);
    }

    if (closeDeleteDialogButton) {
        closeDeleteDialogButton.addEventListener(
            "click",
            closeDeleteDialog
        );
    }

    if (deleteDialog) {
        deleteDialog.addEventListener("click", function (event) {
            // Close when the user clicks the dialog backdrop.
            if (event.target === deleteDialog && !isDeleting) {
                closeDeleteDialog();
            }
        });

        deleteDialog.addEventListener("cancel", function (event) {
            if (isDeleting) {
                event.preventDefault();
            } else {
                customerToDelete = null;
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
    // INITIAL LOAD
    // ==========================================

    loadCustomers();
    refreshIcons();
});
