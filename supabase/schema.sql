-- Ganh Hao Booking Management schema
-- Run this in Supabase SQL Editor

create extension if not exists "pgcrypto";

create table if not exists branches (
  id text primary key,
  name text not null,
  address text not null
);

create table if not exists app_users (
  id text primary key default ('u-' || replace(gen_random_uuid()::text, '-', '')),
  username text not null unique,
  password text not null,
  full_name text not null,
  role text not null check (role in ('admin', 'general_manager', 'manager')),
  branch_ids text[] not null default '{}'
);

create table if not exists areas (
  id text primary key default ('kv-' || replace(gen_random_uuid()::text, '-', '')),
  branch_id text not null references branches(id) on delete cascade,
  name text not null,
  capacity integer not null default 0
);

create table if not exists tables (
  id text primary key default ('tb-' || replace(gen_random_uuid()::text, '-', '')),
  branch_id text not null references branches(id) on delete cascade,
  area_id text not null references areas(id) on delete cascade,
  name text not null,
  seats integer not null default 1,
  status text not null check (status in ('hold', 'arriving', 'occupied', 'available')),
  position_x integer not null default 40,
  position_y integer not null default 40
);

create table if not exists customers (
  id text primary key default ('c-' || replace(gen_random_uuid()::text, '-', '')),
  full_name text not null,
  phone text not null unique,
  note text null
);

create table if not exists bookings (
  id text primary key default ('bk-' || replace(gen_random_uuid()::text, '-', '')),
  customer_id text not null references customers(id) on delete cascade,
  branch_id text not null references branches(id) on delete cascade,
  area_id text not null references areas(id) on delete cascade,
  table_id text not null references tables(id) on delete cascade,
  guest_count integer not null default 1,
  booking_at timestamptz not null,
  note text null,
  created_by_user_id text not null references app_users(id) on delete cascade,
  status text not null check (status in ('confirmed', 'cancelled', 'checked_in')) default 'confirmed'
);

create table if not exists internal_notifications (
  id text primary key default ('n-' || replace(gen_random_uuid()::text, '-', '')),
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  is_read boolean not null default false,
  branch_id text null references branches(id) on delete cascade
);

create table if not exists floor_backgrounds (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references app_users(id) on delete cascade,
  area_id text not null references areas(id) on delete cascade,
  image_data_url text not null,
  unique (user_id, area_id)
);

create index if not exists idx_bookings_table_time on bookings(table_id, booking_at);
create index if not exists idx_bookings_branch_time on bookings(branch_id, booking_at);
create index if not exists idx_tables_area on tables(area_id);
create index if not exists idx_notifications_branch_time on internal_notifications(branch_id, created_at desc);

-- Development-friendly RLS configuration (replace with strict policies for production)
alter table branches enable row level security;
alter table app_users enable row level security;
alter table areas enable row level security;
alter table tables enable row level security;
alter table customers enable row level security;
alter table bookings enable row level security;
alter table internal_notifications enable row level security;
alter table floor_backgrounds enable row level security;

drop policy if exists "dev_all_branches" on branches;
drop policy if exists "dev_all_users" on app_users;
drop policy if exists "dev_all_areas" on areas;
drop policy if exists "dev_all_tables" on tables;
drop policy if exists "dev_all_customers" on customers;
drop policy if exists "dev_all_bookings" on bookings;
drop policy if exists "dev_all_notifications" on internal_notifications;
drop policy if exists "dev_all_backgrounds" on floor_backgrounds;

create policy "dev_all_branches" on branches for all using (true) with check (true);
create policy "dev_all_users" on app_users for all using (true) with check (true);
create policy "dev_all_areas" on areas for all using (true) with check (true);
create policy "dev_all_tables" on tables for all using (true) with check (true);
create policy "dev_all_customers" on customers for all using (true) with check (true);
create policy "dev_all_bookings" on bookings for all using (true) with check (true);
create policy "dev_all_notifications" on internal_notifications for all using (true) with check (true);
create policy "dev_all_backgrounds" on floor_backgrounds for all using (true) with check (true);

-- Seed data
insert into branches (id, name, address) values
('cn-1', 'Ganh Hao Vung Tau', '03 Tran Phu, Vung Tau'),
('cn-2', 'Ganh Hao Ho Chi Minh', '12 Nguyen Huu Canh, Binh Thanh')
on conflict (id) do nothing;

insert into app_users (id, username, password, full_name, role, branch_ids) values
('u-admin', 'admin', '123456', 'Quan tri he thong', 'admin', array['cn-1','cn-2']),
('u-gm', 'tongquanly', '123456', 'Quan ly tong', 'general_manager', array['cn-1','cn-2']),
('u-mgr-1', 'manager-vt', '123456', 'Quan ly chi nhanh Vung Tau', 'manager', array['cn-1']),
('u-mgr-2', 'manager-hcm', '123456', 'Quan ly chi nhanh Ho Chi Minh', 'manager', array['cn-2'])
on conflict (id) do nothing;

insert into areas (id, branch_id, name, capacity) values
('kv-1', 'cn-1', 'Sanh bien', 120),
('kv-2', 'cn-1', 'Phong VIP', 40),
('kv-3', 'cn-2', 'San vuon', 90),
('kv-4', 'cn-2', 'Phong may lanh', 70)
on conflict (id) do nothing;

insert into tables (id, branch_id, area_id, name, seats, status, position_x, position_y) values
('b-1', 'cn-1', 'kv-1', 'Ban 01', 6, 'available', 80, 80),
('b-2', 'cn-1', 'kv-1', 'Ban 02', 8, 'hold', 220, 120),
('b-3', 'cn-1', 'kv-2', 'VIP 1', 10, 'occupied', 160, 90),
('b-4', 'cn-2', 'kv-3', 'San 1', 4, 'arriving', 100, 160),
('b-5', 'cn-2', 'kv-4', 'Lanh 03', 6, 'available', 260, 150)
on conflict (id) do nothing;

insert into customers (id, full_name, phone, note) values
('c-1', 'Nguyen Van A', '0909123456', null),
('c-2', 'Tran Thi B', '0909345678', 'Di ung hai san'),
('c-3', 'Le Quoc C', '0909987654', null)
on conflict (id) do nothing;

insert into bookings (
  id, customer_id, branch_id, area_id, table_id, guest_count, booking_at, note, created_by_user_id, status
) values
('bk-1', 'c-1', 'cn-1', 'kv-1', 'b-2', 6, now() + interval '2 hour', 'Sinh nhat', 'u-mgr-1', 'confirmed'),
('bk-2', 'c-2', 'cn-2', 'kv-3', 'b-4', 4, date_trunc('day', now() + interval '1 day') + interval '19 hour', null, 'u-mgr-2', 'confirmed')
on conflict (id) do nothing;

insert into internal_notifications (id, title, message, created_at, is_read, branch_id) values
('n-1', 'Nhac gio check-in', 'Ban 02 chi nhanh Vung Tau con 30 phut den gio don khach.', now() - interval '10 minute', false, 'cn-1'),
('n-2', 'Xung dot dat ban', 'Ban San 1 bi trung gio 19:00 hom nay, vui long kiem tra.', now() - interval '40 minute', false, 'cn-2')
on conflict (id) do nothing;
