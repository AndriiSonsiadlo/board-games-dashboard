CREATE TABLE `announcements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`before` text,
	`after` text,
	`undone` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'Board Games Cup' NOT NULL,
	`city` text DEFAULT 'Warsaw' NOT NULL,
	`year` integer DEFAULT 2026 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`startedAt` integer,
	`finishedAt` integer,
	`finaleRevealed` integer DEFAULT false NOT NULL,
	`scoringStrategy` text DEFAULT 'bestN' NOT NULL,
	`bestN` integer DEFAULT 4 NOT NULL,
	`participationFloor` real DEFAULT 0.2 NOT NULL,
	`jokerMultiplier` real DEFAULT 1.5 NOT NULL,
	`sceneDurationSec` integer DEFAULT 12 NOT NULL,
	`enabledScenes` text DEFAULT '["title","room","recent","counters"]' NOT NULL,
	`showPointsInReveals` integer DEFAULT false NOT NULL,
	`screenLang` text DEFAULT 'en' NOT NULL,
	`accentColor` text DEFAULT '#c9a45c' NOT NULL,
	`publicBaseUrl` text,
	`adminPinHash` text NOT NULL,
	`sessionSecret` text NOT NULL,
	`screenControl` text DEFAULT '{"paused":false,"skipNonce":0,"finaleStep":0}' NOT NULL,
	`dataVersion` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`family` text NOT NULL,
	`descriptionEn` text DEFAULT '' NOT NULL,
	`descriptionRu` text DEFAULT '' NOT NULL,
	`icon` text DEFAULT 'Dices' NOT NULL,
	`category` text DEFAULT 'strategy' NOT NULL,
	`durationMin` integer DEFAULT 30 NOT NULL,
	`weight` real NOT NULL,
	`minPlayers` integer DEFAULT 2 NOT NULL,
	`maxPlayers` integer DEFAULT 6 NOT NULL,
	`allowTies` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_slug_unique` ON `games` (`slug`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`nickname` text,
	`color` text NOT NULL,
	`source` text DEFAULT 'admin' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`isDemo` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session_players` (
	`sessionId` integer NOT NULL,
	`playerId` integer NOT NULL,
	`seat` integer NOT NULL,
	`jokerDeclared` integer DEFAULT false NOT NULL,
	`placement` integer,
	PRIMARY KEY(`sessionId`, `playerId`),
	FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`playerId`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tableId` integer,
	`gameId` integer NOT NULL,
	`status` text NOT NULL,
	`createdAt` integer NOT NULL,
	`startedAt` integer,
	`finishedAt` integer,
	`notes` text,
	`isDemo` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`tableId`) REFERENCES `tables`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`gameId`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tables` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` integer NOT NULL,
	`label` text,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tables_number_unique` ON `tables` (`number`);