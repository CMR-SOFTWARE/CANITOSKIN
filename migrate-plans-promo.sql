-- Migración: planes editables + promociones (CMR Nexo)
-- Ejecutar en el SQL Editor de Supabase si la DB ya existe.

alter table platform_plans add column if not exists features jsonb;
alter table platform_plans add column if not exists featured boolean;
alter table platform_plans add column if not exists sort_order integer;
alter table platform_plans add column if not exists promo_title text;
alter table platform_plans add column if not exists promo_discount_type text;
alter table platform_plans add column if not exists promo_discount_value numeric;
alter table platform_plans add column if not exists promo_start_date timestamptz;
alter table platform_plans add column if not exists promo_end_date timestamptz;
alter table platform_plans add column if not exists promo_active boolean;

update platform_plans set featured = coalesce(featured, false);
update platform_plans set sort_order = coalesce(nullif(sort_order, 0), case id
  when 'inicial' then 1
  when 'profesional' then 2
  when 'max' then 3
  else 10
end);
update platform_plans set promo_active = coalesce(promo_active, false);
update platform_plans set featured = true where id = 'profesional' and featured is distinct from true;

update platform_plans set features = '["Hasta 1 profesional","Turnos online","Panel admin","WhatsApp"]'::jsonb
where id = 'inicial' and (features is null or features = '[]'::jsonb);
update platform_plans set features = '["Hasta 3 profesionales","Turnos online","Panel admin","WhatsApp","Soporte prioritario"]'::jsonb
where id = 'profesional' and (features is null or features = '[]'::jsonb);
update platform_plans set features = '["Profesionales ilimitados","Turnos online","Panel admin","WhatsApp","Soporte prioritario"]'::jsonb
where id = 'max' and (features is null or features = '[]'::jsonb);

create table if not exists platform_plan_price_history (
  id bigserial primary key,
  plan_id text not null references platform_plans(id) on delete cascade,
  precio_anterior numeric not null,
  precio_nuevo numeric not null,
  admin_label text not null default 'superadmin',
  created_at timestamptz not null default now()
);

alter table platform_plans disable row level security;
alter table platform_plan_price_history disable row level security;
