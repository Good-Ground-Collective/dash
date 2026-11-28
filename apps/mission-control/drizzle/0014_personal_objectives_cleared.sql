DELETE FROM "objective_activity" WHERE "connection_id" IN (SELECT "id" FROM "connection" WHERE "account_kind" = 'user');
--> statement-breakpoint
DELETE FROM "objective_ticket" WHERE "connection_id" IN (SELECT "id" FROM "connection" WHERE "account_kind" = 'user');
--> statement-breakpoint
DELETE FROM "objective_placement" WHERE "connection_id" IN (SELECT "id" FROM "connection" WHERE "account_kind" = 'user');
--> statement-breakpoint
DELETE FROM "objective_epic" WHERE "connection_id" IN (SELECT "id" FROM "connection" WHERE "account_kind" = 'user');
--> statement-breakpoint
DELETE FROM "objective_initiative" WHERE "connection_id" IN (SELECT "id" FROM "connection" WHERE "account_kind" = 'user');
--> statement-breakpoint
DELETE FROM "objective_sync" WHERE "connection_id" IN (SELECT "id" FROM "connection" WHERE "account_kind" = 'user');
