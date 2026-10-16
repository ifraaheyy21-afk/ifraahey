// src/app/dashboard/layout.tsx

import Sidebar from "../../components/Sidebar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="dashboardShell">
            <Sidebar />
            <main className="dashboardContent">{children}</main>
        </div>
    );
}