export function buildEmailGenerationPrompt({
    emailType,
    subject,
    prompt,
    brandProfile,
}: {
    emailType: string;
    subject: string;
    prompt: string;
    brandProfile: unknown;
}) {
    return `
You are an AI email designer and copywriter.

Create a production-ready HTML email that recreates the company's learned email style.

Email type:
${emailType}

Subject:
${subject}

Extra user instructions:
${prompt || "No extra instructions."}

Learned brand/email style:
${JSON.stringify(brandProfile, null, 2)}

Rules:
- Return ONLY valid JSON.
- No markdown.
- No explanation.
- The email must look like the uploaded samples.
- Use inline CSS only.
- Keep it responsive.
- Use placeholders like {{first_name}}, {{cta_link}}, {{unsubscribe_link}}.
- Do not invent real customer data.

Return this JSON:

{
  "subject": "",
  "html": "",
  "plainText": ""
}
`;
}