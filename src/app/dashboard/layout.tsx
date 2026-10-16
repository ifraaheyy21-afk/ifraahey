// src/app/dashboard/layout.tsx

import Sidebar from "../../components/Sidebar";
import SessionGate from "../../components/SessionGate";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <SessionGate>
            <div className="dashboardShell">
                <Sidebar />
                <main className="dashboardContent">{children}</main>
            </div>
        </SessionGate>
    );
}
