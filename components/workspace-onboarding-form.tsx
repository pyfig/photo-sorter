"use client";

import { useActionState } from "react";

import { createWorkspaceAction } from "@/app/actions";

export function WorkspaceOnboardingForm() {
  const initialState = {
    error: null as string | null
  };
  const [state, action, isPending] = useActionState(
    createWorkspaceAction,
    initialState
  );

  return (
    <section className="panel">
      <h2>Создать workspace</h2>
      <p className="muted">
        Первый workspace нужен для изоляции данных, upload batches и processing jobs.
      </p>

      <form action={action} className="form-grid">
        <label className="field">
          <span>Название</span>
          <input
            defaultValue=""
            name="name"
            placeholder="TechCommunity Fest Moscow"
            required
            type="text"
          />
        </label>

        <label className="field">
          <span>Slug</span>
          <input
            defaultValue=""
            name="slug"
            placeholder="techcommunity-fest-moscow"
            type="text"
          />
        </label>

        <div className="actions">
          <button className="button" disabled={isPending} type="submit">
            {isPending ? "Создание..." : "Создать workspace"}
          </button>
        </div>
      </form>

      {state.error ? <p className="notice error">{state.error}</p> : null}
    </section>
  );
}
