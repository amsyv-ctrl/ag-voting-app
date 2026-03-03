-- Optional hardening for secret ballot:
-- remove direct authenticated SELECT access to raw vote/pin use tables.
-- Admin workflows should use aggregated RPCs instead.

drop policy if exists votes_admin_select on votes;
drop policy if exists pin_uses_admin_select on pin_uses;
