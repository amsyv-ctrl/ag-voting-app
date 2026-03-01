create policy "pins_admin_delete" on pins
for delete to authenticated
using (
  exists (
    select 1
    from events e
    where e.id = pins.event_id
    and e.created_by = auth.uid()
  )
);
