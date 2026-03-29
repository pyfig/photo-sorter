"use client";

import { FormEvent, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { normalizeNextPath } from "@/lib/utils";

interface LoginFormProps {
  nextPath?: string;
  message?: string | null;
}

type AuthMode = "sign-in" | "sign-up";

export function LoginForm({ nextPath, message }: LoginFormProps) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(message ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const safeNextPath = normalizeNextPath(nextPath);
      const authResponse =
        mode === "sign-in"
          ? await supabase.auth.signInWithPassword({
              email,
              password
            })
          : await supabase.auth.signUp({
              email,
              password
            });

      if (authResponse.error) {
        throw authResponse.error;
      }

      const session = authResponse.data.session;

      if (!session) {
        throw new Error(
          "Supabase не выдал session после регистрации. Проверьте, что email confirmation отключен."
        );
      }

      const bootstrapResponse = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          next: safeNextPath,
          accessToken: session.access_token,
          refreshToken: session.refresh_token
        })
      });

      const payload = (await bootstrapResponse.json().catch(() => null)) as
        | { error?: string; redirectTo?: string }
        | null;

      if (!bootstrapResponse.ok) {
        throw new Error(payload?.error ?? "Не удалось завершить вход.");
      }

      setPassword("");
      window.location.assign(payload?.redirectTo ?? safeNextPath);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : mode === "sign-in"
            ? "Не удалось выполнить вход"
            : "Не удалось завершить регистрацию"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel auth-panel">
      <div className="panel-intro">
        <h2>Вход и регистрация по email и паролю</h2>
        <p className="muted">
          Нужен только рабочий email и пароль. Без magic link, без отдельного callback
          flow.
        </p>
      </div>

      <div className="auth-mode-switch" role="tablist" aria-label="Режим авторизации">
        <button
          aria-selected={mode === "sign-in"}
          className={`auth-mode-button${mode === "sign-in" ? " is-active" : ""}`}
          onClick={() => setMode("sign-in")}
          role="tab"
          type="button"
        >
          Войти
        </button>
        <button
          aria-selected={mode === "sign-up"}
          className={`auth-mode-button${mode === "sign-up" ? " is-active" : ""}`}
          onClick={() => setMode("sign-up")}
          role="tab"
          type="button"
        >
          Регистрация
        </button>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
        </label>

        <label className="field">
          <span>Пароль</span>
          <input
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            minLength={6}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Минимум 6 символов"
            required
            type="password"
            value={password}
          />
        </label>

        <div className="actions">
          <button className="button" disabled={isSubmitting} type="submit">
            {isSubmitting
              ? mode === "sign-in"
                ? "Входим..."
                : "Создаём аккаунт..."
              : mode === "sign-in"
                ? "Войти"
                : "Создать аккаунт"}
          </button>
        </div>
      </form>

      <p className="helper-copy">
        После успешного входа откроется общий workspace и список ваших проектов, чтобы
        можно было сразу загрузить новую подборку или открыть готовый результат.
      </p>

      {error ? <p className="notice error">{error}</p> : null}
    </section>
  );
}
