CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`host_did` text,
	`status` text DEFAULT 'lobby' NOT NULL,
	`timer_duration` integer DEFAULT 60 NOT NULL,
	`current_round` integer DEFAULT 0 NOT NULL,
	`round_start_time` integer,
	`total_players` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`did` text NOT NULL,
	`name` text NOT NULL,
	`avatar` text,
	`turn_position` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_players_game_id` ON `players` (`game_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_players_game_did_unique` ON `players` (`game_id`,`did`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`chain_owner_did` text NOT NULL,
	`round` integer NOT NULL,
	`submitter_did` text NOT NULL,
	`type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_submissions_game_id` ON `submissions` (`game_id`);--> statement-breakpoint
CREATE INDEX `idx_submissions_chain_owner` ON `submissions` (`chain_owner_did`);--> statement-breakpoint
CREATE INDEX `idx_submissions_game_round` ON `submissions` (`game_id`,`round`);