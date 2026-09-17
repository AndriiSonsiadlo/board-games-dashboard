ALTER TABLE `event` ADD `showFollowLink` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `showFollowQr` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `followText` text;--> statement-breakpoint
ALTER TABLE `event` ADD `showTicker` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `showAchievementCards` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `showPodium` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `achievementOrder` text DEFAULT 'recent' NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `finaleShowcaseRarities` text DEFAULT '[]' NOT NULL;