import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Photo Sorter",
  description: "Web-first photo sorting by faces with Supabase and Vercel."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <main>
          <div className="shell">
            <header className="topbar">
              <Link className="brand" href="/">
                Photo Sorter
              </Link>
              <nav>
                <Link href="/">Workspaces</Link>
                <Link href="/login">Login</Link>
              </nav>
            </header>
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
