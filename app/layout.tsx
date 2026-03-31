import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Noto_Sans, Noto_Serif } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";

import { signOutAction } from "@/app/actions";
import { BrandMark } from "@/components/brand-mark";
import { hasRequiredWebEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import "./globals.css";

const notoSans = Noto_Sans({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-sans"
});

const notoSerif = Noto_Serif({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-serif"
});

export const metadata: Metadata = {
  title: {
    default: "Photo Sorter",
    template: "%s | Photo Sorter"
  },
  description:
    "Photo Sorter собирает загрузки, очереди обработки и готовые результаты в единый спокойный интерфейс для работы с большими фотосъёмками."
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
      <body className={`${notoSans.variable} ${notoSerif.variable}`}>
        <main>
          <div className="shell">
            <header className="topbar">
              <Link className="brand" href="/">
                <span className="brand-mark-shell">
                  <BrandMark className="brand-mark" />
                </span>
                <span className="brand-copy-block">
                  <span className="brand-title-row">
                    <span className="brand-title">Photo Sorter</span>
                  </span>
                  <span className="brand-copy">Загрузка, обработка и результаты в одном месте</span>
                </span>
              </Link>
              <nav className="topnav">
                <Link className="nav-link" href="/">
                  Проекты
                </Link>
                {userEmail ? (
                  <>
                    <span className="user-pill">{userEmail}</span>
                    <form action={signOutAction}>
                      <button className="link-button nav-link nav-link-ghost" type="submit">
                        Выйти
                      </button>
                    </form>
                  </>
                ) : (
                  <Link className="nav-link" href="/login">
                    Войти
                  </Link>
                )}
              </nav>
            </header>
            <div className="content-shell">{children}</div>
          </div>
        </main>
        <Analytics />
      </body>
    </html>
  );
}
