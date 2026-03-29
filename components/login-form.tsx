"use client";

import { FormEvent, useState } from "react";

import { getSiteUrl } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { normalizeNextPath } from "@/lib/utils";

interface LoginFormProps {
  nextPath?: string;
  message?: string | null;
}

export function LoginForm({ nextPath, message }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(message ?? null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSentTo(null);
    setIsSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const redirectBase =
        getSiteUrl() ??
        (typeof window !== "undefined" ? window.location.origin : null);

      if (!redirectBase) {
        throw new Error("Site URL is not configured");
      }

      const redirectUrl = new URL(normalizeNextPath(nextPath), redirectBase);

      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl.toString()
        }
      });

      if (authError) {
        throw authError;
      }

      setSentTo(email);
      setEmail("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось отправить ссылку для входа"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel auth-panel">
      <div className="panel-intro">
        <h2>Вход по ссылке из письма</h2>
        <p className="muted">
          Укажите рабочий email. Мы отправим безопасную ссылку, пароль не нужен, а
          состояние проекта сохранится в том же спокойном рабочем контуре.
        </p>
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

        <div className="actions">
          <button className="button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Отправляем ссылку..." : "Отправить ссылку для входа"}
          </button>
        </div>
      </form>

      <p className="helper-copy">
        После входа откроется общий workspace и список ваших проектов, чтобы можно было
        сразу загрузить новую подборку или открыть готовый результат.
      </p>

      {sentTo ? (
        <p className="notice success">
          Письмо уже в пути на {sentTo}. Откройте ссылку из письма, чтобы продолжить.
        </p>
      ) : null}
      {error ? <p className="notice error">{error}</p> : null}
    </section>
  );
}
