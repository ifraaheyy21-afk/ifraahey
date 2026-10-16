import { customers, type Customer } from "./customersData";

export type CustomerEmailHistoryType =
    | "Onboarding"
    | "Retention"
    | "Expansion"
    | "Education";

export type CustomerEmailOutcome = "Opened" | "Replied" | "Ignored";

export type CustomerEmailHistory = {
    id: string;
    customerId: string;

    subject: string;
    previewText: string;

    type: CustomerEmailHistoryType;

    outcome: "Opened" | "Not Opened" | "Replied";

    reply: boolean;
    replyText?: string;
    replyAt?: string;

    sentAt: string;

    from: string;

    html: string;
};

export type CustomerEmail = {
    customerId: string;
    id: string;

    subject: string;
    reason: string;

    outcome: CustomerEmailOutcome;

    sentAt: string;

    html?: string;
    replyPreview?: string;

    previewText?: string;
    type?: CustomerEmailHistoryType;
    reply?: boolean;
    from?: string;
    starred?: boolean;
    deliveryMethod?: string;
    sendMode?: string;
};

type DemoEmailTemplate = {
    key: string;

    type: CustomerEmailHistoryType;

    dayOffset: number;
    hour: number;
    minute: number;

    subject: (customer: Customer) => string;

    preview: (customer: Customer) => string;

    body: (customer: Customer) => string[];

    outcome: (
        customer: Customer,
        seed: number,
    ) => CustomerEmailOutcome;

    starred?: (
        customer: Customer,
        seed: number,
    ) => boolean;

    replyPreview?: (
        customer: Customer,
    ) => string;

    eyebrow?: (
        customer: Customer,
    ) => string;

    buttonLabel?: string;
};

const DEMO_SENDERS = [
    "Sarah",
    "Alex",
    "Nina",
    "James",
] as const;


/* =========================================================
   HELPERS
   ========================================================= */

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function stableHash(value: string) {
    let hash = 0;

    for (
        let index = 0;
        index < value.length;
        index += 1
    ) {
        hash =
            (
                hash * 31 +
                value.charCodeAt(index)
            ) >>> 0;
    }

    return hash;
}

function getSender(customerId: string) {
    return DEMO_SENDERS[
        stableHash(customerId) %
        DEMO_SENDERS.length
    ];
}

function getFirstName(name: string) {
    return (
        name
            .trim()
            .split(/\s+/)[0] ||
        "there"
    );
}

function formatDemoDate(
    dayOffset: number,
    hour: number,
    minute: number,
) {
    const date = new Date();

    date.setDate(
        date.getDate() - dayOffset,
    );

    date.setHours(
        hour,
        minute,
        0,
        0,
    );

    const time =
        date.toLocaleTimeString(
            "en-GB",
            {
                hour: "2-digit",
                minute: "2-digit",
            },
        );

    if (dayOffset === 0) {
        return `Today · ${time}`;
    }

    if (dayOffset === 1) {
        return `Yesterday · ${time}`;
    }

    return `${date.toLocaleDateString(
        "en-GB",
        {
            day: "2-digit",
            month: "short",
        },
    )} · ${time}`;
}

function toDisplayOutcome(
    outcome: CustomerEmailOutcome,
) {
    return outcome === "Ignored"
        ? "Not Opened"
        : outcome;
}


/* =========================================================
   EMAIL HTML
   ========================================================= */

function buildEmailHtml({
    customer,
    sender,
    eyebrow,
    subject,
    body,
    buttonLabel,
}: {
    customer: Customer;
    sender: string;
    eyebrow: string;
    subject: string;
    body: string[];
    buttonLabel: string;
}) {
    const safeCustomerName =
        escapeHtml(customer.name);

    const safeCompany =
        escapeHtml(customer.company);

    const safeSubject =
        escapeHtml(subject);

    const safeEyebrow =
        escapeHtml(eyebrow);

    const safeSender =
        escapeHtml(sender);

    const safeButtonLabel =
        escapeHtml(buttonLabel);

    const bodyHtml = body
        .map(
            (paragraph) => `
                <p style="
                    margin:0 0 16px;
                    font-size:14px;
                    line-height:1.75;
                    color:#374151;
                ">
                    ${escapeHtml(paragraph)}
                </p>
            `,
        )
        .join("");

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charSet="UTF-8" />
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    />
</head>

<body
    style="
        margin:0;
        background:#f5f6f8;
        font-family:Inter,Arial,sans-serif;
        color:#111827;
    "
>
    <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        style="
            background:#f5f6f8;
            padding:32px 14px;
        "
    >
        <tr>
            <td align="center">

                <table
                    width="100%"
                    cellPadding="0"
                    cellSpacing="0"
                    style="
                        max-width:600px;
                        background:#ffffff;
                        border:1px solid #e5e7eb;
                        border-radius:20px;
                        overflow:hidden;
                        box-shadow:
                            0 8px 28px
                            rgba(15,23,42,0.06);
                    "
                >
                    <tr>
                        <td
                            style="
                                padding:
                                    30px
                                    32px
                                    26px;
                            "
                        >

                            <table
                                width="100%"
                                cellPadding="0"
                                cellSpacing="0"
                                style="
                                    margin-bottom:24px;
                                "
                            >
                                <tr>
                                    <td>
                                        <div
                                            style="
                                                display:inline-block;
                                                width:34px;
                                                height:34px;
                                                border-radius:11px;
                                                background:#111827;
                                                color:#ffffff;
                                                text-align:center;
                                                line-height:34px;
                                                font-size:14px;
                                                font-weight:700;
                                            "
                                        >
                                            C
                                        </div>

                                        <span
                                            style="
                                                display:inline-block;
                                                margin-left:10px;
                                                vertical-align:middle;
                                                font-size:14px;
                                                font-weight:700;
                                                color:#111827;
                                                letter-spacing:-0.02em;
                                            "
                                        >
                                            Cobrai
                                        </span>
                                    </td>
                                </tr>
                            </table>

                            <p
                                style="
                                    margin:0 0 12px;
                                    font-size:13px;
                                    color:#6b7280;
                                "
                            >
                                ${safeEyebrow}
                            </p>

                            <h1
                                style="
                                    margin:0 0 14px;
                                    font-size:27px;
                                    line-height:1.18;
                                    font-weight:700;
                                    letter-spacing:-0.04em;
                                    color:#111827;
                                "
                            >
                                ${safeSubject}
                            </h1>

                            ${bodyHtml}

                            <table
                                width="100%"
                                cellPadding="0"
                                cellSpacing="0"
                                style="
                                    margin:22px 0;
                                    background:#f9fafb;
                                    border:1px solid #eef2f7;
                                    border-radius:16px;
                                "
                            >
                                <tr>
                                    <td
                                        style="
                                            padding:17px 18px;
                                        "
                                    >
                                        <span
                                            style="
                                                display:block;
                                                margin-bottom:6px;
                                                font-size:11px;
                                                font-weight:700;
                                                color:#6b7280;
                                                text-transform:uppercase;
                                                letter-spacing:0.04em;
                                            "
                                        >
                                            Account
                                        </span>

                                        <strong
                                            style="
                                                display:block;
                                                font-size:14px;
                                                color:#111827;
                                                margin-bottom:4px;
                                            "
                                        >
                                            ${safeCompany}
                                        </strong>

                                        <span
                                            style="
                                                font-size:12px;
                                                line-height:1.6;
                                                color:#6b7280;
                                            "
                                        >
                                            ${safeCustomerName}
                                            · Engagement score
                                            ${customer.engagementScore}
                                            · Open rate
                                            ${escapeHtml(customer.openRate)}
                                        </span>
                                    </td>
                                </tr>
                            </table>

                            <a
                                href="#"
                                style="
                                    display:inline-block;
                                    background:#111827;
                                    color:#ffffff;
                                    text-decoration:none;
                                    border-radius:11px;
                                    padding:12px 18px;
                                    font-size:14px;
                                    font-weight:600;
                                "
                            >
                                ${safeButtonLabel}
                            </a>

                            <p
                                style="
                                    margin:28px 0 0;
                                    font-size:13px;
                                    line-height:1.7;
                                    color:#6b7280;
                                "
                            >
                                Best,
                                <br />
                                ${safeSender} from Cobrai
                            </p>

                        </td>
                    </tr>
                </table>

                <p
                    style="
                        margin:18px 0 0;
                        font-size:12px;
                        line-height:1.6;
                        color:#9ca3af;
                    "
                >
                    Cobrai · AI retention intelligence
                    for SaaS teams
                </p>

            </td>
        </tr>
    </table>
</body>
</html>
    `;
}


/* =========================================================
   DEMO EMAIL TEMPLATES

   These are reusable templates.

   They are NOT tied to individual customer IDs.
   Customer-specific content is generated below using the
   existing customersData.ts information.
   ========================================================= */

const demoEmailTemplates:
    DemoEmailTemplate[] = [

        {
            key:
                "weekly-retention-report",

            type:
                "Retention",

            dayOffset:
                0,

            hour:
                15,

            minute:
                20,

            eyebrow:
                () =>
                    "Weekly retention report",

            subject:
                () =>
                    "Your weekly retention report",

            preview:
                (customer) =>
                    `${customer.company} has new retention signals worth reviewing today.`,

            body:
                (customer) => [
                    `Hi ${getFirstName(
                        customer.name,
                    )},`,

                    `Your latest retention report is ready. We reviewed recent engagement across ${customer.company} and highlighted the accounts that need the most attention.`,

                    `Your current engagement score is ${customer.engagementScore}, with an open rate of ${customer.openRate} and a click rate of ${customer.clickRate}.`,

                    "The highest-priority next step is to follow up with accounts showing weaker activity before those signals turn into churn risk.",
                ],

            outcome:
                () =>
                    "Replied",

            starred:
                () =>
                    true,

            replyPreview:
                (customer) =>
                    `Thanks for sending this over. The report was really helpful. We noticed a few accounts that look at risk and would like to understand which actions you recommend we take first for ${customer.company}.`,

            buttonLabel:
                "Review Recommended Actions",
        },


        {
            key:
                "onboarding-checklist",

            type:
                "Onboarding",

            dayOffset:
                1,

            hour:
                10,

            minute:
                5,

            eyebrow:
                () =>
                    "Onboarding",

            subject:
                () =>
                    "Your setup checklist is ready",

            preview:
                () =>
                    "Complete the most important setup steps and get value from your workspace faster.",

            body:
                (customer) => [
                    `Hi ${getFirstName(
                        customer.name,
                    )},`,

                    `We noticed ${customer.company} has started setting up the workspace, so we put together a short checklist to make sure the key pieces are covered.`,

                    "Start by confirming your customer data source, reviewing your account health signals and choosing the first retention workflow you want to automate.",

                    "Once those steps are complete, the dashboard will have enough data to surface useful recommendations.",
                ],

            outcome:
                (customer) =>
                    customer.engagementScore >=
                        45
                        ? "Opened"
                        : "Ignored",

            buttonLabel:
                "Complete Setup",
        },


        {
            key:
                "account-health-follow-up",

            type:
                "Retention",

            dayOffset:
                2,

            hour:
                14,

            minute:
                12,

            eyebrow:
                () =>
                    "Account health",

            subject:
                (customer) =>
                    `A quick check-in on ${customer.company}`,

            preview:
                () =>
                    "A few engagement signals changed this week, so we wanted to check in.",

            body:
                (customer) => [
                    `Hi ${getFirstName(
                        customer.name,
                    )},`,

                    `A few engagement signals changed for ${customer.company} this week, so we wanted to check in before they become a bigger issue.`,

                    `Your current engagement score is ${customer.engagementScore}. We recommend reviewing recent usage, customer replies and any accounts that have stopped opening emails.`,

                    "If you want, we can help turn those signals into a short action plan for your team.",
                ],

            outcome:
                (
                    customer,
                    seed,
                ) =>
                    customer.status ===
                        "At Risk" ||
                        seed % 4 === 0
                        ? "Replied"
                        : "Opened",

            starred:
                (customer) =>
                    customer.status ===
                    "At Risk",

            replyPreview:
                (customer) =>
                    `Yes please. Could you send over the recommended next steps for ${customer.company}, especially for the accounts that have become less active?`,

            buttonLabel:
                "View Account Health",
        },


        {
            key:
                "engagement-insights",

            type:
                "Education",

            dayOffset:
                4,

            hour:
                9,

            minute:
                42,

            eyebrow:
                () =>
                    "Customer engagement insights",

            subject:
                () =>
                    "See what changed this week",

            preview:
                () =>
                    "A quick summary of the engagement patterns worth reviewing this week.",

            body:
                (customer) => [
                    `Hi ${getFirstName(
                        customer.name,
                    )},`,

                    `We pulled together the most useful engagement changes for ${customer.company} this week.`,

                    `Open rate is currently ${customer.openRate}, click rate is ${customer.clickRate}, and your engagement score is ${customer.engagementScore}.`,

                    "The biggest opportunity is to follow up quickly when activity drops and to prioritise customers who are still opening emails but have stopped clicking through.",
                ],

            outcome:
                (customer) =>
                    customer.engagementScore >=
                        30
                        ? "Opened"
                        : "Ignored",

            buttonLabel:
                "View Insights",
        },


        {
            key:
                "automation-opportunity",

            type:
                "Expansion",

            dayOffset:
                6,

            hour:
                11,

            minute:
                14,

            eyebrow:
                () =>
                    "Expansion opportunity",

            subject:
                () =>
                    "Unlock more automation",

            preview:
                () =>
                    "Your current activity suggests you may benefit from more automation capacity.",

            body:
                (customer) => [
                    `Hi ${getFirstName(
                        customer.name,
                    )},`,

                    `${customer.company} is using more of the retention workflow than before, and there may be an opportunity to automate more of the follow-up work.`,

                    `You currently have ${customer.emailsSent} emails in recent activity and an engagement score of ${customer.engagementScore}.`,

                    "A higher plan can help your team automate more journeys, keep follow-ups consistent and reduce manual work.",
                ],

            outcome:
                (customer) =>
                    customer.engagementScore >=
                        55
                        ? "Opened"
                        : "Ignored",

            starred:
                (customer) =>
                    customer.engagementScore >=
                    80,

            buttonLabel:
                "Compare Plans",
        },


        {
            key:
                "monthly-performance-summary",

            type:
                "Education",

            dayOffset:
                9,

            hour:
                8,

            minute:
                45,

            eyebrow:
                () =>
                    "Monthly performance summary",

            subject:
                (customer) =>
                    `${customer.company} performance summary`,

            preview:
                (customer) =>
                    `${customer.emailsSent} emails sent with a ${customer.openRate} open rate.`,

            body:
                (customer) => [
                    `Hi ${getFirstName(
                        customer.name,
                    )},`,

                    `Here is the latest performance summary for ${customer.company}.`,

                    `${customer.emailsSent} emails were sent, with an open rate of ${customer.openRate}, a click rate of ${customer.clickRate}, and an engagement score of ${customer.engagementScore}.`,

                    "The next best step is to focus on the segments where engagement has changed most and test a more targeted follow-up.",
                ],

            outcome:
                (
                    _customer,
                    seed,
                ) =>
                    seed % 3 === 0
                        ? "Ignored"
                        : "Opened",

            buttonLabel:
                "View Performance",
        },


        {
            key:
                "customer-reply-follow-up",

            type:
                "Retention",

            dayOffset:
                12,

            hour:
                16,

            minute:
                4,

            eyebrow:
                () =>
                    "Customer follow-up",

            subject:
                () =>
                    "Recommended next steps",

            preview:
                () =>
                    "Here are the actions we recommend prioritising after your latest customer replies.",

            body:
                (customer) => [
                    `Hi ${getFirstName(
                        customer.name,
                    )},`,

                    "Thanks for the update. Based on the latest replies, we recommend prioritising customers who have shown interest but have not yet taken the next action.",

                    `For ${customer.company}, that means combining a personalised check-in with a clear next step and sending it while the conversation is still active.`,

                    "You can also use the account health view to see which customers should be contacted first.",
                ],

            outcome:
                () =>
                    "Replied",

            replyPreview:
                (customer) =>
                    `That makes sense. Could you help us prioritise which ${customer.company} accounts should receive the follow-up first?`,

            buttonLabel:
                "Open Recommendations",
        },


        {
            key:
                "product-education",

            type:
                "Education",

            dayOffset:
                15,

            hour:
                13,

            minute:
                35,

            eyebrow:
                () =>
                    "Product education",

            subject:
                () =>
                    "A faster way to review customer risk",

            preview:
                () =>
                    "Use account health signals to focus on the customers who need attention first.",

            body:
                (customer) => [
                    `Hi ${getFirstName(
                        customer.name,
                    )},`,

                    "One quick way to save time is to review account health before checking every customer individually.",

                    `For ${customer.company}, the engagement score and recent email activity can help your team spot which customers need attention first.`,

                    "You can then use the recommended action to decide whether to send a check-in, share a resource or escalate the account.",
                ],

            outcome:
                (
                    _customer,
                    seed,
                ) =>
                    seed % 5 === 0
                        ? "Ignored"
                        : "Opened",

            buttonLabel:
                "View Feature",
        },


        {
            key:
                "renewal-readiness",

            type:
                "Retention",

            dayOffset:
                18,

            hour:
                10,

            minute:
                18,

            eyebrow:
                () =>
                    "Renewal readiness",

            subject:
                (customer) =>
                    `${customer.company} renewal readiness`,

            preview:
                () =>
                    "Review engagement and customer health before the next renewal conversation.",

            body:
                (customer) => [
                    `Hi ${getFirstName(
                        customer.name,
                    )},`,

                    `We put together a quick renewal-readiness check for ${customer.company}.`,

                    `The account currently has an engagement score of ${customer.engagementScore}, an open rate of ${customer.openRate}, and a click rate of ${customer.clickRate}.`,

                    "We recommend resolving any open customer concerns early and reinforcing the areas where the account is already seeing value.",
                ],

            outcome:
                (customer) =>
                    customer.status ===
                        "Unengaged"
                        ? "Ignored"
                        : "Opened",

            starred:
                (customer) =>
                    customer.status !==
                    "Active",

            buttonLabel:
                "Review Renewal Signals",
        },


        {
            key:
                "workflow-recommendations",

            type:
                "Onboarding",

            dayOffset:
                21,

            hour:
                12,

            minute:
                26,

            eyebrow:
                () =>
                    "Workflow recommendations",

            subject:
                () =>
                    "3 workflows worth trying next",

            preview:
                () =>
                    "A few practical automation ideas based on your current customer activity.",

            body:
                (customer) => [
                    `Hi ${getFirstName(
                        customer.name,
                    )},`,

                    `Based on ${customer.company}'s recent activity, there are three workflows worth testing next.`,

                    "Start with a low-engagement check-in, a failed-payment recovery flow and a follow-up for customers who open an email but do not take action.",

                    "These workflows cover common retention moments without requiring your team to manage each customer manually.",
                ],

            outcome:
                (
                    _customer,
                    seed,
                ) =>
                    seed % 2 === 0
                        ? "Opened"
                        : "Ignored",

            buttonLabel:
                "Explore Workflows",
        },


        {
            key:
                "retention-playbook",

            type:
                "Retention",

            dayOffset:
                24,

            hour:
                9,

            minute:
                8,

            eyebrow:
                () =>
                    "Retention playbook",

            subject:
                () =>
                    "Your retention playbook is ready",

            preview:
                () =>
                    "A practical action plan for improving engagement and reducing avoidable churn.",

            body:
                (customer) => [
                    `Hi ${getFirstName(
                        customer.name,
                    )},`,

                    `We created a short retention playbook using ${customer.company}'s latest activity.`,

                    "It focuses on early risk detection, personalised follow-up and clearer next actions for accounts that are becoming less engaged.",

                    "The goal is to help your team act earlier while keeping the process simple enough to repeat every week.",
                ],

            outcome:
                (customer) =>
                    customer.status ===
                        "At Risk"
                        ? "Replied"
                        : "Opened",

            replyPreview:
                (customer) =>
                    `Thanks — this is useful. Could you also show us which part of the playbook would have the biggest impact for ${customer.company} right now?`,

            buttonLabel:
                "Open Playbook",
        },


        {
            key:
                "quarterly-growth-opportunity",

            type:
                "Expansion",

            dayOffset:
                27,

            hour:
                14,

            minute:
                52,

            eyebrow:
                () =>
                    "Growth opportunity",

            subject:
                () =>
                    "A growth opportunity worth reviewing",

            preview:
                () =>
                    "Your latest engagement signals suggest there may be room to expand usage.",

            body:
                (customer) => [
                    `Hi ${getFirstName(
                        customer.name,
                    )},`,

                    `We noticed a growth opportunity in ${customer.company}'s recent activity.`,

                    `With an engagement score of ${customer.engagementScore} and ${customer.emailsSent} recent emails, the account may be ready to make more of automation and reporting.`,

                    "If expansion is a priority, we recommend reviewing usage limits and identifying the workflows your team still manages manually.",
                ],

            outcome:
                (customer) =>
                    customer.engagementScore >=
                        65
                        ? "Opened"
                        : "Ignored",

            starred:
                (customer) =>
                    customer.engagementScore >=
                    75,

            buttonLabel:
                "Review Opportunity",
        },
    ];


/* =========================================================
   BUILD DEMO EMAILS FROM EXISTING CUSTOMER DATA
   ========================================================= */

function resolveCustomer(
    customerId: string,
) {
    return customers.find(
        (customer) =>
            customer.id === customerId,
    );
}

function buildCustomerEmails(
    customer: Customer,
): CustomerEmail[] {
    const seed =
        stableHash(customer.id);

    const sender =
        getSender(customer.id);

    return demoEmailTemplates.map(
        (template, index) => {
            const subject =
                template.subject(customer);

            const preview =
                template.preview(customer);

            const outcome =
                template.outcome(
                    customer,
                    seed + index,
                );

            const replyPreview =
                outcome === "Replied"
                    ? (
                        template.replyPreview?.(
                            customer,
                        ) ??
                        `Thanks ${sender}. This is helpful. Could you send us the recommended next steps for ${customer.company}?`
                    )
                    : undefined;

            return {
                customerId:
                    customer.id,

                id:
                    `${customer.id.replace(
                        /[^a-zA-Z0-9_-]/g,
                        "",
                    )
                    }-${template.key}`,

                subject,

                reason:
                    preview,

                previewText:
                    preview,

                type:
                    template.type,

                outcome,

                reply:
                    outcome ===
                    "Replied",

                sentAt:
                    formatDemoDate(
                        template.dayOffset,
                        template.hour,
                        template.minute,
                    ),

                from:
                    sender,

                starred:
                    template.starred
                        ? template.starred(
                            customer,
                            seed + index,
                        )
                        : false,

                deliveryMethod:
                    index % 3 === 0
                        ? "Automated"
                        : "Manual",

                sendMode:
                    index % 3 === 0
                        ? "automated"
                        : "manual",

                html:
                    buildEmailHtml({
                        customer,

                        sender,

                        eyebrow:
                            template.eyebrow?.(
                                customer,
                            ) ??
                            template.type,

                        subject,

                        body:
                            template.body(
                                customer,
                            ),

                        buttonLabel:
                            template.buttonLabel ??
                            "View account",
                    }),

                replyPreview,
            };
        },
    );
}


/* =========================================================
   DEFAULT DEMO EXPORTS

   Kept for compatibility with any other existing page that
   directly imports customerEmails/customerEmailHistory.
   ========================================================= */

function buildFallbackDemoCustomer():
    Customer {
    const firstCustomer =
        customers[0];

    if (firstCustomer) {
        return firstCustomer;
    }

    return {
        id:
            "demo",

        name:
            "Demo Customer",

        company:
            "Demo Workspace",

        email:
            "demo@example.com",

        mrr:
            0,

        emailsSent:
            0,

        openRate:
            "0%",

        clickRate:
            "0%",

        engagementScore:
            0,

        status:
            "Unengaged",

        lastActivity:
            "No recent activity",
    };
}

const defaultDemoCustomer =
    buildFallbackDemoCustomer();

export const customerEmails:
    CustomerEmail[] =
    buildCustomerEmails(
        defaultDemoCustomer,
    );

export const customerEmailHistory:
    CustomerEmailHistory[] =
    customerEmails.map(
        (email) => ({
            id:
                email.id,

            customerId:
                email.customerId,

            subject:
                email.subject,

            previewText:
                email.reason,

            type:
                email.type ??
                "Retention",

            outcome:
                toDisplayOutcome(
                    email.outcome,
                ),

            reply:
                Boolean(
                    email.reply,
                ),

            replyText:
                email.replyPreview,

            replyAt:
                email.outcome ===
                    "Replied"
                    ? email.sentAt
                    : undefined,

            sentAt:
                email.sentAt,

            from:
                email.from ??
                "Team",

            html:
                email.html ??
                "",
        }),
    );


/* =========================================================
   PUBLIC HELPERS USED BY PROFILE / EMAIL PAGES
   ========================================================= */

export function getCustomerEmailsById(
    customerId: string,
): CustomerEmail[] {
    const customer =
        resolveCustomer(customerId);

    if (customer) {
        return buildCustomerEmails(
            customer,
        );
    }

    /*
     * Keep the existing fallback behaviour for demo profiles
     * whose local ID is not present in customersData.ts.
     *
     * We still generate unique IDs so React rows never share
     * keys between profiles.
     */

    const safeCustomerId =
        customerId.replace(
            /[^a-zA-Z0-9_-]/g,
            "",
        );

    return customerEmails.map(
        (email) => ({
            ...email,

            customerId,

            id:
                `${safeCustomerId ||
                "demo"
                }-${email.id}`,
        }),
    );
}

export function getCustomerEmailHistoryById(
    customerId: string,
): CustomerEmailHistory[] {
    return getCustomerEmailsById(
        customerId,
    ).map(
        (email) => ({
            id:
                email.id,

            customerId:
                email.customerId,

            subject:
                email.subject,

            previewText:
                email.reason,

            type:
                email.type ??
                "Retention",

            outcome:
                toDisplayOutcome(
                    email.outcome,
                ),

            reply:
                Boolean(
                    email.reply,
                ),

            replyText:
                email.replyPreview,

            replyAt:
                email.outcome ===
                    "Replied"
                    ? email.sentAt
                    : undefined,

            sentAt:
                email.sentAt,

            from:
                email.from ??
                "Team",

            html:
                email.html ??
                "",
        }),
    );
}