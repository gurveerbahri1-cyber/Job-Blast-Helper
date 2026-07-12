import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, like, sql } from "drizzle-orm";
import { db, jobListingsTable, matchesTable, profilesTable } from "@workspace/db";
import {
  ListJobsQueryParams,
  ListJobsResponse,
  GetJobParams,
  GetJobResponse,
  RefreshJobsResponse,
  GetQueueQueryParams,
  GetQueueResponse,
  SkipJobParams,
  SkipJobResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";
import { scoreJob } from "../lib/scoring";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// List all job listings
router.get("/jobs", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = ListJobsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { page = 1, limit = 20, search, source } = parsed.data;
  const offset = (page - 1) * limit;

  let query = db.select().from(jobListingsTable).$dynamic();
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(jobListingsTable).$dynamic();

  if (search) {
    const pattern = `%${search}%`;
    query = query.where(
      sql`${jobListingsTable.title} ILIKE ${pattern} OR ${jobListingsTable.company} ILIKE ${pattern}`
    );
    countQuery = countQuery.where(
      sql`${jobListingsTable.title} ILIKE ${pattern} OR ${jobListingsTable.company} ILIKE ${pattern}`
    );
  }

  if (source) {
    query = query.where(eq(jobListingsTable.source, source));
    countQuery = countQuery.where(eq(jobListingsTable.source, source));
  }

  const [items, countResult] = await Promise.all([
    query.orderBy(desc(jobListingsTable.fetchedAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  const total = Number(countResult[0]?.count ?? 0);
  res.json(ListJobsResponse.parse({ items, total, page, limit }));
});

// Get job detail
router.get("/jobs/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const params = GetJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [job] = await db
    .select()
    .from(jobListingsTable)
    .where(eq(jobListingsTable.id, params.data.id));

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(GetJobResponse.parse(job));
});

// Trigger job refresh from external sources
router.post("/jobs/refresh", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;

  // Fetch from RemoteOK (free, no API key required)
  let fetched = 0;
  let skipped = 0;
  const sources = 1;

  try {
    const response = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "JobBlast/1.0" },
    });

    if (response.ok) {
      const data = (await response.json()) as Array<Record<string, unknown>>;
      const jobs = data.filter((item) => item.id && item.position); // skip the first metadata entry

      // Get profile for scoring
      const [profile] = await db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.clerkUserId, userId));

      const targetRoles: string[] = profile?.targetRoles ? JSON.parse(profile.targetRoles) : ["software engineer", "developer"];
      const targetLocations: string[] = profile?.targetLocations ? JSON.parse(profile.targetLocations) : ["remote"];
      const excludedCompanies: string[] = profile?.excludedCompanies ? JSON.parse(profile.excludedCompanies) : [];
      const salaryFloor = profile?.salaryFloor ?? null;

      for (const job of jobs.slice(0, 50)) {
        const sourceId = String(job.id ?? "");
        const title = String(job.position ?? "");
        const company = String(job.company ?? "Unknown");
        const url = String(job.url ?? `https://remoteok.com/remote-jobs/${sourceId}`);
        const description = String(job.description ?? "");
        const location = String(job.location ?? "Remote");

        // Check for duplicates
        const [existing] = await db
          .select()
          .from(jobListingsTable)
          .where(and(eq(jobListingsTable.source, "remoteok"), eq(jobListingsTable.sourceId, sourceId)));

        if (existing) {
          skipped++;
          continue;
        }

        const [inserted] = await db
          .insert(jobListingsTable)
          .values({
            source: "remoteok",
            sourceId,
            title,
            company,
            location,
            url,
            description: description.slice(0, 5000),
          })
          .returning();

        if (inserted) {
          // Score and store match
          const { score, reasons } = scoreJob({
            jobTitle: title,
            jobDescription: description,
            jobLocation: location,
            jobSalaryMin: null,
            targetRoles,
            targetLocations,
            salaryFloor,
            excludedCompanies,
            company,
          });

          if (score > 0.1) {
            await db.insert(matchesTable).values({
              clerkUserId: userId,
              jobListingId: inserted.id,
              relevanceScore: score,
              reasons: JSON.stringify(reasons),
              skipped: 0,
            });
          }

          fetched++;
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to fetch from RemoteOK");
  }

  res.json(RefreshJobsResponse.parse({ fetched, skipped, sources }));
});

// Get ranked review queue
router.get("/queue", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const parsed = GetQueueQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;

  // Matches not skipped, not already applied
  const matches = await db
    .select({
      matchId: matchesTable.id,
      relevanceScore: matchesTable.relevanceScore,
      reasons: matchesTable.reasons,
      job: jobListingsTable,
    })
    .from(matchesTable)
    .innerJoin(jobListingsTable, eq(matchesTable.jobListingId, jobListingsTable.id))
    .where(
      and(
        eq(matchesTable.clerkUserId, userId),
        eq(matchesTable.skipped, 0),
      )
    )
    .orderBy(desc(matchesTable.relevanceScore))
    .limit(limit);

  const queue = matches.map((m) => ({
    job: m.job,
    relevanceScore: m.relevanceScore,
    reasons: m.reasons ? JSON.parse(m.reasons) : [],
    matchId: m.matchId,
  }));

  res.json(GetQueueResponse.parse(queue));
});

// Skip a job in the queue
router.post("/queue/:jobId/skip", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const params = SkipJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .update(matchesTable)
    .set({ skipped: 1 })
    .where(
      and(
        eq(matchesTable.clerkUserId, userId),
        eq(matchesTable.jobListingId, params.data.jobId),
      )
    );

  res.json(SkipJobResponse.parse({ success: true }));
});

export default router;
