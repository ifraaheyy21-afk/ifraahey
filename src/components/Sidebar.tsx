"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  LayoutDashboard,
  Mail,
  PencilRuler,
  Plug,
  Settings,
  Users,
  Workflow,
} from "lucide-react";

import {
  createBlankWorkflow,
  readWorkflows,
  writeWorkflows,
} from "../lib/workflows";
import { auth } from "../lib/firebase";
import styles from "./sidebar.module.css";

type SidebarInboxThread = {
  id: string;
  folder: string;
  unread: boolean;
};

type SidebarInboxFolderCount = {
  folder: string;
  count: number;
};

type SidebarInboxPayload = {
  folders?: SidebarInboxFolderCount[];
  threads?: SidebarInboxThread[];
};

type SidebarInboxCounts = Record<string, number>;

type InboxUnreadChangeEvent = CustomEvent<{
  count?: number;
}>;

const SIDEBAR_COLLAPSED_STORAGE_KEY = "sidebar-collapsed";
const CURRENT_WORKFLOW_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function clearCurrentWorkflowPointers() {
  if (typeof window === "undefined") return;

  for (
    let index = window.localStorage.length - 1;
    index >= 0;
    index -= 1
  ) {
    const key = window.localStorage.key(index);

    if (key?.startsWith("unfinished-workflow:")) {
      window.localStorage.removeItem(key);
    }
  }
}

function currentWorkflowIsFresh(updatedAt: unknown) {
  if (typeof updatedAt !== "string") return false;

  const updatedAtMs = Date.parse(updatedAt);

  if (!Number.isFinite(updatedAtMs)) return false;

  return Date.now() - updatedAtMs < CURRENT_WORKFLOW_MAX_AGE_MS;
}

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Accounts",
    href: "/dashboard/customers",
    icon: Users,
  },
  {
    label: "Email Queue",
    href: "/dashboard/email-queue",
    icon: Mail,
  },
  {
    label: "Email Builder",
    href: "/dashboard/email-builder",
    icon: PencilRuler,
  },
  {
    label: "Integrations",
    href: "/dashboard/integrations",
    icon: Plug,
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

const inboxItems = [
  {
    label: "Sent",
    folder: "sent",
    href: "/dashboard/inbox?folder=sent",
  },
  {
    label: "Received",
    folder: "inbox",
    href: "/dashboard/inbox?folder=inbox",
  },
  {
    label: "Starred",
    folder: "starred",
    href: "/dashboard/inbox?folder=starred",
  },
  {
    label: "Scheduled",
    folder: "scheduled",
    href: "/dashboard/scheduled-emails",
  },
  {
    label: "Drafts",
    folder: "drafts",
    href: "/dashboard/inbox?folder=drafts",
  },
  {
    label: "Deleted",
    folder: "deleted",
    href: "/dashboard/inbox?folder=deleted",
  },
];

function getStoredWorkspaceId() {
  if (typeof window === "undefined") {
    return "demo-workspace";
  }

  return localStorage.getItem("workspaceId") || "demo-workspace";
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isInboxPage =
    pathname === "/dashboard/inbox" ||
    pathname.startsWith("/dashboard/inbox/");

  const isScheduledPage =
    pathname === "/dashboard/scheduled-emails" ||
    pathname.startsWith("/dashboard/scheduled-emails/");

  const isInboxSectionActive = isInboxPage || isScheduledPage;

  const isAutomationPage =
    pathname === "/dashboard/automations/all" ||
    pathname.startsWith("/dashboard/automations/");

  const automationView = searchParams.get("view");

  const [inboxOpen, setInboxOpen] = useState(isInboxSectionActive);
  const [automationsOpen, setAutomationsOpen] = useState(isAutomationPage);
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);
  const [inboxFolderCounts, setInboxFolderCounts] =
    useState<SidebarInboxCounts>({});
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);

  const activeInboxFolder = searchParams.get("folder") || "inbox";

  useEffect(() => {
    const stored = window.localStorage.getItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
    );

    if (stored === "true") {
      setCollapsed(true);
    }

    const navigationEntry = window.performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;

    if (navigationEntry?.type === "reload") {
      clearCurrentWorkflowPointers();
    }

    setSidebarReady(true);
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        clearCurrentWorkflowPointers();
      }
    });
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;

      window.localStorage.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        String(next),
      );

      return next;
    });
  }, []);

  const loadInboxStats = useCallback(async () => {
    try {
      const workspaceId = getStoredWorkspaceId();

      const response = await fetch(
        `/api/dashboard/inbox?workspaceId=${encodeURIComponent(workspaceId)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        return;
      }

      const result = (await response.json()) as SidebarInboxPayload;
      const threads = result.threads ?? [];

      const nextUnreadCount = threads.filter(
        (thread) => thread.folder === "inbox" && thread.unread,
      ).length;

      const nextFolderCounts: SidebarInboxCounts = {};

      if (Array.isArray(result.folders)) {
        for (const item of result.folders) {
          nextFolderCounts[item.folder] = item.count;
        }
      } else {
        for (const thread of threads) {
          nextFolderCounts[thread.folder] =
            (nextFolderCounts[thread.folder] ?? 0) + 1;
        }
      }

      setUnreadInboxCount(nextUnreadCount);
      setInboxFolderCounts(nextFolderCounts);
    } catch {
      // Keep the previous counts if the inbox request temporarily fails.
    }
  }, []);

  useEffect(() => {
    if (isInboxSectionActive && !collapsed) {
      setInboxOpen(true);
    }
  }, [collapsed, isInboxSectionActive]);

  useEffect(() => {
    if (isAutomationPage && !collapsed) {
      setAutomationsOpen(true);
    }
  }, [collapsed, isAutomationPage]);

  useEffect(() => {
    loadInboxStats();

    const handleUnreadChange = (event: Event) => {
      const unreadEvent = event as InboxUnreadChangeEvent;

      if (typeof unreadEvent.detail?.count === "number") {
        setUnreadInboxCount(Math.max(0, unreadEvent.detail.count));
      }

      // Refresh all folder totals as well, because inbox actions can move
      // a thread between Received, Starred, Drafts, Deleted, etc.
      loadInboxStats();
    };

    const handleWindowFocus = () => {
      loadInboxStats();
    };

    window.addEventListener(
      "inbox-unread-changed",
      handleUnreadChange,
    );
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.removeEventListener(
        "inbox-unread-changed",
        handleUnreadChange,
      );
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [loadInboxStats]);

  function createWorkflow() {
    const workspaceId = getStoredWorkspaceId();
    const unfinishedKey = `unfinished-workflow:${workspaceId}`;

    try {
      const stored = window.localStorage.getItem(unfinishedKey);

      if (stored) {
        const unfinished = JSON.parse(stored) as {
          id?: unknown;
          updatedAt?: unknown;
        };

        if (
          typeof unfinished.id === "string" &&
          unfinished.id.trim() &&
          currentWorkflowIsFresh(unfinished.updatedAt)
        ) {
          router.push(`/dashboard/automations/${unfinished.id}`);
          return;
        }

        window.localStorage.removeItem(unfinishedKey);
      }
    } catch {
      window.localStorage.removeItem(unfinishedKey);
    }

    const workflow = createBlankWorkflow();
    const workflows = readWorkflows();

    writeWorkflows([workflow, ...workflows]);
    router.push(`/dashboard/automations/${workflow.id}`);
  }

  const renderNavItem = (item: (typeof navItems)[number]) => {
    const Icon = item.icon;

    const isActive =
      item.href === "/dashboard"
        ? pathname === "/dashboard"
        : pathname === item.href ||
        pathname.startsWith(`${item.href}/`);

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`${styles.sidebarLink} ${isActive ? styles.active : ""
          }`}
        title={collapsed ? item.label : undefined}
        aria-label={collapsed ? item.label : undefined}
      >
        <Icon />
        <span className={styles.sidebarLabel}>{item.label}</span>
      </Link>
    );
  };

  return (
    <aside
      className={`${styles.emailSidebar} ${collapsed ? styles.emailSidebarCollapsed : ""
        } ${sidebarReady ? styles.emailSidebarReady : ""}`}
    >
      <div className={styles.sidebarTop}>
        <button
          type="button"
          className={styles.collapseButton}
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight size={18} strokeWidth={1.8} />
          ) : (
            <ChevronLeft size={18} strokeWidth={1.8} />
          )}
        </button>
      </div>

      {!collapsed && (
        <input
          className={styles.sidebarSearchInput}
          placeholder="Search"
          aria-label="Search navigation"
        />
      )}

      <nav className={styles.sideNav}>
        {navItems.slice(0, 2).map(renderNavItem)}

        <div className={styles.inboxNavigation}>
          <button
            type="button"
            className={`${styles.sidebarLink} ${styles.inboxToggle} ${isInboxSectionActive ? styles.active : ""
              }`}
            aria-expanded={!collapsed && inboxOpen}
            aria-controls="inbox-submenu"
            aria-label={collapsed ? "Inbox" : undefined}
            title={collapsed ? "Inbox" : undefined}
            onClick={() => {
              if (collapsed) {
                setCollapsed(false);
                window.localStorage.setItem(
                  SIDEBAR_COLLAPSED_STORAGE_KEY,
                  "false",
                );
                setInboxOpen(true);
                return;
              }

              setInboxOpen((current) => !current);
            }}
          >
            <Inbox />

            <span
              className={`${styles.inboxToggleLabel} ${styles.sidebarLabel}`}
            >
              Inbox
            </span>

            {unreadInboxCount > 0 && (
              <span
                className={styles.inboxUnreadCount}
                aria-label={`${unreadInboxCount} unopened ${unreadInboxCount === 1 ? "email" : "emails"
                  }`}
              >
                {unreadInboxCount > 99 ? "99+" : unreadInboxCount}
              </span>
            )}

            {!collapsed && (
              <ChevronDown
                className={`${styles.inboxChevron} ${inboxOpen ? styles.inboxChevronOpen : ""
                  }`}
              />
            )}
          </button>

          <div
            id="inbox-submenu"
            className={`${styles.inboxSubmenu} ${!collapsed && inboxOpen
                ? styles.inboxSubmenuOpen
                : ""
              }`}
          >
            <div className={styles.inboxSubmenuInner}>
              {inboxItems.map((item) => {
                const isActive =
                  item.folder === "scheduled"
                    ? isScheduledPage
                    : isInboxPage &&
                    activeInboxFolder === item.folder;

                return (
                  <Link
                    key={item.folder}
                    href={item.href}
                    className={`${styles.inboxSubmenuLink} ${isActive
                        ? styles.inboxSubmenuLinkActive
                        : ""
                      }`}
                  >
                    <span>{item.label}</span>
                    <span className={styles.inboxSubmenuCount}>
                      {inboxFolderCounts[item.folder] ?? 0}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {navItems.slice(2, 4).map(renderNavItem)}

        <div className={styles.inboxNavigation}>
          <button
            type="button"
            className={`${styles.sidebarLink} ${styles.inboxToggle} ${isAutomationPage ? styles.active : ""
              }`}
            aria-expanded={!collapsed && automationsOpen}
            aria-controls="automations-submenu"
            aria-label={collapsed ? "Automations" : undefined}
            title={collapsed ? "Automations" : undefined}
            onClick={() => {
              if (collapsed) {
                setCollapsed(false);
                window.localStorage.setItem(
                  SIDEBAR_COLLAPSED_STORAGE_KEY,
                  "false",
                );
                setAutomationsOpen(true);
                return;
              }

              setAutomationsOpen((current) => !current);
            }}
          >
            <Workflow />

            <span
              className={`${styles.inboxToggleLabel} ${styles.sidebarLabel}`}
            >
              Automations
            </span>

            {!collapsed && (
              <ChevronDown
                className={`${styles.inboxChevron} ${automationsOpen
                    ? styles.inboxChevronOpen
                    : ""
                  }`}
              />
            )}
          </button>

          <div
            id="automations-submenu"
            className={`${styles.inboxSubmenu} ${!collapsed && automationsOpen
                ? styles.inboxSubmenuOpen
                : ""
              }`}
          >
            <div className={styles.inboxSubmenuInner}>
              <Link
                href="/dashboard/automations/all"
                className={`${styles.inboxSubmenuLink} ${pathname === "/dashboard/automations/all" &&
                    automationView !== "active"
                    ? styles.inboxSubmenuLinkActive
                    : ""
                  }`}
              >
                <span>All workflows</span>
              </Link>

              <button
                type="button"
                className={`${styles.inboxSubmenuLink} ${styles.automationAction}`}
                onClick={createWorkflow}
              >
                <span>Create workflow</span>
              </button>
            </div>
          </div>
        </div>

        {navItems.slice(4).map(renderNavItem)}
      </nav>
    </aside>
  );
}
