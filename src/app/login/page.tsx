"use client";

import "@fontsource/inter";
import "./page.css";

import { Suspense, useState } from "react";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
} from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";

import { auth } from "../../lib/firebase";
import { establishServerSession } from "../../lib/auth/sessionClient";

function LoginPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [mode, setMode] = useState<"login" | "signup">("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    /*
     * Zapier sends users to:
     *
     * /login?returnUrl=/oauth/authorize?client_id=...
     *
     * We only permit internal relative paths. This prevents someone from
     * passing an external website as the returnUrl.
     */
    const requestedReturnUrl = searchParams.get("returnUrl");

    const returnUrl =
        requestedReturnUrl?.startsWith("/") &&
            !requestedReturnUrl.startsWith("//") &&
            !requestedReturnUrl.includes("\\")
            ? requestedReturnUrl
            : "/dashboard";

    function redirectAfterAuthentication() {
        router.replace(returnUrl);
    }

    async function handleEmailAuth() {
        if (!email.trim() || !password) {
            setMessage("Enter your email address and password.");
            return;
        }

        try {
            setLoading(true);
            setMessage("");

            const cleanEmail = email.trim().toLowerCase();

            const credential =
                mode === "login"
                    ? await signInWithEmailAndPassword(
                        auth,
                        cleanEmail,
                        password
                    )
                    : await createUserWithEmailAndPassword(
                        auth,
                        cleanEmail,
                        password
                    );

            await establishServerSession(credential.user);

            redirectAfterAuthentication();
        } catch (error: unknown) {
            console.error("Email authentication error:", error);

            setMessage(
                error instanceof Error
                    ? getReadableFirebaseError(error.message)
                    : "Something went wrong. Please try again."
            );
        } finally {
            setLoading(false);
        }
    }

    async function handleGoogleAuth() {
        try {
            setLoading(true);
            setMessage("");

            const provider = new GoogleAuthProvider();

            provider.setCustomParameters({
                prompt: "select_account",
            });

            const credential = await signInWithPopup(auth, provider);

            await establishServerSession(credential.user);

            redirectAfterAuthentication();
        } catch (error: unknown) {
            console.error("Google authentication error:", error);

            setMessage(
                error instanceof Error
                    ? getReadableFirebaseError(error.message)
                    : "Google login failed. Please try again."
            );
        } finally {
            setLoading(false);
        }
    }

    function handleKeyDown(
        event: React.KeyboardEvent<HTMLInputElement>
    ) {
        if (event.key === "Enter" && !loading) {
            void handleEmailAuth();
        }
    }

    return (
        <main className="loginPage">
            <section className="loginShell">
                <div className="loginBrand">
                    <a href="/" className="brandLogo">
                        Mailgine
                    </a>

                    <div>
                        <span className="loginPill">
                            AI retention email automation
                        </span>

                        <h1>
                            Welcome back to your AI email agent.
                        </h1>

                        <p>
                            Login to manage customer signals, generate
                            retention emails and automate follow-ups before
                            revenue is lost.
                        </p>
                    </div>
                </div>

                <div className="loginCard">
                    <div className="loginHeader">
                        <h2>
                            {mode === "login"
                                ? "Login"
                                : "Create account"}
                        </h2>

                        <p>
                            {mode === "login"
                                ? "Enter your details to access Mailgine."
                                : "Create your Mailgine account to start testing."}
                        </p>
                    </div>

                    <label>
                        Email address

                        <input
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            autoComplete="email"
                            disabled={loading}
                            onChange={(event) =>
                                setEmail(event.target.value)
                            }
                            onKeyDown={handleKeyDown}
                        />
                    </label>

                    <label>
                        Password

                        <input
                            type="password"
                            placeholder="Minimum 6 characters"
                            value={password}
                            autoComplete={
                                mode === "login"
                                    ? "current-password"
                                    : "new-password"
                            }
                            disabled={loading}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            onKeyDown={handleKeyDown}
                        />
                    </label>

                    <button
                        type="button"
                        className="primaryLoginBtn"
                        onClick={() => void handleEmailAuth()}
                        disabled={
                            loading ||
                            !email.trim() ||
                            password.length < 6
                        }
                    >
                        {loading
                            ? "Please wait..."
                            : mode === "login"
                                ? "Login"
                                : "Create account"}
                    </button>

                    <div className="divider">
                        <span />
                        <p>or</p>
                        <span />
                    </div>

                    <button
                        type="button"
                        className="googleLoginBtn"
                        onClick={() => void handleGoogleAuth()}
                        disabled={loading}
                    >
                        Continue with Google
                    </button>

                    {message ? (
                        <p className="authMessage" role="alert">
                            {message}
                        </p>
                    ) : null}

                    <p className="switchMode">
                        {mode === "login"
                            ? "Don't have an account?"
                            : "Already have an account?"}{" "}
                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => {
                                setMessage("");
                                setPassword("");
                                setMode(
                                    mode === "login"
                                        ? "signup"
                                        : "login"
                                );
                            }}
                        >
                            {mode === "login"
                                ? "Sign up"
                                : "Login"}
                        </button>
                    </p>
                </div>
            </section>
        </main>
    );
}

function LoginLoading() {
    return (
        <main className="loginPage">
            <section className="loginShell">
                <div className="loginCard">
                    <div className="loginHeader">
                        <h2>Loading Mailgine</h2>
                        <p>Please wait...</p>
                    </div>
                </div>
            </section>
        </main>
    );
}

function getReadableFirebaseError(message: string): string {
    if (message.includes("auth/invalid-credential")) {
        return "The email address or password is incorrect.";
    }

    if (message.includes("auth/user-not-found")) {
        return "No account was found with this email address.";
    }

    if (message.includes("auth/wrong-password")) {
        return "The password you entered is incorrect.";
    }

    if (message.includes("auth/email-already-in-use")) {
        return "An account already exists with this email address.";
    }

    if (message.includes("auth/weak-password")) {
        return "Your password must contain at least 6 characters.";
    }

    if (message.includes("auth/invalid-email")) {
        return "Enter a valid email address.";
    }

    if (message.includes("auth/popup-closed-by-user")) {
        return "The Google sign-in window was closed before login completed.";
    }

    if (message.includes("auth/popup-blocked")) {
        return "Your browser blocked the Google sign-in window. Allow pop-ups and try again.";
    }

    if (message.includes("auth/network-request-failed")) {
        return "A network error occurred. Check your connection and try again.";
    }

    if (message.includes("auth/too-many-requests")) {
        return "Too many login attempts. Please wait and try again.";
    }

    return "Authentication failed. Please try again.";
}

export default function LoginPage() {
    return (
        <Suspense fallback={<LoginLoading />}>
            <LoginPageContent />
        </Suspense>
    );
}