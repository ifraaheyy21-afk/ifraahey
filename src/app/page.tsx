"use client";

import "@fontsource/inter";
import "./page.css";
import Link from "next/link";

const integrations = [
    { name: "Stripe", logo: "https://cdn.simpleicons.org/stripe/635bff" },
    { name: "HubSpot", logo: "https://cdn.simpleicons.org/hubspot/ff5c35" },
    { name: "Notion", logo: "https://cdn.simpleicons.org/notion/000000" },
    { name: "Airtable", logo: "https://cdn.simpleicons.org/airtable/18bfff" },
    { name: "Google Sheets", logo: "https://cdn.simpleicons.org/googlesheets/34a853" },
    { name: "Slack", logo: "https://cdn.simpleicons.org/slack/4a154b" },
];

const metrics = [
    { label: "Emails Sent", value: "1,248", sub: "+18.4%" },
    { label: "Open Rate", value: "57.0%", sub: "+8.7%" },
    { label: "Click Rate", value: "12.0%", sub: "+4.2%" },
    { label: "Scheduled", value: "32", sub: "Live queue" },
];

const features = [
    {
        icon: "✦",
        title: "AI Email Generation",
        text: "Generate personalised emails that sound like you and drive real results.",
    },
    {
        icon: "👥",
        title: "Customer Intelligence",
        text: "Use data to understand your customers and send the right message at the right time.",
    },
    {
        icon: "▣",
        title: "Smart Scheduling",
        text: "Automate follow-ups and keep your campaigns moving without manual work.",
    },
    {
        icon: "↗",
        title: "Performance Tracking",
        text: "Track opens, clicks, replies and revenue impact in real time.",
    },
];

export default function HomePage() {
    return (
        <main className="page">
            <nav className="nav">
                <Link href="/" className="brand">
                    <span className="brandMark">◆</span>
                    <span>Mailgine</span>
                </Link>

                <div className="navLinks">
                    <a href="#features">Features</a>
                    <a href="#integrations">Integrations</a>
                    <a href="#pricing">Pricing</a>
                    <a href="#resources">Resources</a>
                </div>

                <div className="navActions">
                    <Link href="/login" className="loginBtn">Log in</Link>
                    <Link href="/login" className="navCta">Get started free</Link>
                </div>
            </nav>

            <section className="hero">
                <div className="heroCopy">

                    <h1>
                        Supercharge your email strategy with{" "}
                        <span>AI-powered</span> automation
                    </h1>

                    <p>
                        Mailgine helps SaaS teams connect customer data, generate
                        personalised emails and schedule follow-ups from one beautiful
                        workspace.
                    </p>

                    <div className="heroActions">
                        <Link href="/login" className="primaryBtn">
                            Try it free for 7 days
                        </Link>
                        <Link href="#product" className="secondaryBtn">
                            Book a demo
                        </Link>
                    </div>

                    <div className="heroProof">
                        <span>✓ No credit card required</span>
                        <span>✓ Cancel anytime</span>
                    </div>
                </div>

                <section className="productMockup dashboardPreview" id="product">
                    <aside className="previewSidebar">
                        {["Dashboard", "Accounts", "Email Queue", "Scheduled Emails", "Email Builder", "Integrations", "Settings"].map((item, index) => (
                            <div className={`previewNavItem ${index === 0 ? "active" : ""}`} key={item}>
                                <span />
                                {item}
                            </div>
                        ))}
                    </aside>

                    <div className="previewMain">
                        <div className="previewHeader">
                            <div>
                                <h2>Welcome back</h2>
                                <p>Here’s what’s happening with your demo email automation.</p>
                            </div>

                            <div className="previewActions">
                                <button>Live dashboard</button>
                                <button className="blue">+ Create Email</button>
                            </div>
                        </div>

                        <div className="previewStats">
                            {metrics.map((metric) => (
                                <article className="previewStatCard" key={metric.label}>
                                    <span>{metric.label}</span>
                                    <strong>{metric.value}</strong>
                                    <small>{metric.sub}</small>
                                </article>
                            ))}
                        </div>

                        <div className="previewGrid">
                            <article className="previewChartCard">
                                <div className="previewCardHeader">
                                    <div>
                                        <h3>Email Performance</h3>
                                        <p>Sent volume, clicks and replies over time.</p>
                                    </div>

                                    <div className="previewTabs">
                                        <span>24hrs</span>
                                        <span>7 days</span>
                                        <span>30 days</span>
                                    </div>
                                </div>

                                <div className="chartRow">
                                    <div className="chartLabel">
                                        <span>Emails sent</span>
                                        <strong>1,248</strong>
                                        <small>57.0% open rate</small>
                                    </div>

                                    <div className="dashboardBars">
                                        {[38, 44, 52, 59, 66, 74, 82, 92, 80, 88, 96, 104, 112, 118, 108, 116, 126, 136, 120, 110].map((height, index) => (
                                            <span key={index} style={{ height }} />
                                        ))}
                                    </div>
                                </div>

                                <div className="chartRow">
                                    <div className="chartLabel">
                                        <span>Clicks + replies</span>
                                        <strong>179</strong>
                                        <small>14.9% action rate</small>
                                    </div>

                                    <div className="dashboardBars light">
                                        {[24, 30, 36, 42, 48, 44, 52, 58, 62, 68, 74, 70, 78, 84, 90, 96, 102, 110, 98, 86].map((height, index) => (
                                            <span key={index} style={{ height }} />
                                        ))}
                                    </div>
                                </div>
                            </article>

                            <article className="previewScheduleCard">
                                <div className="previewCardHeader">
                                    <h3>Scheduled Emails</h3>
                                    <button>View all</button>
                                </div>

                                {[
                                    ["Acme AI", "Quick check-in before renewal", "In 11 mins"],
                                    ["CloudCore", "Quick check-in before renewal", "In 22 mins"],
                                    ["FlowDesk", "We noticed a drop in usage", "In 33 mins"],
                                    ["Metricly", "Can we help recover activity?", "In 44 mins"],
                                    ["SalesPilot", "We noticed a drop in usage", "In 55 mins"],
                                ].map(([company, subject, time]) => (
                                    <div className="scheduleMiniRow" key={company}>
                                        <div>
                                            <strong>{company}</strong>
                                            <span>{subject}</span>
                                        </div>
                                        <small>{time}</small>
                                    </div>
                                ))}
                            </article>
                        </div>
                    </div>
                </section>
            </section>
            <section className="integrations" id="integrations">
                <p>Trusted by SaaS teams and powered by great tools</p>

                <div className="logoSlider">
                    <div className="logoTrack">
                        {[...integrations, ...integrations].map((tool, index) => (
                            <div className="logoItem" key={`${tool.name}-${index}`}>
                                <img src={tool.logo} alt={`${tool.name} logo`} />
                                <span>{tool.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
            <section className="features" id="features">
                <div className="sectionTitle">
                    <h2>Everything you need to run email on autopilot</h2>
                    <p>Save time, increase retention and grow revenue with AI.</p>
                </div>

                <div className="featureGrid">
                    {features.map((feature) => (
                        <article className="featureCard" key={feature.title}>
                            <div className="featureIcon">{feature.icon}</div>
                            <h3>{feature.title}</h3>
                            <p>{feature.text}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="testimonial">
                <div>
                    <span className="quoteMark">“</span>
                    <p>
                        Mailgine has transformed the way we run email campaigns. Our
                        engagement is up and our churn is down.
                    </p>

                    <div className="person">
                        <img src="https://i.pravatar.cc/64?img=47" alt="Sarah Thompson" />
                        <div>
                            <strong>Sarah Thompson</strong>
                            <span>Head of Growth, CloudCore</span>
                        </div>
                    </div>
                </div>

                <div className="results">
                    <div>
                        <strong>42%</strong>
                        <span>Increase in open rate</span>
                    </div>
                    <div>
                        <strong>28%</strong>
                        <span>Reduction in churn</span>
                    </div>
                </div>
            </section>

            <section className="finalCta" id="pricing">
                <h2>Ready to transform your email strategy?</h2>
                <p>Join hundreds of SaaS teams already using Mailgine.</p>
                <Link href="/login" className="primaryBtn">Start your 7 days free trial</Link>
                <small>No credit card required · Cancel anytime</small>
            </section>

            <footer className="footer" id="resources">
                <div>
                    <Link href="/" className="brand">
                        <span className="brandMark">◆</span>
                        <span>Mailgine</span>
                    </Link>
                    <p>AI-powered email automation for SaaS teams who care about retention and growth.</p>
                </div>

                <div>
                    <strong>Product</strong>
                    <a href="#features">Features</a>
                    <a href="#integrations">Integrations</a>
                    <a href="#pricing">Pricing</a>
                </div>

                <div>
                    <strong>Company</strong>
                    <a href="#resources">About us</a>
                    <a href="#resources">Careers</a>
                    <a href="#resources">Contact</a>
                </div>

                <div>
                    <strong>Legal</strong>
                    <a href="#resources">Privacy policy</a>
                    <a href="#resources">Terms of service</a>
                    <a href="#resources">Security</a>
                </div>
            </footer>
        </main>
    );
}