"use client";

import type { GeneratedEmail } from "../lib/types";
import { Copy } from "lucide-react";

type Props = {
    emails: GeneratedEmail[];
};

export default function EmailResults({ emails }: Props) {
    function copyEmail(subject: string, body: string) {
        navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    }

    if (!emails.length) return null;

    return (
        <div className="resultsSection">
            <div className="sectionHeader">
                <h2>Generated email queue</h2>
                <p>Review, copy, and send each personalised email.</p>
            </div>

            <div className="emailGrid">
                {emails.map((email, index) => (
                    <div className="emailCard" key={index}>
                        <div className="emailTop">
                            <div>
                                <h3>{email.customerName || "Unknown customer"}</h3>
                                <p>{email.company}</p>
                            </div>

                            <span className={`riskBadge ${email.riskLevel.toLowerCase()}`}>
                                {email.riskLevel} risk
                            </span>
                        </div>

                        <div className="meta">
                            <p>
                                <strong>Email:</strong> {email.email}
                            </p>
                            <p>
                                <strong>Segment:</strong> {email.segment}
                            </p>
                            <p>
                                <strong>Reason:</strong> {email.reason}
                            </p>
                        </div>

                        <div className="emailPreview">
                            <p className="subject">Subject: {email.subject}</p>
                            <p>{email.body}</p>
                        </div>

                        <button
                            className="copyButton"
                            onClick={() => copyEmail(email.subject, email.body)}
                        >
                            <Copy size={16} />
                            Copy email
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}