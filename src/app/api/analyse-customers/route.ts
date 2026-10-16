import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { CustomerRow } from "../../../lib/types";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const customers: CustomerRow[] = body.customers;

        if (!customers || !Array.isArray(customers)) {
            return NextResponse.json(
                { error: "Customers are required." },
                { status: 400 }
            );
        }

        const sample = customers.slice(0, 20);

        const prompt = `
You are an AI customer success email agent.

Analyse the customer list and generate personalised emails.

For each customer:
- Identify their segment
- Estimate churn/revenue risk: Low, Medium, or High
- Explain the reason
- Write a personalised email subject
- Write a short human retention email

Return only valid JSON array.

Customer data:
${JSON.stringify(sample, null, 2)}

JSON format:
[
  {
    "customerName": "",
    "email": "",
    "company": "",
    "segment": "",
    "riskLevel": "Low | Medium | High",
    "reason": "",
    "subject": "",
    "body": ""
  }
]
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                {
                    role: "system",
                    content:
                        "You generate customer retention emails from customer data. Return only valid JSON.",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.4,
        });

        const text = completion.choices[0]?.message?.content || "[]";

        let result;

        try {
            result = JSON.parse(text);
        } catch {
            return NextResponse.json(
                { error: "AI response could not be parsed.", raw: text },
                { status: 500 }
            );
        }

        return NextResponse.json({ emails: result });
    } catch (error) {
        console.error(error);

        return NextResponse.json(
            { error: "Something went wrong." },
            { status: 500 }
        );
    }
}