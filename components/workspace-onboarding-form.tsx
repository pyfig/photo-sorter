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
      <h2>Создайте новый workspace</h2>
      <p className="muted">
        Общий набор уже доступен сразу после входа. Здесь можно создать отдельный workspace
        под клиента, событие или конкретную фотосъёмку, чтобы разнести потоки обработки по
        понятным рабочим зонам.
      </p>

      <form action={action} className="form-grid">
        <label className="field">
          <span>Название проекта</span>
          <input
            defaultValue=""
            name="name"
            placeholder="Корпоратив Acme, июль"
            required
            type="text"
          />
        </label>

        <label className="field">
          <span>Короткий адрес</span>
          <input
            defaultValue=""
            name="slug"
            placeholder="acme-july-event"
            type="text"
          />
        </label>

        <p className="helper-copy">
          Если оставить короткий адрес пустым, он появится автоматически по названию проекта.
        </p>

        <div className="actions">
          <button className="button" disabled={isPending} type="submit">
            {isPending ? "Создаём проект..." : "Создать проект"}
          </button>
        </div>
      </form>

      {state.error ? <p className="notice error">{state.error}</p> : null}
    </section>
  );
}
