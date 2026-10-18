"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { emailFrameDocument } from "../../../lib/email-html";
import styles from "./inbox-page.module.css";

/**
 * Shows email HTML in a sandboxed frame. Scripts, forms and plugins cannot run
 * and links open in a new tab, so a hostile email cannot touch the dashboard.
 * The frame grows to fit its content.
 */
export default function EmailFrame({ html }: { html: string }) {
    const frameRef = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState(40);
    const document = useMemo(() => emailFrameDocument(html), [html]);

    useEffect(() => {
        const frame = frameRef.current;
        if (!frame) return;
        let observer: ResizeObserver | null = null;

        const measure = () => {
            const body = frame.contentDocument?.body;
            if (!body) return;
            // The body's own height, not the frame's, so short emails shrink.
            setHeight(Math.max(24, Math.ceil(body.getBoundingClientRect().height)));
        };
        const handleLoad = () => {
            measure();
            observer?.disconnect();
            const body = frame.contentDocument?.body;
            if (body && typeof ResizeObserver !== "undefined") {
                observer = new ResizeObserver(measure);
                observer.observe(body);
            }
            // Images change the height as they arrive.
            frame.contentDocument?.querySelectorAll("img").forEach((image) => image.addEventListener("load", measure));
        };

        frame.addEventListener("load", handleLoad);
        if (frame.contentDocument?.readyState === "complete") handleLoad();
        return () => {
            frame.removeEventListener("load", handleLoad);
            observer?.disconnect();
        };
    }, [document]);

    return (
        <iframe
            ref={frameRef}
            className={styles.emailFrame}
            title="Email content"
            srcDoc={document}
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            style={{ height }}
        />
    );
}
