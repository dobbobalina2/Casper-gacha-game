CREATE TABLE `card_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`family` text NOT NULL,
	`type` text NOT NULL,
	`color` text NOT NULL,
	`cost` integer NOT NULL,
	`power` integer NOT NULL,
	`combo_power` integer,
	`stats_source` text NOT NULL,
	`verified_at` text NOT NULL,
	`image` text NOT NULL,
	`reference_mint` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`reference_mint`) REFERENCES `collectibles`(`mint`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "card_cost_range" CHECK("card_definitions"."cost" between 0 and 12),
	CONSTRAINT "card_power_range" CHECK("card_definitions"."power" between 1 and 100000),
	CONSTRAINT "card_combo_range" CHECK("card_definitions"."combo_power" is null or "card_definitions"."combo_power" between 0 and 20000),
	CONSTRAINT "card_family" CHECK("card_definitions"."family" = 'Fusion World' and "card_definitions"."type" = 'BATTLE')
);
--> statement-breakpoint
CREATE TABLE `collectibles` (
	`mint` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`image` text NOT NULL,
	`inventory_source` text NOT NULL,
	`observed_at` text NOT NULL,
	`mapping` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_pages` (
	`source` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "inventory_payload_json" CHECK(json_valid("inventory_pages"."payload"))
);
--> statement-breakpoint
CREATE TABLE `special_attacks` (
	`card_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`bonus` integer NOT NULL,
	`extra_energy` integer NOT NULL,
	`pierce` integer NOT NULL,
	`rage` integer NOT NULL,
	`rage_threshold` integer NOT NULL,
	`execute` integer NOT NULL,
	`execute_threshold` integer NOT NULL,
	`splash` integer NOT NULL,
	`refund` integer NOT NULL,
	`drain` integer NOT NULL,
	`guard` integer NOT NULL,
	`visual` text NOT NULL,
	`color` text NOT NULL,
	`notes` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `card_definitions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "special_bonus_range" CHECK("special_attacks"."bonus" between 0 and 100),
	CONSTRAINT "special_energy_range" CHECK("special_attacks"."extra_energy" between 0 and 3),
	CONSTRAINT "special_notes_json" CHECK(json_valid("special_attacks"."notes"))
);
