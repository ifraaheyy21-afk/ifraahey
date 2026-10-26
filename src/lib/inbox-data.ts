export type InboxFolder =

    | "inbox"

    | "starred"

    | "sent"

    | "scheduled"

    | "drafts"

    | "deleted"

    | "failed"

    | "archived";

export type InboxMessageDirection = "inbound" | "outbound";

/** Where a conversation happens. Email today; messaging apps plug in later. */
export type InboxChannel = "email" | "whatsapp" | "telegram" | "instagram" | "messenger";

export const CHAT_CHANNELS: InboxChannel[] = ["whatsapp", "telegram", "instagram", "messenger"];

export function isChatChannel(channel: InboxChannel | undefined) {
    return Boolean(channel && channel !== "email");
}

export type InboxMessageStatus =

    | "received"

    | "scheduled"

    | "sent"

    | "delivered"

    | "opened"

    | "clicked"

    | "replied"

    | "failed";

export type InboxAttachment = {

    id: string;

    fileName: string;

    mimeType: string;

    sizeLabel: string;


    /** A local preview link, for files added in the browser. */
    url?: string;

    /** A sent file that was kept, so it can be opened again. */
    stored?: boolean;

};

export type InboxMessage = {

    id: string;

    direction: InboxMessageDirection;

    fromName: string;

    fromEmail: string;

    toName: string;

    toEmail: string;

    sentAt: string;

    status: InboxMessageStatus;

    html: string | null;

    plainText: string;

    attachments?: InboxAttachment[];

    // RFC 5322 Message-ID of the delivered email, when the provider gave one.
    // Replies use it for In-Reply-To/References.
    providerMessageId?: string;
    /** The sender failed DMARC, so this message could be forged. */
    authenticationFailed?: boolean;
};

export type InboxThread = {

    id: string;
    /** A sample conversation; actions on it stay in the browser. */
    demo?: boolean;

    /** Set on a saved draft in the Drafts folder; opening it resumes editing. */
    draft?: {
        id: string;
        /** The conversation this replies to; null for a new email. */
        threadId: string | null;
        toEmail: string | null;
        toName: string | null;
        subject: string;
        html: string;
    };

    /** Missing means email. */
    channel?: InboxChannel;

    /** Phone number or @handle for chat channels. */
    customerHandle?: string;

    /** Optional profile details shown beside chats. */
    customerTitle?: string;
    customerLocation?: string;
    /** IANA time zone, e.g. "Europe/London", for the contact's local time. */
    customerTimeZone?: string;
    customerLanguages?: string[];

    customerId: string | null;

    customerName: string;

    customerEmail: string;

    customerCompany: string | null;

    subject: string;

    preview: string;

    folder: InboxFolder;

    labels: string[];

    unread: boolean;

    starred: boolean;

    archived: boolean;

    lastMessageAt: string;

    messages: InboxMessage[];

};

export type InboxFolderCount = {

    folder: InboxFolder;

    count: number;

};

export type InboxPayload = {

    workspaceId: string;

    folders: InboxFolderCount[];

    threads: InboxThread[];

};

export const DEMO_INBOX_WORKSPACE_ID = "demo-workspace";

function demoIso(minutesFromNow: number) {

    return new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString();

}

const demoThreads: InboxThread[] = [

    {

        id: "thread_recent_sent_invoice",

        customerId: "customer_cosmos",

        customerName: "Jane Holmes",

        customerEmail: "jane@cosmos.co",

        customerCompany: "Cosmos",

        subject: "Action required: unpaid invoice",

        preview:

            "A friendly reminder that invoice INV-2048 is now due for payment.",

        folder: "sent",

        labels: ["Delivered", "Billing"],

        unread: false,

        starred: true,

        archived: false,

        lastMessageAt: demoIso(-12),

        messages: [

            {

                id: "message_recent_sent_invoice_1",

                direction: "outbound",

                fromName: "Cobrai Billing",

                fromEmail: "billing@cobrai.app",

                toName: "Jane Holmes",

                toEmail: "jane@cosmos.co",

                sentAt: demoIso(-12),

                status: "delivered",

                html: null,

                plainText:

                    "Hi Jane,\n\nJust a quick note on invoice INV-2048, which fell due yesterday. I’ve attached a fresh copy of the invoice along with the account summary so your finance team has everything in one place.\n\nIf payment has already been arranged, you can ignore this message. Otherwise, the secure billing link below will take you straight to the outstanding invoice. If there’s a PO number or billing contact we should add before it’s processed, just reply here and I’ll update it.\n\nThanks,\nCobrai Billing",

                attachments: [

                    {

                        id: "attachment_recent_invoice_pdf",

                        fileName: "Invoice-INV-2048.pdf",

                        mimeType: "application/pdf",

                        sizeLabel: "1.2 MB",

                    },

                    {

                        id: "attachment_recent_invoice_image",

                        fileName: "Account-summary.jpg",

                        mimeType: "image/jpeg",

                        sizeLabel: "638 KB",

                    },

                    {

                        id: "attachment_recent_invoice_link",

                        fileName: "https\://billing.cobrai.app/invoices/INV-2048",

                        mimeType: "text/uri-list",

                        sizeLabel: "Link",

                    },

                ],

            },

        ],

    },

    {

        id: "thread_recent_received_contract",

        customerId: "customer_harbour_point",

        customerName: "Aisha Rahman",

        customerEmail: "aisha@harbourpoint.io",

        customerCompany: "Harbour Point",

        subject: "Signed renewal agreement",

        preview:

            "The agreement has been signed by finance. Please confirm the new term is active.",

        folder: "inbox",

        labels: ["Received", "Renewal"],

        unread: true,

        starred: true,

        archived: false,

        lastMessageAt: demoIso(-28),

        messages: [

            {

                id: "message_recent_received_contract_1",

                direction: "inbound",

                fromName: "Aisha Rahman",

                fromEmail: "aisha@harbourpoint.io",

                toName: "Cobrai Team",

                toEmail: "success@cobrai.app",

                sentAt: demoIso(-28),

                status: "received",

                html: null,

                plainText:

                    "Hi team,\n\nFinance has now signed off the renewal agreement and I’ve attached the executed copy for your records.\n\nCould you confirm that the new 12-month term is active from 1 September and that our existing users, workflows and reporting history will carry over without any interruption? Our procurement team is closing the file this afternoon, so a quick confirmation would be really helpful.\n\nThanks again for making the renewal straightforward.\n\nBest,\nAisha",

                attachments: [

                    {

                        id: "attachment_recent_contract",

                        fileName: "Harbour-Point-Renewal.pdf",

                        mimeType: "application/pdf",

                        sizeLabel: "860 KB",

                    },

                ],

            },

        ],

    },

    {

        id: "thread_recent_sent_health_report",

        customerId: "customer_altitude",

        customerName: "Noah Williams",

        customerEmail: "noah@altitudehq.com",

        customerCompany: "Altitude HQ",

        subject: "Your account health report",

        preview:

            "Usage is healthy overall, with two opportunities to improve team adoption.",

        folder: "sent",

        labels: ["Opened", "Health report"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: demoIso(-47),

        messages: [

            {

                id: "message_recent_sent_health_report_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Noah Williams",

                toEmail: "noah@altitudehq.com",

                sentAt: demoIso(-47),

                status: "opened",

                html: null,

                plainText:

                    "Hi Noah,\n\nI’ve finished this month’s account health review for Altitude HQ. Overall usage is in a good place: weekly active users are up, reporting activity is steady, and your core customer-success team is still engaging consistently.\n\nThere are two areas worth watching. Three invited users still haven’t completed setup, and adoption of the renewal-risk view is lower than the rest of the workspace. I’ve attached the full health report and the engagement export so you can see the account-level detail.\n\nIf it helps, I can also turn this into a short action plan for your team meeting next week.\n\nBest,\nThe Cobrai Team",

                attachments: [

                    {

                        id: "attachment_recent_health_pdf",

                        fileName: "Altitude-Health-Report.pdf",

                        mimeType: "application/pdf",

                        sizeLabel: "1.5 MB",

                    },

                    {

                        id: "attachment_recent_health_csv",

                        fileName: "engagement-export.csv",

                        mimeType: "text/csv",

                        sizeLabel: "94 KB",

                    },

                ],

            },

        ],

    },

    {

        id: "thread_recent_received_screenshot",

        customerId: "customer_frameflow",

        customerName: "Sofia Martins",

        customerEmail: "sofia@frameflow.app",

        customerCompany: "FrameFlow",

        subject: "Dashboard totals look different",

        preview:

            "The dashboard total does not match the CSV export from this morning.",

        folder: "inbox",

        labels: ["Support", "Reporting"],

        unread: true,

        starred: false,

        archived: false,

        lastMessageAt: demoIso(-73),

        messages: [

            {

                id: "message_recent_received_screenshot_1",

                direction: "inbound",

                fromName: "Sofia Martins",

                fromEmail: "sofia@frameflow.app",

                toName: "Cobrai Team",

                toEmail: "success@cobrai.app",

                sentAt: demoIso(-73),

                status: "received",

                html: null,

                plainText:

                    "Hi,\n\nI think we may have found a reporting mismatch this morning. The dashboard is showing 184 active accounts, but the CSV export generated at 09:12 contains 179.\n\nI’ve attached a screenshot of the dashboard total and the export we downloaded. We haven’t changed any filters today, so I’m not sure whether the difference is caused by refresh timing or account status logic.\n\nCould someone take a look before our 2pm ops review? We’re using these numbers in the weekly report.\n\nThanks,\nSofia",

                attachments: [

                    {

                        id: "attachment_recent_dashboard_image",

                        fileName: "dashboard-total.png",

                        mimeType: "image/png",

                        sizeLabel: "712 KB",

                    },

                    {

                        id: "attachment_recent_dashboard_csv",

                        fileName: "accounts-export.csv",

                        mimeType: "text/csv",

                        sizeLabel: "118 KB",

                    },

                ],

            },

        ],

    },

    {

        id: "thread_recent_sent_success_plan",

        customerId: "customer_grainlabs",

        customerName: "Ethan Clarke",

        customerEmail: "ethan@grainlabs.co",

        customerCompany: "Grain Labs",

        subject: "Your 30-day success plan",

        preview:

            "Here is the agreed success plan with milestones for reporting and automation.",

        folder: "sent",

        labels: ["Delivered", "Onboarding"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: demoIso(-126),

        messages: [

            {

                id: "message_recent_sent_success_plan_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Ethan Clarke",

                toEmail: "ethan@grainlabs.co",

                sentAt: demoIso(-126),

                status: "delivered",

                html: null,

                plainText:

                    "Hi Ethan,\n\nThanks again for the onboarding call earlier. I’ve attached the 30-day success plan we agreed so everyone has the same milestones and owners.\n\nFor week one, the priority is completing customer segmentation and validating the account data. Week two moves into the first retention workflows, followed by reporting and optimisation once we have enough activity to review. I’ve also included the checkpoints we’ll use to measure adoption rather than just setup completion.\n\nYou don’t need to tackle everything at once. If your team completes the first two milestones this week, you’ll be in a strong position for the rest of the rollout.\n\nBest,\nThe Cobrai Team",

                attachments: [

                    {

                        id: "attachment_recent_success_plan",

                        fileName: "Grain-Labs-Success-Plan.pdf",

                        mimeType: "application/pdf",

                        sizeLabel: "980 KB",

                    },

                ],

            },

        ],

    },

    {

        id: "thread_recent_received_feedback",

        customerId: "customer_bluepeak",

        customerName: "Grace Taylor",

        customerEmail: "grace@bluepeak.ai",

        customerCompany: "BluePeak",

        subject: "Feedback from our customer success team",

        preview:

            "The team has shared feedback on alerts, segments and the weekly summary.",

        folder: "inbox",

        labels: ["Product feedback", "Received"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: demoIso(-188),

        messages: [

            {

                id: "message_recent_received_feedback_1",

                direction: "inbound",

                fromName: "Grace Taylor",

                fromEmail: "grace@bluepeak.ai",

                toName: "Cobrai Team",

                toEmail: "success@cobrai.app",

                sentAt: demoIso(-188),

                status: "received",

                html: null,

                plainText:

                    "Hi team,\n\nOur customer success team spent some time testing the new workflow this afternoon and I’ve attached their consolidated notes.\n\nThe response was positive overall, especially around the account segments and the clearer weekly summary. The main requests are more control over alert frequency, the ability to exclude internal/test accounts, and a quicker way to see why an account moved into a higher-risk segment.\n\nNone of these are blockers for us, but they would make the day-to-day workflow much smoother for the team. Happy to talk through the notes if anything needs clarification.\n\nBest,\nGrace",

                attachments: [

                    {

                        id: "attachment_recent_feedback_doc",

                        fileName: "BluePeak-CS-Feedback.docx",

                        mimeType:

                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

                        sizeLabel: "462 KB",

                    },

                ],

            },

        ],

    },

    {

        id: "thread_recent_sent_training",

        customerId: "customer_lanecloud",

        customerName: "Isaac Morgan",

        customerEmail: "isaac@lanecloud.io",

        customerCompany: "LaneCloud",

        subject: "Recording from today’s training",

        preview:

            "The training recording and implementation checklist are ready.",

        folder: "sent",

        labels: ["Clicked", "Training"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: demoIso(-255),

        messages: [

            {

                id: "message_recent_sent_training_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Isaac Morgan",

                toEmail: "isaac@lanecloud.io",

                sentAt: demoIso(-255),

                status: "clicked",

                html: null,

                plainText:

                    "Hi Isaac,\n\nThanks to everyone who joined today’s training session. I’ve added the recording link below and attached the implementation checklist we worked through together.\n\nThe first 20 minutes cover workspace setup and data checks, then we move into segments, automated emails and the reporting views your CS managers will use each week. I’ve also marked the three items your team still needs to complete before the workflow goes live.\n\nFeel free to share the recording internally. If any questions come up while the team works through the checklist, reply here and we can pick them up.\n\nBest,\nThe Cobrai Team",

                attachments: [

                    {

                        id: "attachment_recent_training_link",

                        fileName: "https\://video.cobrai.app/lanecloud-training",

                        mimeType: "text/uri-list",

                        sizeLabel: "Link",

                    },

                    {

                        id: "attachment_recent_training_pdf",

                        fileName: "Implementation-Checklist.pdf",

                        mimeType: "application/pdf",

                        sizeLabel: "540 KB",

                    },

                ],

            },

        ],

    },

    {

        id: "thread_recent_received_invoice_copy",

        customerId: "customer_lumina",

        customerName: "Mia Thompson",

        customerEmail: "mia@luminaops.com",

        customerCompany: "LuminaOps",

        subject: "Could you resend our June invoice?",

        preview:

            "Finance cannot locate the June invoice. Could you send another copy?",

        folder: "inbox",

        labels: ["Billing", "Received"],

        unread: true,

        starred: false,

        archived: false,

        lastMessageAt: demoIso(-322),

        messages: [

            {

                id: "message_recent_received_invoice_copy_1",

                direction: "inbound",

                fromName: "Mia Thompson",

                fromEmail: "mia@luminaops.com",

                toName: "Cobrai Billing",

                toEmail: "billing@cobrai.app",

                sentAt: demoIso(-322),

                status: "received",

                html: null,

                plainText:

                    "Hi,\n\nCould you resend our June invoice when you get a moment? Finance can see the payment in the bank feed but can’t find the original PDF in the shared mailbox.\n\nIf possible, could you also make sure the invoice shows LuminaOps Ltd and our current billing address? We’re closing the month-end pack tomorrow morning.\n\nThanks for your help,\nMia",

            },

        ],

    },

    {

        id: "thread_cedarworks_payment",

        customerId: "customer_cedarworks",

        customerName: "Sarah Mitchell",

        customerEmail: "sarah@cedarworks.io",

        customerCompany: "CedarWorks",

        subject: "Payment method updated",

        preview:

            "Thanks for the reminder. We updated the card this morning and the payment has now gone through.",

        folder: "inbox",

        labels: ["Replied", "Payment recovered"],

        unread: true,

        starred: true,

        archived: false,

        lastMessageAt: "2026-07-14T13:34:00.000Z",

        messages: [

            {

                id: "message_cedarworks_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Sarah Mitchell",

                toEmail: "sarah@cedarworks.io",

                sentAt: "2026-07-14T09:10:00.000Z",

                status: "clicked",

                html: null,

                plainText:

                    "Hi Sarah,\n\nWe noticed CedarWorks’ latest subscription payment didn’t complete this morning. It looks like the card issuer declined the first attempt, so we wanted to flag it before it affects access for your team.\n\nYou can update or confirm the payment method from the billing page. Once that’s done, the invoice will retry automatically and you won’t need to recreate any of your existing workflows.\n\nIf finance is already handling it, no problem — just let me know and I can keep an eye on the retry.\n\nBest,\nThe Cobrai Team",

            },

            {

                id: "message_cedarworks_2",

                direction: "inbound",

                fromName: "Sarah Mitchell",

                fromEmail: "sarah@cedarworks.io",

                toName: "Cobrai Team",

                toEmail: "success@cobrai.app",

                sentAt: "2026-07-14T13:34:00.000Z",

                status: "received",

                html: null,

                plainText:

                    "Hi,\n\nThanks for the heads-up. Finance updated the card just after lunch and I can now see the payment has gone through successfully.\n\nEverything on our side looks normal again, so no further action needed. Appreciate you catching it before the team lost access.\n\nSarah",

            },

        ],

    },

    {

        id: "thread_kitelabs_renewal",

        customerId: "customer_kite_labs",

        customerName: "Maya Chen",

        customerEmail: "maya@kitelabs.dev",

        customerCompany: "Kite Labs",

        subject: "Re: Planning ahead for your renewal",

        preview:

            "Thursday at 2:30 works. Please include our Head of Product, James.",

        folder: "inbox",

        labels: ["Replied", "Renewal"],

        unread: true,

        starred: true,

        archived: false,

        lastMessageAt: "2026-07-14T12:48:00.000Z",

        messages: [

            {

                id: "message_kitelabs_renewal_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Maya Chen",

                toEmail: "maya@kitelabs.dev",

                sentAt: "2026-07-14T10:20:00.000Z",

                status: "opened",

                html: null,

                plainText:

                    "Hi Maya,\n\nKite Labs’ renewal is coming up next month, so I wanted to check in before we get too close to the date. Your team is using the platform consistently, but there are a couple of reporting features that haven’t been adopted as widely as the core retention workflows.\n\nWould a 20-minute success review this week be useful? I can walk through current usage, the value you’ve generated so far, and the reporting questions your product team raised previously.\n\nI’m free Thursday afternoon if that works for you.\n\nBest,\nThe Cobrai Team",

            },

            {

                id: "message_kitelabs_renewal_2",

                direction: "inbound",

                fromName: "Maya Chen",

                fromEmail: "maya@kitelabs.dev",

                toName: "Cobrai Team",

                toEmail: "success@cobrai.app",

                sentAt: "2026-07-14T12:48:00.000Z",

                status: "received",

                html: null,

                plainText:

                    "Hi,\n\nThursday at 2:30 works well. Please include our Head of Product, James, as he has a few questions about the reporting views and how the account-level risk scores are calculated.\n\nIt would also be useful to spend a few minutes on the renewal options so we can take a recommendation into our planning meeting on Friday.\n\nThanks,\nMaya",

            },

        ],

    },

    {

        id: "thread_novapay_reporting",

        customerId: "customer_novapay",

        customerName: "Daniel Okoro",

        customerEmail: "daniel@novapay.co",

        customerCompany: "NovaPay",

        subject: "Can we export the monthly report?",

        preview:

            "Is there a way to export the retention report as CSV for our board pack?",

        folder: "inbox",

        labels: ["Product question", "High value"],

        unread: true,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-14T11:56:00.000Z",

        messages: [

            {

                id: "message_novapay_reporting_1",

                direction: "inbound",

                fromName: "Daniel Okoro",

                fromEmail: "daniel@novapay.co",

                toName: "Cobrai Team",

                toEmail: "success@cobrai.app",

                sentAt: "2026-07-14T11:56:00.000Z",

                status: "received",

                html: null,

                plainText:

                    "Hi team,\n\nIs there a way to export the monthly retention report as CSV for our board pack?\n\nWe need the account-level risk status, MRR at risk, main churn signal and any recovery action taken during the month. Ideally we’d like one file rather than exporting each view separately.\n\nOur board pack is due on Friday, so if there’s an existing export or workaround we can use now, please point me in the right direction.\n\nThanks,\nDaniel",

            },

        ],

    },

    {

        id: "thread_orbitstack_usage",

        customerId: "customer_orbit",

        customerName: "Liam Roberts",

        customerEmail: "liam@orbitstack.com",

        customerCompany: "OrbitStack",

        subject: "Re: Your team’s recent usage",

        preview:

            "We have been migrating our data warehouse, so usage should return to normal next week.",

        folder: "inbox",

        labels: ["Replied", "Usage risk"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-14T10:41:00.000Z",

        messages: [

            {

                id: "message_orbitstack_usage_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Liam Roberts",

                toEmail: "liam@orbitstack.com",

                sentAt: "2026-07-14T08:42:00.000Z",

                status: "opened",

                html: null,

                plainText:

                    "Hi Liam,\n\nI noticed reporting activity at OrbitStack has dropped quite sharply over the last two weeks, particularly among the operations users who were previously active every few days.\n\nI wanted to check whether this is expected or whether the team has hit a blocker. If priorities have shifted, that’s completely fine — I’d just rather understand the context before the account is treated as a genuine adoption risk.\n\nHappy to help with a quick reset session if useful.\n\nBest,\nThe Cobrai Team",

            },

            {

                id: "message_orbitstack_usage_2",

                direction: "inbound",

                fromName: "Liam Roberts",

                fromEmail: "liam@orbitstack.com",

                toName: "Cobrai Team",

                toEmail: "success@cobrai.app",

                sentAt: "2026-07-14T10:41:00.000Z",

                status: "received",

                html: null,

                plainText:

                    "Hi,\n\nGood catch. We’re in the middle of migrating our data warehouse and most of the ops team has been working from temporary reports, so they haven’t needed to log in as often.\n\nThe migration should finish early next week and normal usage should pick back up after that. Nothing is wrong with the platform on our side.\n\nThanks for checking in,\nLiam",

            },

        ],

    },

    {

        id: "thread_pulsegrid_seats",

        customerId: "customer_pulsegrid",

        customerName: "Priya Shah",

        customerEmail: "priya@pulsegrid.ai",

        customerCompany: "PulseGrid",

        subject: "Adding five more seats",

        preview:

            "Could you confirm the new monthly total before we add the team?",

        folder: "inbox",

        labels: ["Expansion", "Pricing"],

        unread: true,

        starred: true,

        archived: false,

        lastMessageAt: "2026-07-14T09:52:00.000Z",

        messages: [

            {

                id: "message_pulsegrid_seats_1",

                direction: "inbound",

                fromName: "Priya Shah",

                fromEmail: "priya@pulsegrid.ai",

                toName: "Cobrai Team",

                toEmail: "success@cobrai.app",

                sentAt: "2026-07-14T09:52:00.000Z",

                status: "received",

                html: null,

                plainText:

                    "Hi team,\n\nWe’re planning to add five more customer success managers this month and I wanted to confirm the pricing before we invite them.\n\nCould you send me the new monthly total, including our current plan and the additional seats? If there’s a better tier for the size we’re moving to, feel free to include that as well.\n\nI’m hoping to get approval from finance by Wednesday.\n\nThanks,\nPriya",

            },

        ],

    },

    {

        id: "thread_brightpath_help",

        customerId: "customer_brightpath",

        customerName: "Elena Morris",

        customerEmail: "elena@brightpathhq.com",

        customerCompany: "BrightPath",

        subject: "The automation did not trigger",

        preview:

            "The renewal workflow was enabled, but no email was created for the account.",

        folder: "inbox",

        labels: ["Support", "Automation"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-13T16:26:00.000Z",

        messages: [

            {

                id: "message_brightpath_help_1",

                direction: "inbound",

                fromName: "Elena Morris",

                fromEmail: "elena@brightpathhq.com",

                toName: "Cobrai Team",

                toEmail: "success@cobrai.app",

                sentAt: "2026-07-13T16:26:00.000Z",

                status: "received",

                html: null,

                plainText:

                    "Hi,\n\nThe renewal workflow for one of our accounts was enabled yesterday, but no email was created even though the renewal date is now 12 days away.\n\nI’ve attached a screenshot of the workflow settings. The account matches the segment rules and I can see the trigger date in the profile, so I’m not sure what we’ve missed.\n\nCould someone check this before tomorrow morning? We don’t want to manually send it and then have the automation fire later as a duplicate.\n\nThanks,\nElena",

                attachments: [

                    {

                        id: "attachment_brightpath_screenshot",

                        fileName: "workflow-settings.png",

                        mimeType: "image/png",

                        sizeLabel: "684 KB",

                    },

                ],

            },

        ],

    },

    {

        id: "thread_novapay_onboarding",

        customerId: "customer_novapay",

        customerName: "Daniel Okoro",

        customerEmail: "daniel@novapay.co",

        customerCompany: "NovaPay",

        subject: "Your onboarding walkthrough",

        preview:

            "Here is the walkthrough covering reporting, segments and automated email actions.",

        folder: "sent",

        labels: ["Delivered", "Onboarding"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-14T11:18:00.000Z",

        messages: [

            {

                id: "message_novapay_onboarding_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Daniel Okoro",

                toEmail: "daniel@novapay.co",

                sentAt: "2026-07-14T11:18:00.000Z",

                status: "delivered",

                html: null,

                plainText:

                    "Hi Daniel,\n\nFollowing our setup call, I’ve attached the NovaPay onboarding guide we discussed. It covers the workspace settings, customer import, risk segments and the automated email actions your team wants to launch first.\n\nI’ve highlighted the sections your operations lead can complete without technical help, plus the two steps that need someone with access to your billing and product-usage data.\n\nOnce those are connected, you should be able to run the first account review straight away.\n\nBest,\nThe Cobrai Team",

                attachments: [

                    {

                        id: "attachment_novapay_guide",

                        fileName: "NovaPay-onboarding-guide.pdf",

                        mimeType: "application/pdf",

                        sizeLabel: "3.2 MB",

                    },

                ],

            },

        ],

    },

    {

        id: "thread_maplecrm_recap",

        customerId: "customer_maplecrm",

        customerName: "George Allen",

        customerEmail: "george@maplecrm.com",

        customerCompany: "MapleCRM",

        subject: "Your weekly retention recap",

        preview:

            "Three accounts need attention this week, with £7,400 in monthly revenue at risk.",

        folder: "sent",

        labels: ["Opened", "Weekly recap"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-14T08:05:00.000Z",

        messages: [

            {

                id: "message_maplecrm_recap_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "George Allen",

                toEmail: "george@maplecrm.com",

                sentAt: "2026-07-14T08:05:00.000Z",

                status: "opened",

                html: null,

                plainText:

                    "Hi George,\n\nHere’s your weekly retention recap for MapleCRM.\n\nThree accounts need attention this week, representing £7,400 in monthly recurring revenue. Acme Labs is the highest priority after a failed payment and a 38% drop in product usage. Northbridge is showing lower engagement across its admin users, while Beacon’s renewal is now inside the 30-day window with no recent stakeholder activity.\n\nThe good news: two accounts moved back to healthy after last week’s outreach, protecting £3,150 MRR.\n\nI’d start with Acme Labs today, then review the renewal owner for Beacon.\n\nBest,\nThe Cobrai Team",

            },

        ],

    },

    {

        id: "thread_cloudnest_recovery",

        customerId: "customer_cloudnest",

        customerName: "Nadia Ali",

        customerEmail: "nadia@cloudnest.io",

        customerCompany: "CloudNest",

        subject: "Your payment has been recovered",

        preview:

            "The retry was successful and your CloudNest subscription remains active.",

        folder: "sent",

        labels: ["Delivered", "Payment recovered"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-13T15:42:00.000Z",

        messages: [

            {

                id: "message_cloudnest_recovery_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Nadia Ali",

                toEmail: "nadia@cloudnest.io",

                sentAt: "2026-07-13T15:42:00.000Z",

                status: "delivered",

                html: null,

                plainText:

                    "Hi Nadia,\n\nGood news — the latest payment retry completed successfully and your CloudNest subscription is fully active again.\n\nNo action is needed from your side. Your users, workflows and reporting access remained unchanged while the retry was pending, and the invoice now shows as paid.\n\nI’ve left the billing alert resolved so it won’t continue appearing in your account health view.\n\nBest,\nThe Cobrai Team",

            },

        ],

    },

    {

        id: "thread_signalforge_followup",

        customerId: "customer_signalforge",

        customerName: "Marcus Reed",

        customerEmail: "marcus@signalforge.io",

        customerCompany: "SignalForge",

        subject: "Following up on your dashboard feedback",

        preview:

            "We have shared your feedback with product and will update you when the change ships.",

        folder: "sent",

        labels: ["Clicked", "Product feedback"],

        unread: false,

        starred: true,

        archived: false,

        lastMessageAt: "2026-07-12T14:16:00.000Z",

        messages: [

            {

                id: "message_signalforge_followup_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Marcus Reed",

                toEmail: "marcus@signalforge.io",

                sentAt: "2026-07-12T14:16:00.000Z",

                status: "clicked",

                html: null,

                plainText:

                    "Hi Marcus,\n\nThanks again for the detailed notes you shared on the dashboard filters. I’ve passed the examples to product, especially the point about retaining filter state when moving between an account profile and the main report.\n\nThe team has grouped that with the next reporting improvements rather than treating it as a one-off fix. I can’t give you a release date yet, but I’ll update you as soon as it’s scheduled.\n\nIn the meantime, the saved-view workaround we discussed should reduce some of the repetition.\n\nBest,\nThe Cobrai Team",

            },

        ],

    },

    {

        id: "thread_kitelabs_checkin",

        customerId: "customer_kite_labs",

        customerName: "Maya Chen",

        customerEmail: "maya@kitelabs.dev",

        customerCompany: "Kite Labs",

        subject: "Quick check-in before renewal",

        preview:

            "Would Thursday afternoon work for a short success call with your product team?",

        folder: "scheduled",

        labels: ["Scheduled", "Renewal"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-15T14:30:00.000Z",

        messages: [

            {

                id: "message_kitelabs_checkin_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Maya Chen",

                toEmail: "maya@kitelabs.dev",

                sentAt: "2026-07-15T14:30:00.000Z",

                status: "scheduled",

                html: null,

                plainText:

                    "Hi Maya,\n\nI wanted to check in ahead of Kite Labs’ renewal and make sure the team is getting full value from the platform before we talk contracts.\n\nUsage is healthy overall, but I’d like to review the reporting setup with your product team and make sure the renewal-risk views are giving you the level of detail you need.\n\nWould Thursday afternoon work for a short success call? I can come prepared with a concise account summary so we spend the time on decisions rather than setup.\n\nBest,\nThe Cobrai Team",

            },

        ],

    },

    {

        id: "thread_pulsegrid_case_study",

        customerId: "customer_pulsegrid",

        customerName: "Priya Shah",

        customerEmail: "priya@pulsegrid.ai",

        customerCompany: "PulseGrid",

        subject: "Would you be open to a short customer story?",

        preview:

            "You recovered £12,600 in revenue this quarter. We would love to highlight the result.",

        folder: "scheduled",

        labels: ["Scheduled", "Advocacy"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-16T09:00:00.000Z",

        messages: [

            {

                id: "message_pulsegrid_case_study_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Priya Shah",

                toEmail: "priya@pulsegrid.ai",

                sentAt: "2026-07-16T09:00:00.000Z",

                status: "scheduled",

                html: null,

                plainText:

                    "Hi Priya,\n\nPulseGrid has recovered £12,600 in revenue this quarter through the payment and renewal workflows, which is a really strong result.\n\nWould you be open to a short customer story about how your team is using the automation? We’d keep it practical — a few questions on the original challenge, what you changed, and the outcome. Nothing would be published without your approval.\n\nIf you’re interested, I can send a simple outline first so you can see exactly what we’d cover.\n\nBest,\nThe Cobrai Team",

            },

        ],

    },

    {

        id: "thread_evertrail_nps",

        customerId: "customer_evertrail",

        customerName: "Sophie Bennett",

        customerEmail: "sophie@evertrail.co",

        customerCompany: "EverTrail",

        subject: "Could you share feedback on your first month?",

        preview:

            "A short feedback request following EverTrail's first thirty days.",

        folder: "scheduled",

        labels: ["Scheduled", "Feedback"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-17T10:15:00.000Z",

        messages: [

            {

                id: "message_evertrail_nps_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Sophie Bennett",

                toEmail: "sophie@evertrail.co",

                sentAt: "2026-07-17T10:15:00.000Z",

                status: "scheduled",

                html: null,

                plainText:

                    "Hi Sophie,\n\nYou’ve now been using Cobrai for just over a month, so I wanted to get your view while the onboarding experience is still fresh.\n\nWhat’s working well for the team so far, and where are you still finding friction? Even a couple of lines would be useful. We’re particularly interested in whether the account health and automation views are helping you decide what to act on each week.\n\nIf it’s easier, you can simply reply with a score from 0–10 and one reason for it.\n\nBest,\nThe Cobrai Team",

            },

        ],

    },

    {

        id: "thread_orbit_draft",

        customerId: "customer_orbit",

        customerName: "Liam Roberts",

        customerEmail: "liam@orbitstack.com",

        customerCompany: "OrbitStack",

        subject: "A few ways to improve reporting adoption",

        preview:

            "I pulled together three quick actions that could help your team use reporting more consistently.",

        folder: "drafts",

        labels: ["Draft", "Usage risk"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-14T08:42:00.000Z",

        messages: [

            {

                id: "message_orbit_draft_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Liam Roberts",

                toEmail: "liam@orbitstack.com",

                sentAt: "2026-07-14T08:42:00.000Z",

                status: "sent",

                html: null,

                plainText:

                    "Hi Liam,\n\nI pulled together three practical ways OrbitStack could improve reporting adoption once the warehouse migration is complete.\n\nFirst, we can schedule a weekly executive summary so leadership gets value without needing to open the dashboard. Second, we can create a saved view for the ops team using only the metrics they review regularly. Third, I’d suggest assigning one owner for the account-risk review rather than expecting the whole team to check it.\n\nI’ve left this as a draft until we know the migration is finished.\n\nBest,\nThe Cobrai Team",

            },

        ],

    },

    {

        id: "thread_brightpath_draft",

        customerId: "customer_brightpath",

        customerName: "Elena Morris",

        customerEmail: "elena@brightpathhq.com",

        customerCompany: "BrightPath",

        subject: "Update on your automation issue",

        preview:

            "We found the cause and are preparing a fix for the renewal workflow.",

        folder: "drafts",

        labels: ["Draft", "Support follow-up"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-14T12:10:00.000Z",

        messages: [

            {

                id: "message_brightpath_draft_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Elena Morris",

                toEmail: "elena@brightpathhq.com",

                sentAt: "2026-07-14T12:10:00.000Z",

                status: "sent",

                html: null,

                plainText:

                    "Hi Elena,\n\nWe found the cause of the renewal workflow issue you reported. One of the trigger checks was evaluating the renewal date after the segment refresh, which meant the account wasn’t entering the workflow when expected.\n\nWe’re preparing the fix now. Your existing scheduled emails are safe and won’t be duplicated, and we’ll verify the affected account before anything is sent.\n\nI’ll send you a final confirmation once the correction is live.\n\nBest,\nThe Cobrai Team",

            },

        ],

    },

    {

        id: "thread_redwood_draft",

        customerId: "customer_redwood",

        customerName: "Jack Foster",

        customerEmail: "jack@redwoodapps.com",

        customerCompany: "Redwood Apps",

        subject: "Your account health summary",

        preview:

            "Usage is healthy, but two key users have not logged in for fourteen days.",

        folder: "drafts",

        labels: ["Draft", "Health summary"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-13T17:24:00.000Z",

        messages: [

            {

                id: "message_redwood_draft_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Jack Foster",

                toEmail: "jack@redwoodapps.com",

                sentAt: "2026-07-13T17:24:00.000Z",

                status: "sent",

                html: null,

                plainText:

                    "Hi Jack,\n\nI’ve been reviewing Redwood Apps’ account health and overall usage still looks strong. The only change worth flagging is that two users who were previously active every week haven’t logged in for 14 days.\n\nBefore we treat that as an adoption issue, I wanted to check whether their responsibilities have changed or whether they’re simply away from the project.\n\nIf they still need access, I can send over a short re-engagement plan for those users.\n\nBest,\nThe Cobrai Team",

            },

        ],

    },

    {

        id: "thread_helix_failed",

        customerId: "customer_helix",

        customerName: "Amina Yusuf",

        customerEmail: "amina@helixcloud.io",

        customerCompany: "Helix Cloud",

        subject: "Your account needs attention",

        preview:

            "Delivery failed because the recipient mailbox rejected the message.",

        folder: "failed",

        labels: ["Failed", "Mailbox rejected"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-13T16:02:00.000Z",

        messages: [

            {

                id: "message_helix_failed_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Amina Yusuf",

                toEmail: "amina@helixcloud.io",

                sentAt: "2026-07-13T16:02:00.000Z",

                status: "failed",

                html: null,

                plainText:

                    "Hi Amina,\n\nWe noticed a meaningful drop in Helix Cloud’s account activity over the last two weeks and wanted to check whether your team has run into any blockers.\n\nThe biggest change is in the reporting workspace, where weekly activity is down compared with your normal baseline. If this is expected, no action is needed. If not, we can help review the setup and get the team back on track.\n\nBest,\nThe Cobrai Team",

            },

        ],

    },

    {

        id: "thread_summit_failed",

        customerId: "customer_summit",

        customerName: "Oliver Grant",

        customerEmail: "oliver@summitflow.com",

        customerCompany: "SummitFlow",

        subject: "Your renewal review",

        preview:

            "The message could not be delivered because the address does not exist.",

        folder: "failed",

        labels: ["Failed", "Invalid address"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-12T09:44:00.000Z",

        messages: [

            {

                id: "message_summit_failed_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Oliver Grant",

                toEmail: "oliver@summitflow.com",

                sentAt: "2026-07-12T09:44:00.000Z",

                status: "failed",

                html: null,

                plainText:

                    "Hi Oliver,\n\nYour renewal is approaching, so I wanted to schedule a short account review before the current term ends.\n\nI’d like to cover usage, the workflows your team is relying on most, and any changes you want to make for the next term. I can also prepare a one-page summary for your internal review if that would help.\n\nWould Tuesday or Wednesday afternoon suit?\n\nBest,\nThe Cobrai Team",

            },

        ],

    },

    {

        id: "thread_lumen_failed",

        customerId: "customer_lumen",

        customerName: "Rachel Kim",

        customerEmail: "rachel@lumenops.io",

        customerCompany: "LumenOps",

        subject: "Action required: billing issue",

        preview:

            "Delivery was temporarily deferred by the recipient's email server.",

        folder: "failed",

        labels: ["Failed", "Temporary deferral"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-11T18:20:00.000Z",

        messages: [

            {

                id: "message_lumen_failed_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Rachel Kim",

                toEmail: "rachel@lumenops.io",

                sentAt: "2026-07-11T18:20:00.000Z",

                status: "failed",

                html: null,

                plainText:

                    "Hi Rachel,\n\nWe were unable to process LumenOps’ latest subscription payment and the invoice is still showing as outstanding.\n\nTo avoid any interruption, please review the payment method on the billing page when you have a chance. Once it’s updated, the system will retry the invoice automatically.\n\nIf this needs to go through a different finance contact or purchase-order process, reply here and we’ll update the billing details.\n\nBest,\nThe Cobrai Team",

            },

        ],

    },

    {

        id: "thread_archive_product",

        customerId: "customer_northstar",

        customerName: "Tom Evans",

        customerEmail: "tom@northstarhq.com",

        customerCompany: "Northstar HQ",

        subject: "Re: Product feedback",

        preview:

            "The new reporting view solved the issue for us. You can close this thread.",

        folder: "archived",

        labels: ["Replied", "Resolved"],

        unread: false,

        starred: false,

        archived: true,

        lastMessageAt: "2026-07-11T10:25:00.000Z",

        messages: [

            {

                id: "message_archive_product_1",

                direction: "inbound",

                fromName: "Tom Evans",

                fromEmail: "tom@northstarhq.com",

                toName: "Cobrai Team",

                toEmail: "success@cobrai.app",

                sentAt: "2026-07-11T10:25:00.000Z",

                status: "received",

                html: null,

                plainText:

                    "Hi,\n\nThe new reporting view has solved the issue for us. We tested it with the same filters that were causing trouble last week and the totals now stay consistent when we move between account profiles.\n\nYou can close this thread from our side. Thanks for keeping us updated while it was being fixed.\n\nTom",

            },

        ],

    },

    {

        id: "thread_archive_willow",

        customerId: "customer_willow",

        customerName: "Hannah Clarke",

        customerEmail: "hannah@willowfinance.co",

        customerCompany: "Willow Finance",

        subject: "Re: Account access restored",

        preview:

            "Everything is working again. Thank you for sorting it so quickly.",

        folder: "archived",

        labels: ["Resolved", "Support"],

        unread: false,

        starred: false,

        archived: true,

        lastMessageAt: "2026-07-10T15:18:00.000Z",

        messages: [

            {

                id: "message_archive_willow_1",

                direction: "inbound",

                fromName: "Hannah Clarke",

                fromEmail: "hannah@willowfinance.co",

                toName: "Cobrai Team",

                toEmail: "success@cobrai.app",

                sentAt: "2026-07-10T15:18:00.000Z",

                status: "received",

                html: null,

                plainText:

                    "Hi team,\n\nEverything is working again this afternoon. All four users can access the workspace and the saved reports are loading normally.\n\nThank you for sorting it so quickly and for explaining what caused the access issue. You can mark this one as resolved.\n\nBest,\nHannah",

            },

        ],

    },

    {

        id: "thread_archive_acorn",

        customerId: "customer_acorn",

        customerName: "Ben Carter",

        customerEmail: "ben@acornmetrics.com",

        customerCompany: "Acorn Metrics",

        subject: "Re: Cancellation request",

        preview:

            "We have decided to stay after reviewing the new annual plan.",

        folder: "archived",

        labels: ["Saved", "Renewal"],

        unread: false,

        starred: true,

        archived: true,

        lastMessageAt: "2026-07-09T12:32:00.000Z",

        messages: [

            {

                id: "message_archive_acorn_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Ben Carter",

                toEmail: "ben@acornmetrics.com",

                sentAt: "2026-07-09T09:10:00.000Z",

                status: "opened",

                html: null,

                plainText:

                    "Hi Ben,\n\nBefore we process the cancellation, I wanted to share the annual option we discussed on Tuesday.\n\nIt reduces the effective monthly cost, includes onboarding support for the new team members, and gives you a longer runway to roll out the retention workflows you haven’t activated yet. Based on your current usage, I think it’s the better fit than dropping the account entirely.\n\nI’ve attached the revised commercial summary for your review.\n\nBest,\nThe Cobrai Team",

            },

            {

                id: "message_archive_acorn_2",

                direction: "inbound",

                fromName: "Ben Carter",

                fromEmail: "ben@acornmetrics.com",

                toName: "Cobrai Team",

                toEmail: "success@cobrai.app",

                sentAt: "2026-07-09T12:32:00.000Z",

                status: "received",

                html: null,

                plainText:

                    "Hi,\n\nWe’ve reviewed the annual option internally and decided to stay.\n\nPlease send the updated agreement with the onboarding support included as discussed. If you can get that across today, I should be able to have it signed before the end of the week.\n\nThanks for working with us on this.\n\nBen",

            },

        ],

    },

    {

        id: "thread_starred_finance_review",

        customerId: "customer_finance_team",

        customerName: "Amelia Hart",

        customerEmail: "amelia@northlinefinance.co",

        customerCompany: "Northline Finance",

        subject: "Budget review for the retention campaign",

        preview:

            "The revised campaign budget and supporting forecast are ready for your review.",

        folder: "starred",

        labels: ["Starred", "Finance review"],

        unread: false,

        starred: true,

        archived: false,

        lastMessageAt: "2026-07-14T14:05:00.000Z",

        messages: [

            {

                id: "message_starred_finance_review_1",

                direction: "inbound",

                fromName: "Amelia Hart",

                fromEmail: "amelia@northlinefinance.co",

                toName: "Cobrai Team",

                toEmail: "success@cobrai.app",

                sentAt: "2026-07-14T14:05:00.000Z",

                status: "received",

                html: null,

                plainText:

                    "Hi team,\n\nThe revised retention campaign budget is ready for review. We’ve increased the allocation for customer education and lifecycle content, and reduced spend against the channels that underperformed in the last two campaigns.\n\nI’ve attached the working budget and the updated Q3 revenue forecast. The forecast assumes the current recovery rate holds and that the new onboarding sequence launches by mid-month.\n\nPlease review both files before Thursday’s leadership meeting and flag anything that looks unrealistic, particularly around revenue impact, delivery capacity or the timing of the campaign spend.\n\nWarm regards,\nAmelia",

                attachments: [

                    {

                        id: "attachment_finance_budget",

                        fileName: "Retention-Campaign-Budget.xlsx",

                        mimeType:

                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

                        sizeLabel: "1.2 MB",

                    },

                    {

                        id: "attachment_finance_forecast",

                        fileName: "Revenue-Forecast-Q3.pdf",

                        mimeType: "application/pdf",

                        sizeLabel: "840 KB",

                    },

                ],

            },

        ],

    },

    {

        id: "thread_starred_renewal_summary",

        customerId: "customer_oakwell",

        customerName: "James Cole",

        customerEmail: "james@oakwell.io",

        customerCompany: "Oakwell",

        subject: "Renewal summary and next steps",

        preview:

            "The renewal proposal has been approved internally and is ready for final review.",

        folder: "starred",

        labels: ["Starred", "Renewal"],

        unread: true,

        starred: true,

        archived: false,

        lastMessageAt: "2026-07-14T12:22:00.000Z",

        messages: [

            {

                id: "message_starred_renewal_summary_1",

                direction: "inbound",

                fromName: "James Cole",

                fromEmail: "james@oakwell.io",

                toName: "Cobrai Team",

                toEmail: "success@cobrai.app",

                sentAt: "2026-07-14T12:22:00.000Z",

                status: "received",

                html: null,

                plainText:

                    "Hi team,\n\nOur renewal proposal has now been approved internally. The only outstanding item is confirmation of the implementation support included in the annual plan.\n\nCould you send the final commercial summary and updated agreement today? Procurement specifically wants the onboarding hours, response-time commitment and renewal start date written into the final version.\n\nOnce that’s confirmed, I don’t expect any further changes from our side.\n\nThanks,\nJames",

                attachments: [

                    {

                        id: "attachment_oakwell_agreement",

                        fileName: "Oakwell-Renewal-Notes.docx",

                        mimeType:

                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

                        sizeLabel: "420 KB",

                    },

                ],

            },

        ],

    },

    {

        id: "thread_starred_product_feedback",

        customerId: "customer_vertex",

        customerName: "Leila Morgan",

        customerEmail: "leila@vertexops.com",

        customerCompany: "VertexOps",

        subject: "Product feedback from our leadership team",

        preview:

            "Leadership shared detailed feedback on reporting, alerts and account segmentation.",

        folder: "starred",

        labels: ["Starred", "Product feedback"],

        unread: false,

        starred: true,

        archived: false,

        lastMessageAt: "2026-07-13T16:40:00.000Z",

        messages: [

            {

                id: "message_starred_product_feedback_1",

                direction: "inbound",

                fromName: "Leila Morgan",

                fromEmail: "leila@vertexops.com",

                toName: "Cobrai Team",

                toEmail: "success@cobrai.app",

                sentAt: "2026-07-13T16:40:00.000Z",

                status: "received",

                html: null,

                plainText:

                    "Hi,\n\nOur leadership team reviewed the latest dashboard yesterday and I’ve attached the consolidated feedback.\n\nThe new retention view is a strong improvement. People particularly liked being able to move from the portfolio-level risk picture into an individual account without losing context. The remaining requests are mostly around reporting filters, alert controls and giving account segments clearer ownership.\n\nNone of this is urgent, but the document includes examples from our real weekly workflow so hopefully it’s useful for product planning.\n\nBest,\nLeila",

                attachments: [

                    {

                        id: "attachment_vertex_feedback",

                        fileName: "VertexOps-Product-Feedback.pdf",

                        mimeType: "application/pdf",

                        sizeLabel: "690 KB",

                    },

                ],

            },

        ],

    },

    {

        id: "thread_deleted_trial_followup",

        customerId: "customer_fieldstone",

        customerName: "Aaron Blake",

        customerEmail: "aaron@fieldstone.app",

        customerCompany: "Fieldstone",

        subject: "Following up on your trial",

        preview:

            "A previous trial follow-up that was moved to deleted emails.",

        folder: "deleted",

        labels: ["Deleted", "Trial"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-10T11:15:00.000Z",

        messages: [

            {

                id: "message_deleted_trial_followup_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Aaron Blake",

                toEmail: "aaron@fieldstone.app",

                sentAt: "2026-07-10T11:15:00.000Z",

                status: "sent",

                html: null,

                plainText:

                    "Hi Aaron,\n\nI wanted to check whether the Fieldstone team had enough time to properly test the retention dashboard during the trial.\n\nYou imported enough activity for us to identify a few useful patterns, including two accounts with declining engagement that may be worth reviewing. If helpful, I can send a short summary of what the trial data is showing before you decide whether to continue.\n\nNo pressure either way — I just don’t want you to finish the trial without seeing the useful part of the analysis.\n\nBest,\nThe Cobrai Team",

            },

        ],

    },

    {

        id: "thread_deleted_old_invoice",

        customerId: "customer_harbour",

        customerName: "Lucy Grant",

        customerEmail: "lucy@harbourlabs.co",

        customerCompany: "Harbour Labs",

        subject: "Copy of your previous invoice",

        preview:

            "An older invoice email that is no longer needed.",

        folder: "deleted",

        labels: ["Deleted", "Billing"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-08T09:30:00.000Z",

        messages: [

            {

                id: "message_deleted_old_invoice_1",

                direction: "outbound",

                fromName: "Cobrai Billing",

                fromEmail: "billing@cobrai.app",

                toName: "Lucy Grant",

                toEmail: "lucy@harbourlabs.co",

                sentAt: "2026-07-08T09:30:00.000Z",

                status: "delivered",

                html: null,

                plainText:

                    "Hi Lucy,\n\nAs requested, I’ve attached another copy of your previous invoice for Harbour Labs.\n\nThe invoice includes the billing period, VAT details and payment reference used for the original transaction. If finance needs the document addressed differently for your records, send me the correct billing details and I can update the copy.\n\nBest,\nCobrai Billing",

                attachments: [

                    {

                        id: "attachment_harbour_invoice",

                        fileName: "Harbour-Labs-Invoice-June.pdf",

                        mimeType: "application/pdf",

                        sizeLabel: "210 KB",

                    },

                ],

            },

        ],

    },

    {

        id: "thread_deleted_duplicate_notice",

        customerId: "customer_summit",

        customerName: "Oliver Grant",

        customerEmail: "oliver@summitflow.com",

        customerCompany: "SummitFlow",

        subject: "Duplicate renewal notice",

        preview:

            "A duplicate renewal notice removed from the active inbox.",

        folder: "deleted",

        labels: ["Deleted", "Duplicate"],

        unread: false,

        starred: false,

        archived: false,

        lastMessageAt: "2026-07-07T15:08:00.000Z",

        messages: [

            {

                id: "message_deleted_duplicate_notice_1",

                direction: "outbound",

                fromName: "Cobrai Team",

                fromEmail: "success@cobrai.app",

                toName: "Oliver Grant",

                toEmail: "oliver@summitflow.com",

                sentAt: "2026-07-07T15:08:00.000Z",

                status: "sent",

                html: null,

                plainText:

                    "Hi Oliver,\n\nYour renewal review is approaching, so I wanted to make sure we have enough time to prepare anything your team needs before the meeting.\n\nI can put together a short account summary covering adoption, recent activity, current risk signals and the workflows delivering the most value. That should give everyone a clear starting point for the renewal discussion.\n\nIf there’s a specific metric your leadership team wants included, just reply and I’ll add it.\n\nBest,\nThe Cobrai Team",

            },

        ],

    },

];

const folderOrder: InboxFolder[] = [

    "inbox",

    "starred",

    "sent",

    "scheduled",

    "drafts",

    "deleted",

    "failed",

    "archived",

];


// Chat conversations from messaging channels. They show how WhatsApp,
// Telegram and Instagram threads appear once those integrations exist.
function chatMessage(
    id: string,
    direction: "inbound" | "outbound",
    who: { name: string; handle: string },
    minutesFromNow: number,
    text: string,
): InboxMessage {
    const us = { name: "You", handle: "" };
    const from = direction === "inbound" ? who : us;
    const to = direction === "inbound" ? us : who;
    return {
        id,
        direction,
        fromName: from.name,
        fromEmail: from.handle,
        toName: to.name,
        toEmail: to.handle,
        sentAt: demoIso(minutesFromNow),
        status: direction === "inbound" ? "received" : "delivered",
        html: null,
        plainText: text,
    };
}

const maya = { name: "Maya Okafor", handle: "+44 7700 900412" };
const leo = { name: "Leo Brandt", handle: "@leobrandt" };
const sana = { name: "Sana Qureshi", handle: "@sana.designs" };
const tomas = { name: "Tomás Ruiz", handle: "+34 612 448 901" };

const demoChatThreads: InboxThread[] = [
    {
        id: "chat_whatsapp_maya",
        customerTitle: "Head of Operations",
        customerLocation: "London, United Kingdom",
        customerTimeZone: "Europe/London",
        customerLanguages: ["English"],
        channel: "whatsapp",
        customerId: null,
        customerName: maya.name,
        customerEmail: "maya@northwind.io",
        customerHandle: maya.handle,
        customerCompany: "Northwind",
        subject: "Seat upgrade before Monday",
        preview: "Perfect, can you send the invoice to finance@northwind.io?",
        folder: "inbox",
        labels: [],
        unread: true,
        starred: false,
        archived: false,
        lastMessageAt: demoIso(-6),
        messages: [
            chatMessage("chat_maya_1", "inbound", maya, -55, "Hi! We're adding 8 people to the team next week. Can we upgrade our seats before Monday?"),
            chatMessage("chat_maya_2", "outbound", maya, -48, "Hi Maya, yes of course. You're on the Growth plan with 12 seats, so going to 20 keeps your current price per seat."),
            chatMessage("chat_maya_3", "inbound", maya, -40, "Great. Will the new people get access to the dashboards straight away?"),
            chatMessage("chat_maya_4", "outbound", maya, -33, "Yes, as soon as you invite them. I can make the change now and it'll show on next month's invoice."),
            chatMessage("chat_maya_5", "inbound", maya, -6, "Perfect, can you send the invoice to finance@northwind.io?"),
        ],
    },
    {
        id: "chat_telegram_leo",
        customerTitle: "CTO",
        customerLocation: "Berlin, Germany",
        customerTimeZone: "Europe/Berlin",
        customerLanguages: ["German", "English"],
        channel: "telegram",
        customerId: null,
        customerName: leo.name,
        customerEmail: "",
        customerHandle: leo.handle,
        customerCompany: "Brandt & Co",
        subject: "API rate limit question",
        preview: "Thanks, that fixed it 🙌",
        folder: "inbox",
        labels: [],
        unread: false,
        starred: true,
        archived: false,
        lastMessageAt: demoIso(-95),
        messages: [
            chatMessage("chat_leo_1", "inbound", leo, -180, "Hey, our sync keeps getting 429 errors since this morning. Did something change with the API limits?"),
            chatMessage("chat_leo_2", "outbound", leo, -170, "Hi Leo, nothing changed on our side. 429 means more than 60 requests a minute from one key. Are you running the sync from several workers?"),
            chatMessage("chat_leo_3", "inbound", leo, -150, "Ah, we scaled to 4 workers yesterday. That's probably it."),
            chatMessage("chat_leo_4", "outbound", leo, -140, "That would do it. Either share one queue between them, or I can raise your limit to 240 a minute."),
            chatMessage("chat_leo_5", "inbound", leo, -95, "Thanks, that fixed it 🙌"),
        ],
    },
    {
        id: "chat_instagram_sana",
        customerTitle: "Founder, Sana Studio",
        customerLocation: "Manchester, United Kingdom",
        customerTimeZone: "Europe/London",
        customerLanguages: ["English", "Urdu"],
        channel: "instagram",
        customerId: null,
        customerName: sana.name,
        customerEmail: "",
        customerHandle: sana.handle,
        customerCompany: null,
        subject: "Partnership enquiry",
        preview: "Would you be open to a quick call this week?",
        folder: "inbox",
        labels: [],
        unread: true,
        starred: false,
        archived: false,
        lastMessageAt: demoIso(-60 * 26),
        messages: [
            chatMessage("chat_sana_1", "inbound", sana, -60 * 27, "Hi! I run a small design studio and we recommend your tool to a lot of clients 😊"),
            chatMessage("chat_sana_2", "inbound", sana, -60 * 26, "Would you be open to a quick call this week to talk about a referral partnership?"),
        ],
    },
    {
        id: "chat_whatsapp_tomas",
        customerTitle: "Operations Manager",
        customerLocation: "Valencia, Spain",
        customerTimeZone: "Europe/Madrid",
        customerLanguages: ["Spanish", "English"],
        channel: "whatsapp",
        customerId: null,
        customerName: tomas.name,
        customerEmail: "tomas@ruizlogistics.es",
        customerHandle: tomas.handle,
        customerCompany: "Ruiz Logistics",
        subject: "Login trouble",
        preview: "I'm in now, thank you!",
        folder: "inbox",
        labels: [],
        unread: false,
        starred: false,
        archived: false,
        lastMessageAt: demoIso(-60 * 50),
        messages: [
            chatMessage("chat_tomas_1", "inbound", tomas, -60 * 52, "Hola, I can't log in. It says my link has expired."),
            chatMessage("chat_tomas_2", "outbound", tomas, -60 * 51, "Hi Tomás, sign-in links last 15 minutes. I've just sent you a fresh one to tomas@ruizlogistics.es."),
            chatMessage("chat_tomas_3", "inbound", tomas, -60 * 50, "I'm in now, thank you!"),
        ],
    },
];

function cloneDemoThreads(): InboxThread[] {

    return [...demoThreads, ...demoChatThreads].map((thread) => ({

        ...thread,

        labels: [...thread.labels],

        messages: thread.messages.map((message) => ({

            ...message,

            attachments: message.attachments

                ? message.attachments.map((attachment) => ({ ...attachment }))

                : undefined,

        })),

    }));

}

export function buildInboxPayload(

    workspaceId = DEMO_INBOX_WORKSPACE_ID,

): InboxPayload {

    const threads = cloneDemoThreads().sort(

        (a, b) =>

            new Date(b.lastMessageAt).getTime() -

            new Date(a.lastMessageAt).getTime(),

    );

    return {

        workspaceId,

        folders: folderOrder.map((folder) => ({

            folder,

            count: threads.filter((thread) => thread.folder === folder).length,

        })),

        threads,

    };

}