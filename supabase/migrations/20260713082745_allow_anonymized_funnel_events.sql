-- Funnel events may become anonymous after a data-subject deletion.
-- The foreign keys already use ON DELETE SET NULL, so retaining the event
-- preserves aggregate funnel metrics without retaining a personal identifier.
alter table public.funnel_events
  drop constraint if exists funnel_events_subject_check;
