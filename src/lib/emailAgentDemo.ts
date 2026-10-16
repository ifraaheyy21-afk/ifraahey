export const DEMO_WORKSPACE_ID = "demo-workspace";

export const demoProfile = {
  companyName: "Cobrai",
  website: "https://cobrainow.com",
  companyDescription:
    "Cobrai helps businesses spot customer risk early and send better retention emails before revenue is lost.",
  idealCustomer:
    "B2B SaaS founders and small teams who want clear retention visibility and faster customer follow-up.",
  guidelines: [
    "Keep it short",
    "One CTA only",
    "Avoid sounding robotic",
    "Match the structure of saved samples",
    "Use a clean visual email layout",
  ],
};

export const demoEmailSamples = [
  {
    id: "demo-welcome-sample",
    title: "Welcome Email Sample",
    imageUrl: "/demo/email-samples/welcome-email.png",
    fileName: null,
    mimeType: "image/png",
    sizeBytes: 420000,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    learnedStyle: [
      "Large header image",
      "Friendly welcome headline",
      "Short intro paragraph",
      "One clear CTA button",
      "Two small information cards",
      "Soft footer section",
    ],
  },
  {
    id: "demo-winback-sample",
    title: "Win-back Email Sample",
    imageUrl: "/demo/email-samples/winback-email.png",
    fileName: null,
    mimeType: "image/png",
    sizeBytes: 390000,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    learnedStyle: [
      "Warm subject line",
      "Personalised customer signal",
      "Clear reason to return",
      "Single CTA",
    ],
  },
  {
    id: "demo-newsletter-sample",
    title: "Newsletter Email Sample",
    imageUrl: "/demo/email-samples/newsletter-email.png",
    fileName: null,
    mimeType: "image/png",
    sizeBytes: 450000,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    learnedStyle: [
      "Educational tone",
      "Simple sections",
      "Helpful content first",
      "Soft CTA at the end",
    ],
  },
];

export const demoRecommendedEmailTypes = [
  {
    id: "welcome-email",
    name: "Welcome email",
    reason: "Recreated from the saved welcome email sample",
    confidence: 96,
    subject: "Welcome to Cobrai",
    basedOnSamples: ["Welcome Email Sample"],
  },
  {
    id: "win-back",
    name: "Win-back email",
    reason: "Matches the saved win-back email structure",
    confidence: 92,
    subject: "Still interested?",
    basedOnSamples: ["Win-back Email Sample"],
  },
  {
    id: "value-reminder",
    name: "Value reminder",
    reason: "Uses the newsletter sample style to explain value clearly",
    confidence: 89,
    subject: "A quick reminder",
    basedOnSamples: ["Newsletter Email Sample"],
  },
  {
    id: "soft-follow-up",
    name: "Soft follow-up",
    reason: "Combines the welcome and win-back sample tone",
    confidence: 87,
    subject: "Just checking in",
    basedOnSamples: ["Welcome Email Sample", "Win-back Email Sample"],
  },
];

export function buildDemoEmailHtml({
  companyName,
  emailType,
  guidelines,
}: {
  companyName: string;
  emailType: string;
  guidelines: string[];
}) {
  const company = companyName || "Cobrai";

  return `
  <div style="max-width:680px;margin:0 auto;background:#ffffff;font-family:Inter,Arial,sans-serif;color:#1f2937;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;">
    <div style="background:#2563eb;padding:18px 28px;color:#ffffff;">
      <div style="font-size:20px;font-weight:800;">${company}</div>
    </div>

    <div style="padding:28px;border-bottom:1px solid #e5e7eb;text-align:center;">
      <div style="height:180px;background:#f3f6fb;border:1px solid #e5e7eb;border-radius:16px;display:flex;align-items:center;justify-content:center;color:#2563eb;font-weight:800;font-size:30px;">
        Hello!
      </div>

      <h1 style="margin:28px 0 12px;font-size:30px;line-height:1.2;color:#111827;">
        ${emailType}
      </h1>

      <p style="margin:0 auto 22px;max-width:520px;font-size:16px;line-height:1.7;color:#6b7280;">
        Hey {{first_name}}, I noticed {{personalised_customer_signal}} and wanted to quickly reach out with something useful.
      </p>

      <a href="{{cta_link}}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 24px;font-size:14px;font-weight:800;">
        Take next step
      </a>
    </div>

    <div style="padding:26px 28px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div style="background:#f3f6fb;border-radius:16px;padding:20px;">
        <h3 style="margin:0 0 8px;font-size:17px;color:#111827;">Why this matters</h3>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
          This helps you get more value without needing to start from scratch.
        </p>
      </div>

      <div style="background:#ecfdf5;border-radius:16px;padding:20px;">
        <h3 style="margin:0 0 8px;font-size:17px;color:#111827;">Recommended next step</h3>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
          Use the link above when you're ready and we’ll guide you through it.
        </p>
      </div>
    </div>

    <div style="padding:26px 32px;text-align:center;">
      <p style="margin:0;font-size:15px;line-height:1.7;color:#4b5563;">
        We hope this message finds you well. On behalf of the entire team, we’re excited to help you move faster and protect more revenue.
      </p>
    </div>

    <div style="padding:18px 28px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;text-align:center;">
      ${guidelines.join(" · ")}
    </div>
  </div>
  `;
}

export function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}