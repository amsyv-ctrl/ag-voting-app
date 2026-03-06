alter table public.organizations
  add column if not exists welcome_email_sent_at timestamptz null;

comment on column public.organizations.welcome_email_sent_at is 'Timestamp for the first welcome email sent after account/org onboarding.';
