import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Noto_Serif } from "next/font/google";

import { signOutAction } from "@/app/actions";
import { hasRequiredWebEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import "./globals.css";

const notoSerif = Noto_Serif({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-serif"
});

export const metadata: Metadata = {
  title: "Photo Sorter",
  description: "Web-first photo sorting by faces with Supabase and Vercel."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  let userEmail: string | null = null;

  if (hasRequiredWebEnv()) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  }

  return (
    <html lang="ru">
      <body className={notoSerif.variable}>
        <main>
          <div className="shell">
            <header className="topbar">
              <Link className="brand" href="/">
                Photo Sorter
              </Link>
              <nav>
                <Link href="/">Dashboard</Link>
                {userEmail ? (
                  <>
                    <span className="muted">{userEmail}</span>
                    <form action={signOutAction}>
                      <button className="link-button" type="submit">
                        Sign out
                      </button>
                    </form>
                  </>
                ) : (
                  <Link href="/login">Login</Link>
                )}
              </nav>
            </header>
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
