"use client";

import { useState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";

import pageStyles from "./inbox-page.module.css";
import styles from "./save-account.module.css";

// Free mailbox domains say nothing about the company, so leave it blank.
const PERSONAL_DOMAINS = new Set([
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
    "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
]);

function guessName(email: string, name: string) {
    if (name && name.toLowerCase() !== email.toLowerCase()) return name;
    return email.split("@")[0]
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(" ");
}

function guessCompany(email: string, company: string | null) {
    if (company) return company;
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    if (!domain || PERSONAL_DOMAINS.has(domain)) return "";
    const root = domain.split(".")[0];
    return root ? root[0].toUpperCase() + root.slice(1) : "";
}

type Props = {
    email: string;
    name: string;
    company: string | null;
    onSaved: () => void;
    onDismiss: () => void;
};

/** Offers to save an emailed address that isn't an account yet. */
export default function SaveAccountPrompt({ email, name, company, onSaved, onDismiss }: Props) {
    const [open, setOpen] = useState(false);
    const [accountName, setAccountName] = useState(() => guessName(email, name));
    const [accountCompany, setAccountCompany] = useState(() => guessCompany(email, company));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const save = async () => {
        if (!accountName.trim() || !accountCompany.trim()) {
            setError("Add a name and company to save this account.");
            return;
        }
        try {
            setSaving(true);
            setError("");
            const response = await fetch("/api/dashboard/customers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: accountName.trim(), email, company: accountCompany.trim(), mrr: 0 }),
            });
            const result = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) throw new Error(result.error || "The account could not be saved.");
            onSaved();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "The account could not be saved.");
        } finally {
            setSaving(false);
        }
    };

    if (!open) {
        return (
            <div className={styles.prompt}>
                <span className={styles.copy}>{email} isn’t saved as an account.</span>
                <button type="button" className={pageStyles.ghostButton} onClick={() => setOpen(true)}>
                    <UserPlus size={14} />
                    Save account
                </button>
                <button type="button" className={pageStyles.iconButton} aria-label="Dismiss" onClick={onDismiss}>
                    <X size={14} />
                </button>
            </div>
        );
    }

    return (
        <form
            className={styles.form}
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <label className={styles.field}>
                <span>Name</span>
                <input className={pageStyles.fieldInput} value={accountName} onChange={(event) => setAccountName(event.target.value)} autoFocus />
            </label>
            <label className={styles.field}>
                <span>Company</span>
                <input className={pageStyles.fieldInput} value={accountCompany} onChange={(event) => setAccountCompany(event.target.value)} placeholder="Company name" />
            </label>
            <div className={styles.actions}>
                {error && <p className={pageStyles.aiError} role="alert">{error}</p>}
                <span className={pageStyles.spacer} />
                <button type="button" className={pageStyles.ghostButton} onClick={() => setOpen(false)} disabled={saving}>
                    Cancel
                </button>
                <button type="submit" className={pageStyles.primaryButton} disabled={saving}>
                    {saving ? <Loader2 size={14} className={pageStyles.spinning} /> : <UserPlus size={14} />}
                    {saving ? "Saving…" : "Save account"}
                </button>
            </div>
        </form>
    );
}
