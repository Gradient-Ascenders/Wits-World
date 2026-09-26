-- Treat automatic placement as an event-authoring choice while retaining the
-- placement service's immutable operational audit trail.
alter table public.event_placement_audit
  drop constraint event_placement_audit_operation_check;

alter table public.event_placement_audit
  add constraint event_placement_audit_operation_check
    check (
      operation in (
        'apply_plan', 'record_failure', 'pin', 'exclude_site', 'pause',
        'end_override', 'suspend_site', 'retire_site', 'suspend_zone',
        'retire_zone', 'reactivate_site', 'reactivate_zone', 'rollback',
        'approve_portability', 'end_portability',
        'enable_automatic_placement', 'disable_automatic_placement',
        'automatic_placement_eligibility'
      )
    );
