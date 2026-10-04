ALTER TABLE retirement_plan ADD COLUMN owner_key TEXT NOT NULL DEFAULT '__owner__';
--> statement-breakpoint
CREATE UNIQUE INDEX retirement_plan_owner_key_unique ON retirement_plan(owner_key);
--> statement-breakpoint
ALTER TABLE cashflow_events ADD COLUMN owner_key TEXT NOT NULL DEFAULT '__owner__';
--> statement-breakpoint
CREATE INDEX cashflow_events_owner_age_idx ON cashflow_events(owner_key, age, id);
