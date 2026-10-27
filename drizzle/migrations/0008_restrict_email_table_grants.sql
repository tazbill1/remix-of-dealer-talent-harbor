revoke all on public.message_templates, public.email_campaigns, public.email_opt_outs from anon;
revoke all on public.email_campaigns, public.email_opt_outs from authenticated;
grant select on public.email_campaigns, public.email_opt_outs to authenticated;