import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
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
import { fetchRemoteOK } from "../lib/sources/remoteok";
import { fetchLinkedIn } from "../lib/sources/linkedin";
import { fetchInternshala } from "../lib/sources/internshala";
import type { RawJob } from "../lib/sources/types";

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

// Helper: insert a raw job and create a match record for the user
async function insertJobWithMatch(
  job: RawJob,
  userId: string,
  targetRoles: string[],
  targetLocations: string[],
  salaryFloor: number | null,
  excludedCompanies: string[]
): Promise<"inserted" | "skipped"> {
  const [existing] = await db
    .select()
    .from(jobListingsTable)
    .where(
      and(
        eq(jobListingsTable.source, job.source),
        eq(jobListingsTable.sourceId, job.sourceId)
      )
    );

  if (existing) return "skipped";

  const [inserted] = await db
    .insert(jobListingsTable)
    .values({
      source: job.source,
      sourceId: job.sourceId,
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url,
      description: (job.description ?? "").slice(0, 5000),
      salaryMin: job.salaryMin ?? null,
      salaryMax: job.salaryMax ?? null,
      postedDate: job.postedDate ?? null,
    })
    .returning();

  if (!inserted) return "skipped";

  const { score, reasons } = scoreJob({
    jobTitle: job.title,
    jobDescription: job.description ?? "",
    jobLocation: job.location,
    jobSalaryMin: job.salaryMin ?? null,
    targetRoles,
    targetLocations,
    salaryFloor,
    excludedCompanies,
    company: job.company,
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

  return "inserted";
}

// Trigger job refresh from LinkedIn, Internshala, and RemoteOK
router.post("/jobs/refresh", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkUserId, userId));

  const targetRoles: string[] = profile?.targetRoles
    ? JSON.parse(profile.targetRoles)
    : ["software engineer", "developer"];
  const targetLocations: string[] = profile?.targetLocations
    ? JSON.parse(profile.targetLocations)
    : ["remote"];
  const excludedCompanies: string[] = profile?.excludedCompanies
    ? JSON.parse(profile.excludedCompanies)
    : [];
  const salaryFloor = profile?.salaryFloor ?? null;

  // Fetch from all three sources in parallel
  const [linkedInResult, internshalaResult, remoteOKResult] = await Promise.all([
    fetchLinkedIn(targetRoles, targetLocations),
    fetchInternshala(targetRoles),
    fetchRemoteOK(targetRoles),
  ]);

  if (linkedInResult.error) {
    logger.warn({ error: linkedInResult.error }, "LinkedIn fetch had errors");
  }
  if (internshalaResult.error) {
    logger.warn({ error: internshalaResult.error }, "Internshala fetch had errors");
  }
  if (remoteOKResult.error) {
    logger.warn({ error: remoteOKResult.error }, "RemoteOK fetch had errors");
  }

  const allJobs = [
    ...linkedInResult.jobs,
    ...internshalaResult.jobs,
    ...remoteOKResult.jobs,
  ];

  let fetched = 0;
  let skipped = 0;

  for (const job of allJobs) {
    const result = await insertJobWithMatch(
      job,
      userId,
      targetRoles,
      targetLocations,
      salaryFloor,
      excludedCompanies
    );
    if (result === "inserted") fetched++;
    else skipped++;
  }

  const sources = [
    linkedInResult.jobs.length > 0 ? "linkedin" : null,
    internshalaResult.jobs.length > 0 ? "internshala" : null,
    remoteOKResult.jobs.length > 0 ? "remoteok" : null,
  ].filter(Boolean).length || 1;

  logger.info(
    {
      linkedin: linkedInResult.jobs.length,
      internshala: internshalaResult.jobs.length,
      remoteok: remoteOKResult.jobs.length,
      fetched,
      skipped,
    },
    "Job refresh complete"
  );

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
