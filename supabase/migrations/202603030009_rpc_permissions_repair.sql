-- Repair grants for admin RPCs used by the frontend.

grant execute on function get_ballot_round_history_admin(uuid) to authenticated;
grant execute on function export_event_results_admin(uuid) to authenticated;
grant execute on function record_manual_round_result(uuid, jsonb, text, timestamptz) to authenticated;
