ALTER TABLE retirement_plan ADD COLUMN return_mode TEXT NOT NULL DEFAULT 'manual' CHECK (return_mode IN ('manual', 'portfolio'));
--> statement-breakpoint
ALTER TABLE retirement_plan ADD COLUMN stock_allocation_bps INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE retirement_plan ADD COLUMN bond_allocation_bps INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE retirement_plan ADD COLUMN cash_allocation_bps INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE retirement_plan ADD COLUMN stock_return_bps INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE retirement_plan ADD COLUMN bond_return_bps INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE retirement_plan ADD COLUMN cash_return_bps INTEGER NOT NULL DEFAULT 0;
