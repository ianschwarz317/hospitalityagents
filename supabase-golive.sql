-- ============================================================
-- HospitalityAgents.co — Supabase Go-Live SQL
-- Run this entire file in Supabase SQL Editor → New Query
-- ============================================================


-- ── 1. PARTNER INQUIRIES TABLE ────────────────────────────
create table if not exists partner_inquiries (
  id         uuid primary key default gen_random_uuid(),
  company    text not null,
  name       text not null,
  email      text not null,
  website    text,
  category   text not null,
  message    text not null,
  interests  text,
  created_at timestamptz default now()
);

alter table partner_inquiries enable row level security;

drop policy if exists "Anyone can insert partner inquiries" on partner_inquiries;
create policy "Anyone can insert partner inquiries"
  on partner_inquiries for insert
  with check (true);


-- ── 2. PROFILES TABLE (if not already created) ────────────
create table if not exists profiles (
  id         uuid primary key references auth.users on delete cascade,
  name       text,
  bio        text,
  website    text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists "Users can read own profile" on profiles;
create policy "Users can read own profile"
  on profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on profiles;
create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);


-- ── 3. LISTINGS TABLE RLS AUDIT ───────────────────────────
-- Run these to ensure RLS is properly locked down.
-- If the table doesn't exist yet, this creates it.

create table if not exists listings (
  id             bigint primary key generated always as identity,
  type           text not null check (type in ('persona', 'skill')),
  category       text not null,
  emoji          text default '🤖',
  name           text not null,
  tagline        text not null,
  description    text,
  about          text,
  price          integer not null,
  version        integer default 1,
  sales          integer default 0,
  rating         numeric(3,1),
  review_count   integer default 0,
  capabilities   text[],
  platforms      text[],
  creator_id     uuid references auth.users on delete cascade,
  creator_name   text,
  creator_initial text,
  creator_bio    text,
  approved       boolean default false,
  created_at     timestamptz default now()
);

alter table listings enable row level security;

-- Anyone can read approved listings
drop policy if exists "Public can read approved listings" on listings;
create policy "Public can read approved listings"
  on listings for select
  using (approved = true);

-- Authenticated users can read their own (including pending)
drop policy if exists "Creators can read own listings" on listings;
create policy "Creators can read own listings"
  on listings for select
  using (auth.uid() = creator_id);

-- Authenticated users can insert
drop policy if exists "Authenticated can insert listings" on listings;
create policy "Authenticated can insert listings"
  on listings for insert
  with check (auth.uid() = creator_id);

-- Creators can update their own (non-approved) listings only
drop policy if exists "Creators can update own listings" on listings;
create policy "Creators can update own listings"
  on listings for update
  using (auth.uid() = creator_id and approved = false);

-- Note: DELETE and approve/unapprove should only be done via
-- the admin.html panel (logged in as admin via Supabase Auth)
-- or via Supabase dashboard directly.


-- ── 4. AGENT REQUESTS RLS (verify) ───────────────────────
alter table if exists agent_requests enable row level security;

drop policy if exists "Anyone can insert agent requests" on agent_requests;
create policy "Anyone can insert agent requests"
  on agent_requests for insert
  with check (true);


-- ── 5. CONTACT MESSAGES RLS (verify) ─────────────────────
alter table if exists contact_messages enable row level security;

drop policy if exists "Anyone can insert contact messages" on contact_messages;
create policy "Anyone can insert contact messages"
  on contact_messages for insert
  with check (true);


-- ── 6. ADMIN READ POLICIES ───────────────────────────────
-- Allows your admin Supabase Auth user to read all tables.
-- Replace 'schwarzfish98+6@gmail.com' with your actual admin email
-- if different. This uses a helper function approach.

-- Allow admin to read all listings (including unapproved)
drop policy if exists "Admin can read all listings" on listings;
create policy "Admin can read all listings"
  on listings for select
  using (
    auth.uid() in (
      select id from auth.users where email = 'schwarzfish98+6@gmail.com'
    )
  );

-- Allow admin to update listings (for approve/unapprove)
drop policy if exists "Admin can update all listings" on listings;
create policy "Admin can update all listings"
  on listings for update
  using (
    auth.uid() in (
      select id from auth.users where email = 'schwarzfish98+6@gmail.com'
    )
  );

-- Allow admin to delete listings
drop policy if exists "Admin can delete listings" on listings;
create policy "Admin can delete listings"
  on listings for delete
  using (
    auth.uid() in (
      select id from auth.users where email = 'schwarzfish98+6@gmail.com'
    )
  );

-- Allow admin to read all partner inquiries
drop policy if exists "Admin can read partner inquiries" on partner_inquiries;
create policy "Admin can read partner inquiries"
  on partner_inquiries for select
  using (
    auth.uid() in (
      select id from auth.users where email = 'schwarzfish98+6@gmail.com'
    )
  );

-- Allow admin to read all agent requests
drop policy if exists "Admin can read agent requests" on agent_requests;
create policy "Admin can read agent requests"
  on agent_requests for select
  using (
    auth.uid() in (
      select id from auth.users where email = 'schwarzfish98+6@gmail.com'
    )
  );

-- Allow admin to read all contact messages
drop policy if exists "Admin can read contact messages" on contact_messages;
create policy "Admin can read contact messages"
  on contact_messages for select
  using (
    auth.uid() in (
      select id from auth.users where email = 'schwarzfish98+6@gmail.com'
    )
  );

-- Allow admin to read all profiles
drop policy if exists "Admin can read all profiles" on profiles;
create policy "Admin can read all profiles"
  on profiles for select
  using (
    auth.uid() in (
      select id from auth.users where email = 'schwarzfish98+6@gmail.com'
    )
  );


-- ── DONE ─────────────────────────────────────────────────
-- After running this file:
-- 1. Go to Supabase → Database → Webhooks
-- 2. Create webhook: table=listings, event=INSERT
--    URL: https://hospitalityagents.co/api/notify
--    Header: x-webhook-secret: [your chosen secret]
-- 3. Set matching env var WEBHOOK_SECRET in Vercel


-- ── 7. WAITLIST TABLE (email capture) ────────────────────
create table if not exists waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz default now()
);

alter table waitlist enable row level security;

drop policy if exists "Anyone can join waitlist" on waitlist;
create policy "Anyone can join waitlist"
  on waitlist for insert
  with check (true);


-- ── 8. ADD pms_systems column to listings ────────────────
alter table listings
  add column if not exists pms_systems text[] default '{}';


-- ── 9. FREEMIUM + EXPANDED TYPES ─────────────────────────
-- Adds the three freemium columns and widens the type check.

alter table listings
  add column if not exists free_tier_type text,
  add column if not exists free_tier_desc text,
  add column if not exists paid_tier_desc text;

-- Drop old type check and add new one with all 4 types
do $$
begin
  if exists (
    select 1 from information_schema.check_constraints
    where constraint_name like 'listings_type_check%'
  ) then
    alter table listings drop constraint if exists listings_type_check;
  end if;
end $$;

alter table listings
  add constraint listings_type_check
  check (type in ('persona', 'agent', 'skill', 'addon'));


-- ── 10. PURCHASES TABLE ──────────────────────────────────
create table if not exists purchases (
  id               uuid primary key default gen_random_uuid(),
  listing_id       text not null,
  listing_name     text,
  email            text not null,
  amount_cents     integer default 0,
  mode             text,
  stripe_session_id text,
  created_at       timestamptz default now()
);

alter table purchases enable row level security;

drop policy if exists "Users can read own purchases" on purchases;
create policy "Users can read own purchases"
  on purchases for select
  using (email = (select email from auth.users where id = auth.uid()));

drop policy if exists "Service can insert purchases" on purchases;
create policy "Service can insert purchases"
  on purchases for insert
  with check (true);

drop policy if exists "Admin can read all purchases" on purchases;
create policy "Admin can read all purchases"
  on purchases for select
  using (auth.uid() in (select id from auth.users where email = 'ian_schwarz@outlook.com'));


-- ── 11. PRICING MODEL COLUMN ─────────────────────────────
alter table listings
  add column if not exists pricing_model text default 'onetime';


-- ── 12. USER ROLE FIELD ──────────────────────────────────
alter table profiles
  add column if not exists role text default 'both';

-- ── 13. DELIVERY FIELDS ──────────────────────────────────
alter table listings
  add column if not exists delivery_method text default 'file',
  add column if not exists delivery_content text,
  add column if not exists free_delivery_content text;


-- ── 14. STRIPE CONNECT ───────────────────────────────────
alter table profiles
  add column if not exists stripe_account_id text;
