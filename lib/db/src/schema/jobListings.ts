import { pgTable, text, serial, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jobListingsTable = pgTable("job_listings", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(), // "greenhouse", "lever", "remoteok", "adzuna", "manual"
  sourceId: text("source_id"), // external ID to detect duplicates
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location"),
  url: text("url").notNull(),
  description: text("description"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  postedDate: date("posted_date", { mode: "string" }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  isExpired: boolean("is_expired").notNull().default(false),
});

export const insertJobListingSchema = createInsertSchema(jobListingsTable).omit({ id: true, fetchedAt: true });
export type InsertJobListing = z.infer<typeof insertJobListingSchema>;
export type JobListing = typeof jobListingsTable.$inferSelect;
