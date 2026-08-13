# Code & architecture review snapshots

> ⚠️ **Historical snapshots — predates the 2026-08-12 `people` unification.**
>
> These reviews were written when the backend still had separate
> `handlers/members.rs` (team) and `handlers/contacts.rs` (client-side)
> modules. Migration `014_unify_people.sql` later merged both into a single
> `people` table (`handlers/people.rs`, `models/person.rs`, `PersonSide`).
>
> Any reference below to `members.rs`, `contacts.rs`, `Member`, or
> `ClientContact` describes the **pre-unification** codebase and is kept here
> only for audit history — it is **not** the current structure. For the live
> module map see [`docs/context/modules.md`](../context/modules.md).
>
> Regenerate with a fresh review pass if you need current accuracy.

## Files in this archive

- [`summary.md`](summary.md) — top findings across all review axes
- [`architecture.md`](architecture.md) — layering, coupling, module map
- [`code-quality.md`](code-quality.md) — per-file maintainability metrics
- [`network-resilience.md`](network-resilience.md) — retry / backoff / offline behaviour
- [`runtime-health.md`](runtime-health.md) — health checks, validation, failure surfacing
