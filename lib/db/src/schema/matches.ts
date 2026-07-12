import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobListingsTable } from "./jobListings";

export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  jobListingId: integer("job_listing_id").notNull().references(() => jobListingsTable.id, { onDelete: "cascade" }),
  relevanceScore: real("relevance_score").notNull().default(0),
  reasons: text("reasons"), // JSON array of reason strings
  skipped: integer("skipped").notNull().default(0), // 0=pending, 1=skipped
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMatchSchema = createInsertSchema(matchesTable).omit({ id: true, createdAt: true });
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matchesTable.$inferSelect;
