export function buildEmailStyleAnalysisPrompt() {
    return `
You are an expert HTML email designer.

Analyse the uploaded email screenshots and recreate the reusable email style as production-ready HTML.

Return ONLY valid JSON. No markdown.

JSON shape:

{
  "logoStyle": "",
  "primaryColor": "",
  "secondaryColor": "",
  "backgroundColor": "",
  "fontFamily": "",
  "layoutStyle": "",
  "buttonStyle": {
    "shape": "",
    "background": "",
    "textColor": "",
    "placement": "",
    "labelStyle": ""
  },
  "emojiStyle": "",
  "iconStyle": "",
  "headerStyle": "",
  "footerStyle": "",
  "tone": "",
  "spacing": "",
  "contentPattern": "",
  "ctaPattern": "",
  "recommendedEmailTypes": [
    {
      "name": "",
      "reason": "",
      "subject": ""
    }
  ],
  "reconstructedTemplates": [
    {
      "name": "Primary reconstructed template",
      "subject": "",
      "html": "",
      "plainText": "",
      "designNotes": ""
    }
  ]
}

HTML rules:
- Recreate the visual layout from the screenshots.
- Use inline CSS only.
- Use table-safe or email-safe structure.
- Use max-width wrapper.
- Use placeholders: {{first_name}}, {{cta_link}}, {{unsubscribe_link}}.
- Do not include scripts.
- Do not use external CSS.
- Do not invent real customer data.
- Make the HTML reusable for future generated emails.
`;
}