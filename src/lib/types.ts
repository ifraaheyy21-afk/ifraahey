export type CustomerRow = {
    name?: string;
    email?: string;
    company?: string;
    plan?: string;
    mrr?: string;
    lastActive?: string;
    usage?: string;
    supportTickets?: string;
    paymentStatus?: string;
    renewalDate?: string;
};

export type GeneratedEmail = {
    customerName: string;
    email: string;
    company: string;
    segment: string;
    riskLevel: "Low" | "Medium" | "High";
    reason: string;
    subject: string;
    body: string;
};