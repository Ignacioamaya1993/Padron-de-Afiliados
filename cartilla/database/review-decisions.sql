-- Shared review decisions. Accessible only through the authorized admin API.
create table public.revision_decisiones (
    id bigint generated always as identity primary key,
    profesional_id bigint not null references public.profesionales(id) on delete cascade,
    field text not null check (field in ('name', 'specialty', 'address', 'phone')),
    source_identity text not null check (length(source_identity) between 1 and 2000),
    current_value text not null check (length(current_value) <= 2000),
    source_value text not null check (length(source_value) <= 2000),
    fingerprint text not null unique check (fingerprint ~ '^[a-f0-9]{64}$'),
    decided_by uuid references auth.users(id) on delete set null,
    decided_at timestamptz not null default now(),
    revoked_at timestamptz
);

create index revision_decisiones_profesional_idx on public.revision_decisiones(profesional_id);
create index revision_decisiones_decided_by_idx on public.revision_decisiones(decided_by);
alter table public.revision_decisiones enable row level security;
revoke all on table public.revision_decisiones from public, anon, authenticated;
revoke all on sequence public.revision_decisiones_id_seq from public, anon, authenticated;
grant select, insert, update, delete on table public.revision_decisiones to service_role;
grant usage, select on sequence public.revision_decisiones_id_seq to service_role;
comment on table public.revision_decisiones is 'Decisiones de conservar por campo; solo API administrativa con autorización explícita. Sin acceso público.';
