"use client";

import "@fontsource/inter";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
    Activity,
    CalendarClock,
    Eye,
    Mail,
    MoreHorizontal,
    Pencil,
    Plus,
    RotateCcw,
    Trash2,
    UserRound,
    X,
} from "lucide-react";

import {
    customers as demoCustomers,
    customerStats as demoCustomerStats,
    type Customer,
    type CustomerStat,
} from "../../../lib/customersData";

type AccountSource =
    | "manual"
    | "stripe"
    | "hubspot"
    | "salesforce"
    | "pipedrive"
    | "intercom"
    | "other";

type CustomerWithMrr = Customer & {
    company?: string;
    website?: string | null;
    mrr?: number;
    syncedMrr?: number | null;
    manualMrr?: number | null;
    plan?: string | null;
    renewalDate?: string | null;
    notes?: string | null;
    source?: AccountSource;
    externalId?: string | null;
    engagementScore?: number;
    lastActivity?: string;
    clickRate?: string;
    lastEmail?: string;
    hasManualOverrides?: boolean;
    archivedAt?: string | null;
};

type PageCustomerStat = CustomerStat & {
    comparison?: string;
    comparisonValue?: string;
};

type AccountForm = {
    name: string;
    email: string;
    company: string;
    website: string;
    mrr: string;
    plan: string;
    status: string;
    renewalDate: string;
    notes: string;
};

type SortBy =
    | "recent"
    | "openRateDesc"
    | "openRateAsc"
    | "engagementDesc"
    | "engagementAsc"
    | "emailsDesc"
    | "emailsAsc"
    | "mrrDesc"
    | "mrrAsc"
    | "account";

const sortOptions: { label: string; value: SortBy }[] = [
    { label: "All Accounts", value: "recent" },
    { label: "Highest Open Rate", value: "openRateDesc" },
    { label: "Lowest Open Rate", value: "openRateAsc" },
    { label: "Highest Engagement Score", value: "engagementDesc" },
    { label: "Lowest Engagement Score", value: "engagementAsc" },
    { label: "Most Emails Sent", value: "emailsDesc" },
    { label: "Least Emails Sent", value: "emailsAsc" },
    { label: "Highest MRR", value: "mrrDesc" },
    { label: "Lowest MRR", value: "mrrAsc" },
    { label: "Account A-Z", value: "account" },
];

const EMPTY_FORM: AccountForm = {
    name: "",
    email: "",
    company: "",
    website: "",
    mrr: "",
    plan: "",
    status: "Active",
    renewalDate: "",
    notes: "",
};

const ITEMS_PER_PAGE = 11;
const customerStatIcons = [
    CalendarClock,
    Activity,
    Mail,
    Eye,
];

function getWorkspaceId() {
    return localStorage.getItem("workspaceId") || "demo-workspace";
}

function getInitials(name: string) {
    return name
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function percentToNumber(value?: string) {
    return Number((value || "0").replace("%", ""));
}

function getMrrNumber(customer: CustomerWithMrr) {
    return Number(customer.mrr ?? 0);
}

function getEngagementScore(customer: CustomerWithMrr) {
    if (typeof customer.engagementScore === "number") return customer.engagementScore;

    return Math.round(
        percentToNumber(customer.openRate) * 0.7 +
        percentToNumber(customer.clickRate) * 0.3,
    );
}

function getEngagementClass(score: number) {
    if (score >= 70) return "engagementHigh";
    if (score >= 40) return "engagementMedium";
    return "engagementLow";
}

function getLastActivity(customer: CustomerWithMrr) {
    return customer.lastActivity || customer.lastEmail || "No activity yet";
}

function formatCurrency(value: number) {
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
    }).format(value);
}

function formatMrr(customer: CustomerWithMrr) {
    const mrr = getMrrNumber(customer);
    return mrr ? formatCurrency(mrr) : "—";
}

const SOURCE_LOGOS: Partial<Record<AccountSource, string>> = {
    stripe: "https://www.google.com/s2/favicons?domain=stripe.com&sz=128",
    hubspot: "https://www.google.com/s2/favicons?domain=hubspot.com&sz=128",
    salesforce: "https://www.google.com/s2/favicons?domain=salesforce.com&sz=128",
    pipedrive: "https://www.google.com/s2/favicons?domain=pipedrive.com&sz=128",
    intercom: "https://www.google.com/s2/favicons?domain=intercom.com&sz=128",
};

const SOURCE_DOMAINS: Partial<Record<AccountSource, string>> = {
    stripe: "stripe.com",
    hubspot: "hubspot.com",
    salesforce: "salesforce.com",
    pipedrive: "pipedrive.com",
    intercom: "intercom.com",
};

const DEMO_SOURCES: AccountSource[] = [
    "stripe",
    "hubspot",
    "manual",
    "salesforce",
    "pipedrive",
    "stripe",
    "manual",
    "intercom",
    "hubspot",
    "manual",
    "salesforce",
];

function sourceLabel(source: AccountSource) {
    return source.charAt(0).toUpperCase() + source.slice(1);
}

function handleSourceLogoError(event: React.SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    const fallback = image.dataset.fallback;

    if (fallback && image.src !== fallback) {
        image.src = fallback;
    }
}

function SourceLogo({ source = "manual" }: { source?: AccountSource }) {
    if (source === "manual" || source === "other") {
        return (
            <span
                className="accountSourceLogo accountSourceLogoManual"
                title="Manually added"
                aria-label="Manually added"
            >
                <UserRound size={14} aria-hidden="true" />
            </span>
        );
    }

    const logoUrl = SOURCE_LOGOS[source];
    const domain = SOURCE_DOMAINS[source];

    if (!logoUrl || !domain) {
        return (
            <span
                className="accountSourceLogo accountSourceLogoManual"
                title={sourceLabel(source)}
                aria-label={sourceLabel(source)}
            >

            </span>
        );
    }

    return (
        <span
            className="accountSourceLogo"
            title={sourceLabel(source)}
            aria-label={sourceLabel(source)}
        >
            <img
                src={logoUrl}
                data-fallback={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
                onError={handleSourceLogoError}
                alt=""
            />
        </span>
    );
}

function normalizeStats(stats: PageCustomerStat[]) {
    return stats.map((stat) => {
        let label = stat.label;
        if (label === "Total Customers") label = "Total Accounts";
        if (label === "Customers At Risk") label = "Accounts At Risk";

        return {
            ...stat,
            label,
            comparison: stat.comparison || "previous month",
        };
    });
}

function calculateCustomerStats(customers: CustomerWithMrr[]): PageCustomerStat[] {
    const totalAccounts = customers.length;
    const totalMrr = customers.reduce(
        (total, customer) => total + getMrrNumber(customer),
        0,
    );
    const totalEmailsSent = customers.reduce(
        (total, customer) => total + Number(customer.emailsSent || 0),
        0,
    );


    const averageOpenRate =
        customers.reduce(
            (total, customer) => total + percentToNumber(customer.openRate),
            0,
        ) / Math.max(customers.length, 1);


    const averageEngagementScore =
        customers.reduce(
            (total, customer) => total + getEngagementScore(customer),
            0,
        ) / Math.max(customers.length, 1);

    return [
        {
            label: "Total Accounts",
            value: totalAccounts.toLocaleString("en-GB"),
            change: "0.0%",
            comparison: "previous month",
            comparisonValue: totalAccounts.toLocaleString("en-GB"),
        },
        {
            label: "Engagement Score",
            value: `${averageEngagementScore.toFixed(1)}%`,
            change: "0.0%",
            comparison: "previous month",
            comparisonValue: `${averageEngagementScore.toFixed(1)}%`,
        },
        {
            label: "Emails Sent",
            value: totalEmailsSent.toLocaleString("en-GB"),
            change: "0.0%",
            comparison: "previous month",
            comparisonValue: totalEmailsSent.toLocaleString("en-GB"),
        },
        {
            label: "Avg. Open Rate",
            value: `${averageOpenRate.toFixed(1)}%`,
            change: "0.0%",
            comparison: "previous month",
            comparisonValue: `${averageOpenRate.toFixed(1)}%`,
        },
    ];
}

function normaliseDemoCustomer(customer: Customer, index: number): CustomerWithMrr {
    const source = DEMO_SOURCES[index % DEMO_SOURCES.length];

    return {
        ...customer,
        source,
        company: "company" in customer ? String(customer.company || "") : "",
        website: "website" in customer ? String(customer.website || "") : "",
        externalId: source === "manual" ? null : `demo-${source}-${customer.id}`,
        hasManualOverrides: false,
    };
}

export default function CustomersPage() {
    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState<SortBy>("recent");
    const [toast, setToast] = useState("");
    const [customers, setCustomers] = useState<CustomerWithMrr[]>([]);
    const [liveStats, setLiveStats] = useState<PageCustomerStat[]>([]);
    const [source, setSource] = useState<"demo" | "live" | "empty-live">("demo");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<CustomerWithMrr | null>(null);
    const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
    const [rowMenuId, setRowMenuId] = useState<string | null>(null);

    const loadCustomers = useCallback(async () => {
        try {
            setLoading(true);
            const workspaceId = getWorkspaceId();
            const response = await fetch(
                `/api/dashboard/customers?workspaceId=${encodeURIComponent(workspaceId)}`,
                { cache: "no-store" },
            );
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || "Failed to load accounts.");

            const loadedCustomers: CustomerWithMrr[] = Array.isArray(data.customers)
                ? data.customers
                : [];

            setCustomers(
                data.source === "demo"
                    ? loadedCustomers.map((customer, index) =>
                        normaliseDemoCustomer(customer, index),
                    )
                    : loadedCustomers.map((customer) => ({
                        ...customer,
                        source: customer.source || "manual",
                    })),
            );
            setLiveStats(Array.isArray(data.stats) ? data.stats : []);
            setSource(data.source || "live");
        } catch (error) {
            setCustomers(demoCustomers.map(normaliseDemoCustomer));
            setLiveStats(demoCustomerStats);
            setSource("demo");
            showToast(error instanceof Error ? error.message : "Failed to load accounts.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadCustomers();
    }, [loadCustomers]);

    const customerStats = useMemo(() => {
        if (liveStats.length > 0) return normalizeStats(liveStats);
        return calculateCustomerStats(customers);
    }, [customers, liveStats]);

    const filteredCustomers = useMemo(() => {
        const searchTerm = search.trim().toLowerCase();
        const result = customers.filter((customer) =>
            [customer.name, customer.email, customer.company, customer.plan, customer.source]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(searchTerm)),
        );

        switch (sortBy) {
            case "openRateDesc":
                result.sort((a, b) => percentToNumber(b.openRate) - percentToNumber(a.openRate));
                break;
            case "openRateAsc":
                result.sort((a, b) => percentToNumber(a.openRate) - percentToNumber(b.openRate));
                break;
            case "engagementDesc":
                result.sort((a, b) => getEngagementScore(b) - getEngagementScore(a));
                break;
            case "engagementAsc":
                result.sort((a, b) => getEngagementScore(a) - getEngagementScore(b));
                break;
            case "emailsDesc":
                result.sort((a, b) => Number(b.emailsSent) - Number(a.emailsSent));
                break;
            case "emailsAsc":
                result.sort((a, b) => Number(a.emailsSent) - Number(b.emailsSent));
                break;
            case "mrrDesc":
                result.sort((a, b) => getMrrNumber(b) - getMrrNumber(a));
                break;
            case "mrrAsc":
                result.sort((a, b) => getMrrNumber(a) - getMrrNumber(b));
                break;
            case "account":
                result.sort((a, b) => a.name.localeCompare(b.name));
                break;
        }

        return result;
    }, [customers, search, sortBy]);

    const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE));
    const paginatedCustomers = filteredCustomers.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE,
    );

    useEffect(() => setCurrentPage(1), [search, sortBy]);
    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [currentPage, totalPages]);

    function showToast(message: string) {
        setToast(message);
        window.setTimeout(() => setToast(""), 2600);
    }

    function openAddModal() {
        setEditingCustomer(null);
        setForm(EMPTY_FORM);
        setModalOpen(true);
    }

    function openEditModal(customer: CustomerWithMrr) {
        setEditingCustomer(customer);
        setForm({
            name: customer.name || "",
            email: customer.email || "",
            company: customer.company || "",
            website: customer.website || "",
            mrr: customer.mrr ? String(customer.mrr) : "",
            plan: customer.plan || "",
            status: customer.status || "Active",
            renewalDate: customer.renewalDate ? customer.renewalDate.slice(0, 10) : "",
            notes: customer.notes || "",
        });
        setRowMenuId(null);
        setModalOpen(true);
    }

    function closeModal() {
        if (saving) return;
        setModalOpen(false);
        setEditingCustomer(null);
        setForm(EMPTY_FORM);
    }

    async function submitAccount(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!form.name.trim() || !form.email.trim()) {
            showToast("Name and email are required.");
            return;
        }

        try {
            setSaving(true);
            const workspaceId = getWorkspaceId();
            const isEditing = Boolean(editingCustomer);
            const url = isEditing
                ? `/api/dashboard/customers/${encodeURIComponent(editingCustomer!.id)}`
                : "/api/dashboard/customers";
            const response = await fetch(url, {
                method: isEditing ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId,
                    ...form,
                    mrr: form.mrr === "" ? null : Number(form.mrr),
                    renewalDate: form.renewalDate || null,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Account could not be saved.");

            closeModal();
            await loadCustomers();
            showToast(isEditing ? "Account updated." : "Account added.");
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Account could not be saved.");
        } finally {
            setSaving(false);
        }
    }

    async function restoreSyncedValues(customer: CustomerWithMrr) {
        try {
            const response = await fetch(
                `/api/dashboard/customers/${encodeURIComponent(customer.id)}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        workspaceId: getWorkspaceId(),
                        restoreSyncedValues: true,
                    }),
                },
            );
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Synced values could not be restored.");

            setRowMenuId(null);
            await loadCustomers();
            showToast("Synced values restored.");
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Synced values could not be restored.");
        }
    }

    async function removeAccount(customer: CustomerWithMrr) {
        const action = customer.source === "manual" ? "delete" : "archive";
        const confirmed = window.confirm(
            action === "delete"
                ? `Delete ${customer.name}? This cannot be undone.`
                : `Archive ${customer.name}? It will no longer appear in the accounts list.`,
        );
        if (!confirmed) return;

        try {
            const response = await fetch(
                `/api/dashboard/customers/${encodeURIComponent(customer.id)}?workspaceId=${encodeURIComponent(getWorkspaceId())}`,
                { method: "DELETE" },
            );
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Account could not be removed.");

            setRowMenuId(null);
            await loadCustomers();
            showToast(action === "delete" ? "Account deleted." : "Account archived.");
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Account could not be removed.");
        }
    }

    return (
        <main className="customersPage">
            {toast && <div className="toast">{toast}</div>}

            <section className="customersContent">
                <header className="customersTopbar">
                    <div>
                        <h1>Accounts</h1>
                        <p>
                            {source === "demo"
                                ? "Demo mode: connect an integration to sync live accounts, or add one manually."
                                : "Synced and manually added accounts are managed together."}
                        </p>
                    </div>

                    <button type="button" className="addAccountButton" onClick={openAddModal}>
                        <Plus size={15} />
                        Add account
                    </button>
                </header>

                <section className="mailStatsGrid">
                    {customerStats.map((stat, index) => {
                        const Icon = customerStatIcons[index] || CalendarClock;
                        return (
                            <button
                                className="mailStatCard"
                                key={stat.label}
                                onClick={() => showToast(`${stat.label}: ${stat.value}`)}
                            >
                                <div className="mailStatIcon"><Icon size={18} /></div>
                                <div>
                                    <p>{stat.label}</p>
                                    <h2>{stat.value}</h2>
                                    <span className={stat.change.includes("-") ? "bad" : "good"}>
                                        {stat.change}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </section>

                <section className="customersPanel">
                    <div className="customerFilters">
                        <div>
                            <input
                                placeholder="Search account"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                            />
                            <select
                                className="sortSelect"
                                value={sortBy}
                                onChange={(event) => setSortBy(event.target.value as SortBy)}
                            >
                                {sortOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="customersTable">
                        <div className="customersTableHead customersTableHeadEnhanced">
                            <span>Account</span>
                            <span>MRR</span>
                            <span>Emails Sent</span>
                            <span>Open Rate</span>
                            <span>Engagement</span>

                            <span>Source</span>
                            <span>Action</span>
                        </div>

                        {loading ? (
                            <div className="accountsEmptyState">Loading accounts…</div>
                        ) : paginatedCustomers.length === 0 ? (
                            <div className="accountsEmptyState">No accounts found.</div>
                        ) : (
                            paginatedCustomers.map((customer) => {
                                const engagementScore = getEngagementScore(customer);
                                return (
                                    <div className="customersTableRow customersTableRowEnhanced" key={customer.id}>
                                        <div className="customerNameCell">
                                            <div className="avatar">{getInitials(customer.name)}</div>
                                            <div>
                                                <strong>{customer.name}</strong>
                                                <p>{customer.company || customer.email}</p>
                                            </div>
                                        </div>

                                        <span className="mrrCell">
                                            {formatMrr(customer)}
                                            {customer.manualMrr !== null && customer.manualMrr !== undefined && (
                                                <small>Manually edited</small>
                                            )}
                                        </span>
                                        <span>{customer.emailsSent}</span>
                                        <span>{customer.openRate}</span>
                                        <span>
                                            <span className={`engagementScoreCircle ${getEngagementClass(engagementScore)}`}>
                                                {engagementScore}
                                            </span>
                                        </span>

                                        <SourceLogo source={customer.source || "manual"} />

                                        <div className="accountActionsCell">
                                            <Link
                                                href={`/dashboard/customers/${encodeURIComponent(customer.id)}`}
                                                className="viewAccountButton"
                                            >
                                                View account
                                            </Link>
                                            <div className="accountRowMenuWrap">
                                                <button
                                                    type="button"
                                                    className="accountRowMenuButton"
                                                    aria-label={`Actions for ${customer.name}`}
                                                    onClick={() => setRowMenuId((current) => current === customer.id ? null : customer.id)}
                                                >
                                                    <MoreHorizontal size={16} />
                                                </button>
                                                {rowMenuId === customer.id && (
                                                    <div className="accountRowMenu">
                                                        <button type="button" onClick={() => openEditModal(customer)}>
                                                            <Pencil size={14} /> Edit account
                                                        </button>
                                                        {customer.source !== "manual" && customer.hasManualOverrides && (
                                                            <button type="button" onClick={() => restoreSyncedValues(customer)}>
                                                                <RotateCcw size={14} /> Restore synced values
                                                            </button>
                                                        )}
                                                        <button type="button" className="dangerMenuItem" onClick={() => removeAccount(customer)}>
                                                            <Trash2 size={14} />
                                                            {customer.source === "manual" ? "Delete account" : "Archive account"}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="customersPagination">
                        <p>
                            Showing {filteredCustomers.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1}
                            -{Math.min(currentPage * ITEMS_PER_PAGE, filteredCustomers.length)} of {filteredCustomers.length} accounts
                        </p>
                        <div>
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</button>
                            <span>Page {currentPage} of {totalPages}</span>
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>Next</button>
                        </div>
                    </div>
                </section>
            </section>

            {modalOpen && (
                <div className="accountModalOverlay" role="dialog" aria-modal="true" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) closeModal();
                }}>
                    <form className="accountModal" onSubmit={submitAccount}>
                        <header className="accountModalHeader">
                            <div>
                                <h2>{editingCustomer ? "Edit account" : "Add account"}</h2>
                                <p>
                                    {editingCustomer?.source && editingCustomer.source !== "manual"
                                        ? "Your changes are saved as manual overrides and will not be replaced by the next sync."
                                        : "Add an account that is not available through an integration."}
                                </p>
                            </div>
                            <button type="button" aria-label="Close" onClick={closeModal}><X size={17} /></button>
                        </header>

                        <div className="accountModalBody">
                            <div className="accountFormGrid">
                                <label><span>Contact name *</span><input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} required /></label>
                                <label><span>Email *</span><input type="email" value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} required /></label>
                                <label><span>Company</span><input value={form.company} onChange={(e) => setForm((v) => ({ ...v, company: e.target.value }))} placeholder="Optional" /></label>
                                <label><span>Website</span><input type="url" value={form.website} onChange={(e) => setForm((v) => ({ ...v, website: e.target.value }))} placeholder="https://example.com" /></label>
                                <label><span>MRR (£)</span><input type="number" min="0" step="0.01" value={form.mrr} onChange={(e) => setForm((v) => ({ ...v, mrr: e.target.value }))} placeholder="1200" /></label>
                                <label><span>Plan</span><input value={form.plan} onChange={(e) => setForm((v) => ({ ...v, plan: e.target.value }))} placeholder="Pro" /></label>
                                <label><span>Status</span><select value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value }))}><option>Active</option><option>At Risk</option><option>Unengaged</option><option>Paused</option></select></label>
                                <label><span>Renewal date</span><input type="date" value={form.renewalDate} onChange={(e) => setForm((v) => ({ ...v, renewalDate: e.target.value }))} /></label>
                                <label className="accountNotesField"><span>Notes</span><textarea value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} placeholder="Optional internal notes" /></label>
                            </div>

                            {editingCustomer?.source && editingCustomer.source !== "manual" && (
                                <div className="syncedValueNotice">
                                    <strong>Synced from {sourceLabel(editingCustomer.source)}</strong>
                                    <span>Manual edits take priority. You can restore the original synced values from the row menu.</span>
                                </div>
                            )}
                        </div>

                        <footer className="accountModalFooter">
                            <button type="button" onClick={closeModal} disabled={saving}>Cancel</button>
                            <button type="submit" className="saveAccountButton" disabled={saving}>{saving ? "Saving…" : editingCustomer ? "Save changes" : "Add account"}</button>
                        </footer>
                    </form>
                </div>
            )}
        </main>
    );
}
