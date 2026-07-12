import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const profilesTable = pgTable("profiles", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  masterResume: text("master_resume"),
  coverLetterTemplates: text("cover_letter_templates"), // JSON array string
  targetRoles: text("target_roles"), // JSON array string
  targetLocations: text("target_locations"), // JSON array string
  salaryFloor: integer("salary_floor"),
  excludedCompanies: text("excluded_companies"), // JSON array string
  dailyGoal: integer("daily_goal").notNull().default(50),
  followUpDays: integer("follow_up_days").notNull().default(7),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
