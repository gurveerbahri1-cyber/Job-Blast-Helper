import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import {
  db,
  applicationsTable,
  jobListingsTable,
  activityEventsTable,
  matchesTable,
  profilesTable,
} from "@workspace/db";
import {
  GetDashboardStatsResponse,
  GetRecentActivityQueryParams,
  GetRecentActivityResponse,
  GetFollowUpsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";

const router: IRouter = Router();

router.get("/dashboard/stats", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkUserId, userId));

  const dailyGoal = profile?.dailyGoal ?? 50;

  // Run all counts in parallel
  const [
    todayApps,
    totalApps,
    statusCounts,
    queueCount,
    followUpCount,
    weeklyRaw,
    streakRaw,
  ] = await Promise.all([
    // Today's applied count
    db
      .select({ count: sql<number>`count(*)` })
      .from(applicationsTable)
      .where(
        and(
          eq(applicationsTable.clerkUserId, userId),
          eq(applicationsTable.status, "applied"),
          gte(applicationsTable.appliedAt, today),
        )
      ),
    // Total
    db
      .select({ count: sql<number>`count(*)` })
      .from(applicationsTable)
      .where(eq(applicationsTable.clerkUserId, userId)),
    // Funnel counts
    db
      .select({ status: applicationsTable.status, count: sql<number>`count(*)` })
      .from(applicationsTable)
      .where(eq(applicationsTable.clerkUserId, userId))
      .groupBy(applicationsTable.status),
    // Queue size
    db
      .select({ count: sql<number>`count(*)` })
      .from(matchesTable)
      .where(and(eq(matchesTable.clerkUserId, userId), eq(matchesTable.skipped, 0))),
    // Follow-ups due
    db
      .select({ count: sql<number>`count(*)` })
      .from(applicationsTable)
      .where(
        and(
          eq(applicationsTable.clerkUserId, userId),
          eq(applicationsTable.status, "applied"),
          sql`${applicationsTable.appliedAt} < NOW() - INTERVAL '${profile?.followUpDays ?? 7} days'`,
          sql`${applicationsTable.followUpDate} IS NULL`,
        )
      ),
    // Weekly data (last 7 days)
    db.execute(sql`
      SELECT
        DATE(applied_at)::text AS date,
        COUNT(*)::int AS count
      FROM applications
      WHERE clerk_user_id = ${userId}
        AND status = 'applied'
        AND applied_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(applied_at)
      ORDER BY DATE(applied_at)
    `),
    // Streak: consecutive days with at least 1 application
    db.execute(sql`
      SELECT COUNT(DISTINCT DATE(applied_at))::int AS streak_days
      FROM applications
      WHERE clerk_user_id = ${userId}
        AND status = 'applied'
        AND applied_at >= NOW() - INTERVAL '30 days'
    `),
  ]);

  const funnelMap = Object.fromEntries(
    statusCounts.map((r) => [r.status, Number(r.count)])
  );

  const funnel = {
    applied: (funnelMap["applied"] ?? 0) + (funnelMap["responded"] ?? 0) + (funnelMap["interview"] ?? 0) + (funnelMap["offer"] ?? 0) + (funnelMap["rejected"] ?? 0),
    responded: (funnelMap["responded"] ?? 0) + (funnelMap["interview"] ?? 0) + (funnelMap["offer"] ?? 0),
    interview: (funnelMap["interview"] ?? 0) + (funnelMap["offer"] ?? 0),
    offer: funnelMap["offer"] ?? 0,
    rejected: funnelMap["rejected"] ?? 0,
  };

  // Fill in last 7 days even if no data
  const weeklyData: Array<{ date: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const row = (weeklyRaw.rows as Array<{ date: string; count: number }>).find((r) => r.date === dateStr);
    weeklyData.push({ date: dateStr, count: row?.count ?? 0 });
  }

  const stats = {
    todayCount: Number(todayApps[0]?.count ?? 0),
    dailyGoal,
    streak: Number((streakRaw.rows[0] as { streak_days: number } | undefined)?.streak_days ?? 0),
    totalApplications: Number(totalApps[0]?.count ?? 0),
    queueSize: Number(queueCount[0]?.count ?? 0),
    followUpsDue: Number(followUpCount[0]?.count ?? 0),
    funnel,
    weeklyData,
  };

  res.json(GetDashboardStatsResponse.parse(stats));
});

router.get("/dashboard/activity", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const parsed = GetRecentActivityQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 10) : 10;

  const events = await db
    .select()
    .from(activityEventsTable)
    .where(eq(activityEventsTable.clerkUserId, userId))
    .orderBy(desc(activityEventsTable.createdAt))
    .limit(limit);

  res.json(GetRecentActivityResponse.parse(events));
});

router.get("/dashboard/followups", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkUserId, userId));

  const followUpDays = profile?.followUpDays ?? 7;

  const apps = await db
    .select({ application: applicationsTable, job: jobListingsTable })
    .from(applicationsTable)
    .innerJoin(jobListingsTable, eq(applicationsTable.jobListingId, jobListingsTable.id))
    .where(
      and(
        eq(applicationsTable.clerkUserId, userId),
        eq(applicationsTable.status, "applied"),
        sql`${applicationsTable.appliedAt} < NOW() - INTERVAL '${followUpDays} days'`,
      )
    )
    .orderBy(applicationsTable.appliedAt)
    .limit(20);

  const items = apps.map((a) => ({ ...a.application, job: a.job }));
  res.json(GetFollowUpsResponse.parse(items));
});

export default router;
