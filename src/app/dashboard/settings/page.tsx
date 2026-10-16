"use client";

import "@fontsource/inter";

import { Check } from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";

import {
    integrations,
    personalDetails,
    planDetails,
    settingsTabs,
    supportDetails,
    type SettingsTabId,
} from "../../../lib/settingsData";

import { auth } from "../../../lib/firebase";

import "./settings.css";

type BillingCycle = "monthly" | "annual";


function formatSettingLabel(key: string) {
    return key
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

type BasePricingPlan = {
    name: string;
    description: string;
    features: readonly string[];
    popular?: boolean;
};

type StandardPricingPlan = BasePricingPlan & {
    kind: "standard";
    monthlyPrice: number;
    annualPrice: number;
};

type CustomPricingPlan = BasePricingPlan & {
    kind: "custom";
};

type PricingPlan = StandardPricingPlan | CustomPricingPlan;

const pricingPlans: readonly PricingPlan[] = [
    {
        kind: "standard",
        name: "Starter",
        description: "For growing teams getting started",
        monthlyPrice: 149,
        annualPrice: 119,
        features: [
            "AI-powered email automation",
            "Inbox and email queue",
            "Customer account profiles",
            "Email builder and templates",
            "Core integrations",
        ],
    },
    {
        kind: "standard",
        name: "Pro",
        description: "For teams scaling their workflows",
        monthlyPrice: 299,
        annualPrice: 239,
        popular: true,
        features: [
            "Everything in Starter",
            "Advanced AI automations",
            "Priority workflow processing",
            "Advanced integrations",
            "Priority support",
            "Detailed activity insights",
        ],
    },
    {
        kind: "custom",
        name: "Enterprise",
        description: "For larger and high-volume teams",
        features: [
            "Everything in Pro",
            "Custom workflow requirements",
            "Advanced security controls",
            "Dedicated support",
            "Custom integrations",
            "Priority onboarding",
        ],
    },
];

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<SettingsTabId>("personal");
    const [billingCycle, setBillingCycle] =
        useState<BillingCycle>("monthly");
    const [firebaseUser, setFirebaseUser] = useState<User | null>(
        () => auth.currentUser,
    );

    useEffect(() => {
        return onAuthStateChanged(auth, (user) => {
            setFirebaseUser(user);
        });
    }, []);

    const profileImageUrl = firebaseUser?.photoURL?.trim() || "";

    const profileInitials = useMemo(() => {
        const source =
            firebaseUser?.displayName?.trim() ||
            personalDetails.name?.trim() ||
            firebaseUser?.email?.trim() ||
            personalDetails.email?.trim() ||
            "";

        const parts = source
            .split(/\s+/)
            .map((part) => part.trim())
            .filter(Boolean);

        if (parts.length === 0) {
            return "U";
        }

        if (parts.length === 1) {
            return parts[0].slice(0, 1).toUpperCase();
        }

        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }, [firebaseUser]);

    return (
        <main className="settingsPage">
            <section className="settingsHeader">
                <div>
                    <h1>Settings</h1>
                    <p>Manage your account, plan, integrations and support.</p>
                </div>
            </section>

            <section className="settingsShell">
                <aside className="settingsTabs">
                    {settingsTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;

                        return (
                            <button
                                key={tab.id}
                                className={`settingsTab ${isActive ? "active" : ""
                                    }`}
                                onClick={() => setActiveTab(tab.id)}
                                type="button"
                            >
                                <Icon size={17} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </aside>

                <section
                    className={`settingsPanel ${activeTab === "plan"
                            ? "settingsPanelPlan"
                            : activeTab === "personal"
                                ? "settingsPanelPersonal"
                                : ""
                        }`}
                >
                    {activeTab === "personal" && (
                        <div className="personalDetailsContent">
                            <div className="personalDetailsHeader">
                                <h2>Personal details</h2>
                                <p>
                                    Your account and workspace information.
                                </p>
                            </div>

                            <section
                                className="profileDetailsSection"
                                aria-labelledby="profile-details-heading"
                            >
                                <div className="profileDetailsSectionHeader">
                                    <h3 id="profile-details-heading">
                                        Profile
                                    </h3>
                                    <p>
                                        Details associated with your account.
                                    </p>
                                </div>

                                <div className="profilePhotoRow">
                                    <div className="profilePhotoLabel">
                                        <strong>Profile image</strong>
                                        <span>
                                            Displayed with your account.
                                        </span>
                                    </div>

                                    <div className="profilePhotoValue">
                                        {profileImageUrl ? (
                                            <img
                                                className="profileAvatarImage"
                                                src={profileImageUrl}
                                                alt=""
                                                referrerPolicy="no-referrer"
                                            />
                                        ) : (
                                            <div
                                                className="profileAvatarFallback"
                                                aria-label="Profile image fallback"
                                            >
                                                {profileInitials}
                                            </div>
                                        )}

                                        <div className="profilePhotoMeta">
                                            <strong>
                                                {firebaseUser?.displayName ||
                                                    personalDetails.name}
                                            </strong>
                                            <span>
                                                {profileImageUrl
                                                    ? "Synced from your sign-in account"
                                                    : "Using your initials until a profile photo is available"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <dl className="profileDetailsList">
                                    {Object.entries(personalDetails).map(
                                        ([key, value]) => (
                                            <div
                                                className="profileDetailRow"
                                                key={key}
                                            >
                                                <dt>
                                                    {formatSettingLabel(key)}
                                                </dt>
                                                <dd>
                                                    {value == null ||
                                                        value === ""
                                                        ? "—"
                                                        : String(value)}
                                                </dd>
                                            </div>
                                        ),
                                    )}
                                </dl>
                            </section>
                        </div>
                    )}

                    {activeTab === "plan" && (
                        <div className="planContent">
                            <div className="planHero">
                                <span className="planEyebrow">Plans</span>

                                <h2>Plans for every business</h2>

                                <p>
                                    Choose the plan that fits your workflow
                                    today. You can upgrade as your team grows.
                                </p>

                                <div
                                    className="billingToggle"
                                    aria-label="Billing cycle"
                                >
                                    <button
                                        className={
                                            billingCycle === "monthly"
                                                ? "billingToggleButton active"
                                                : "billingToggleButton"
                                        }
                                        onClick={() =>
                                            setBillingCycle("monthly")
                                        }
                                        type="button"
                                    >
                                        Monthly
                                    </button>

                                    <button
                                        className={
                                            billingCycle === "annual"
                                                ? "billingToggleButton active"
                                                : "billingToggleButton"
                                        }
                                        onClick={() =>
                                            setBillingCycle("annual")
                                        }
                                        type="button"
                                    >
                                        Annual
                                        <span>Save 20%</span>
                                    </button>
                                </div>
                            </div>

                            <div className="pricingGrid">
                                {pricingPlans.map((plan) => {
                                    const isCurrentPlan =
                                        plan.name.toLowerCase() ===
                                        planDetails.plan.toLowerCase();

                                    return (
                                        <article
                                            className={`pricingCard ${plan.popular
                                                    ? "pricingCardPopular"
                                                    : ""
                                                }`}
                                            key={plan.name}
                                        >
                                            <div className="pricingCardTop">
                                                <div className="pricingTitleRow">
                                                    <h3>{plan.name}</h3>

                                                    {plan.popular && (
                                                        <span className="popularBadge">
                                                            <span
                                                                className="popularDot"
                                                                aria-hidden="true"
                                                            />
                                                            Popular
                                                        </span>
                                                    )}

                                                    {isCurrentPlan && (
                                                        <span className="currentPlanBadge">
                                                            {
                                                                planDetails.status
                                                            }
                                                        </span>
                                                    )}
                                                </div>

                                                <p className="pricingDescription">
                                                    {plan.description}
                                                </p>

                                                <div className="pricingPrice">
                                                    {plan.kind === "custom" ? (
                                                        <strong>Custom</strong>
                                                    ) : (
                                                        <>
                                                            <strong>
                                                                £
                                                                {billingCycle ===
                                                                    "monthly"
                                                                    ? plan.monthlyPrice
                                                                    : plan.annualPrice}
                                                            </strong>
                                                            <span>/ month</span>
                                                        </>
                                                    )}
                                                </div>

                                                {plan.kind === "standard" &&
                                                    billingCycle ===
                                                    "annual" && (
                                                        <p className="annualNote">
                                                            Billed annually
                                                        </p>
                                                    )}

                                                <button
                                                    className={
                                                        plan.popular
                                                            ? "planButton planButtonPrimary"
                                                            : "planButton"
                                                    }
                                                    type="button"
                                                >
                                                    {isCurrentPlan
                                                        ? "Current plan"
                                                        : plan.kind === "custom"
                                                            ? "Contact sales"
                                                            : "Get started"}
                                                </button>
                                            </div>

                                            <div className="pricingDivider" />

                                            <ul className="featureList">
                                                {plan.features.map(
                                                    (feature) => (
                                                        <li key={feature}>
                                                            <span className="featureCheck">
                                                                <Check
                                                                    size={13}
                                                                />
                                                            </span>

                                                            <span>
                                                                {feature}
                                                            </span>
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        </article>
                                    );
                                })}
                            </div>

                            <div className="trialStrip">
                                <div>
                                    <strong>
                                        Try it with your workflow
                                    </strong>

                                    <p>
                                        Explore the core automation experience
                                        before deciding which plan is right
                                        for your team.
                                    </p>
                                </div>

                                <button
                                    className="trialButton"
                                    type="button"
                                >
                                    Start free trial
                                </button>
                            </div>

                            <div className="billingFooter">
                                <span>
                                    Current subscription:{" "}
                                    <strong>{planDetails.plan}</strong>{" "}
                                    {planDetails.price}
                                </span>

                                <button
                                    className="primaryBtn"
                                    type="button"
                                >
                                    Manage billing
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === "integrations" && (
                        <div className="settingsContent">
                            <h2>Manage integrations</h2>

                            <p className="settingsMuted">
                                Connect the tools your email agent uses.
                            </p>

                            <div className="integrationList">
                                {integrations.map((integration) => (
                                    <div
                                        className="integrationRow"
                                        key={integration.name}
                                    >
                                        <div>
                                            <strong>
                                                {integration.name}
                                            </strong>
                                            <p>
                                                {
                                                    integration.description
                                                }
                                            </p>
                                        </div>

                                        <button
                                            className={
                                                integration.connected
                                                    ? "secondaryBtn connected"
                                                    : "secondaryBtn"
                                            }
                                            type="button"
                                        >
                                            {integration.connected
                                                ? "Connected"
                                                : "Connect"}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === "support" && (
                        <div className="settingsContent">
                            <h2>Contact support</h2>

                            <p className="settingsMuted">
                                Need help with your account or email agent?
                            </p>

                            <div className="supportBox">
                                <span>Email us</span>
                                <strong>{supportDetails.email}</strong>
                                <p>{supportDetails.responseTime}</p>
                            </div>

                            <button
                                className="primaryBtn"
                                type="button"
                            >
                                Contact support
                            </button>
                        </div>
                    )}
                </section>
            </section>
        </main>
    );
}
