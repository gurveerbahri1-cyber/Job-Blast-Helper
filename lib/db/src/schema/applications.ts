import { pgTable, text, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobListingsTable } from "./jobListings";

export const APPLICATION_STATUSES = ["queued", "approved", "applied", "responded", "interview", "offer", "rejected"] as const;
export type ApplicationStatus = typeof APPLICATION_STATUSES[number];

export const applicationsTable = pgTable("applications", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  jobListingId: integer("job_listing_id").notNull().references(() => jobListingsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("queued"),
  resumeVersion: text("resume_version"),
  coverLetterVersion: text("cover_letter_version"),
  notes: text("notes"),
  followUpDate: date("follow_up_date", { mode: "string" }),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertApplicationSchema = createInsertSchema(applicationsTable).omit({ id: true, createdAt: true, updatedAt: true, lastUpdated: true });
export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applicationsTable.$inferSelect;
