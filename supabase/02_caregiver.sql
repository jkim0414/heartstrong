-- Caregiver sharing: a patient creates a share code; a caregiver redeems it and
-- can then READ (only) the patient's data. Re-runnable (idempotent).

create extension if not exists pgcrypto;

create table if not exists public.care_links (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references auth.users (id) on delete cascade,
  patient_label text,
  code          text unique not null,
  caregiver_id  uuid references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz
);

alter table public.care_links enable row level security;

-- The patient fully manages their own share links.
drop policy if exists "patient manages links" on public.care_links;
create policy "patient manages links" on public.care_links
  for all using (auth.uid() = patient_id) with check (auth.uid() = patient_id);

-- A caregiver can see the links they've accepted...
drop policy if exists "caregiver sees own links" on public.care_links;
create policy "caregiver sees own links" on public.care_links
  for select using (auth.uid() = caregiver_id);

-- ...and remove themselves (stop following).
drop policy if exists "caregiver removes own link" on public.care_links;
create policy "caregiver removes own link" on public.care_links
  for delete using (auth.uid() = caregiver_id);

grant select, insert, update, delete on public.care_links to authenticated;

-- Once linked, a caregiver may READ the patient's app_state (RLS, read-only).
drop policy if exists "caregiver reads patient state" on public.app_state;
create policy "caregiver reads patient state" on public.app_state
  for select using (
    exists (
      select 1 from public.care_links cl
      where cl.patient_id = app_state.user_id
        and cl.caregiver_id = auth.uid()
    )
  );

-- Redeem a share code. SECURITY DEFINER so it can look up + claim a pending row
-- by code without exposing the whole table to reads.
create or replace function public.claim_care_link(p_code text)
returns table (patient_id uuid, patient_label text)
language plpgsql
security definer
set search_path = public
as $$
declare r public.care_links;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select * into r from public.care_links where code = upper(trim(p_code));
  if not found then
    raise exception 'That code was not found';
  end if;
  if r.patient_id = auth.uid() then
    raise exception 'You cannot follow your own account';
  end if;
  if r.caregiver_id is not null and r.caregiver_id <> auth.uid() then
    raise exception 'That code has already been used';
  end if;
  update public.care_links
    set caregiver_id = auth.uid(), accepted_at = now()
    where id = r.id;
  return query select r.patient_id, r.patient_label;
end;
$$;

grant execute on function public.claim_care_link(text) to authenticated;
