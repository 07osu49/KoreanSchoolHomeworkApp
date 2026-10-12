CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`storage_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`sender_role` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `messages_student_idx` ON `messages` (`student_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`teacher_id` text NOT NULL,
	`teacher_name` text NOT NULL,
	`parent_id` text,
	`parent_name` text,
	`invite_hash` text,
	`invite_expires` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `students_teacher_idx` ON `students` (`teacher_id`);--> statement-breakpoint
CREATE INDEX `students_parent_idx` ON `students` (`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `students_invite_idx` ON `students` (`invite_hash`);