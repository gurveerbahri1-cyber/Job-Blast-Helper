import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  applicationsTable,
  jobListingsTable,
  activityEventsTable,
} from "@workspace/db";
import {
  ListApplicationsQueryParams,
  ListApplicationsResponse,
  CreateApplicationBody,
  CreateApplicationResponse,
  GetApplicationParams,
  GetApplicationResponse,
  UpdateApplicationParams,
  UpdateApplicationBody,
  UpdateApplicationResponse,
  DeleteApplicationParams,
  ExportApplicationsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";

const router: IRouter = Router();

// Helper to build full application with embedded job
async function getApplicationWithJob(id: number, userId: string) {
  const [app] = await db
    .select({
      application: applicationsTable,
      job: jobListingsTable,
    })
    .from(applicationsTable)
    .innerJoin(jobListingsTable, eq(applicationsTable.jobListingId, jobListingsTable.id))
    .where(and(eq(applicationsTable.id, id), eq(applicationsTable.clerkUserId, userId)));

  if (!app) return null;

  return {
    ...app.application,
    job: app.job,
  };
}

// List applications
router.get("/applications", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const parsed = ListApplicationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { page = 1, limit = 20, status } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions = [eq(applicationsTable.clerkUserId, userId)];
  if (status) {
    conditions.push(eq(applicationsTable.status, status));
  }

  const [apps, countResult] = await Promise.all([
    db
      .select({ application: applicationsTable, job: jobListingsTable })
      .from(applicationsTable)
      .innerJoin(jobListingsTable, eq(applicationsTable.jobListingId, jobListingsTable.id))
      .where(and(...conditions))
      .orderBy(desc(applicationsTable.updatedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(applicationsTable)
      .where(and(...conditions)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);
  const items = apps.map((a) => ({ ...a.application, job: a.job }));
  res.json(ListApplicationsResponse.parse({ items, total, page, limit }));
});

// Export all applications
router.get("/applications/export", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const apps = await db
    .select({ application: applicationsTable, job: jobListingsTable })
    .from(applicationsTable)
    .innerJoin(jobListingsTable, eq(applicationsTable.jobListingId, jobListingsTable.id))
    .where(eq(applicationsTable.clerkUserId, userId))
    .orderBy(desc(applicationsTable.createdAt));

  const items = apps.map((a) => ({ ...a.application, job: a.job }));
  res.json(ExportApplicationsResponse.parse(items));
});

// Create application
router.post("/applications", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const parsed = CreateApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Duplicate check
  const [existing] = await db
    .select()
    .from(applicationsTable)
    .where(
      and(
        eq(applicationsTable.clerkUserId, userId),
        eq(applicationsTable.jobListingId, parsed.data.jobListingId),
      )
    );

  if (existing) {
    // Return existing instead of duplicating
    const full = await getApplicationWithJob(existing.id, userId);
    res.status(201).json(CreateApplicationResponse.parse(full));
    return;
  }

  const [app] = await db
    .insert(applicationsTable)
    .values({
      clerkUserId: userId,
      jobListingId: parsed.data.jobListingId,
      status: parsed.data.status ?? "queued",
      resumeVersion: parsed.data.resumeVersion,
      coverLetterVersion: parsed.data.coverLetterVersion,
      notes: parsed.data.notes,
      followUpDate: parsed.data.followUpDate ? String(parsed.data.followUpDate) : undefined,
      lastUpdated: new Date(),
    })
    .returning();

  // Log activity
  const [job] = await db
    .select()
    .from(jobListingsTable)
    .where(eq(jobListingsTable.id, parsed.data.jobListingId));

  await db.insert(activityEventsTable).values({
    clerkUserId: userId,
    type: "application_created",
    description: `Started application at ${job?.company ?? "Unknown"}`,
    company: job?.company,
    jobTitle: job?.title,
    applicationId: app.id,
  });

  const full = await getApplicationWithJob(app.id, userId);
  res.status(201).json(CreateApplicationResponse.parse(full));
});

// Get application
router.get("/applications/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const params = GetApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const full = await getApplicationWithJob(params.data.id, userId);
  if (!full) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  res.json(GetApplicationResponse.parse(full));
});

// Update application
router.patch("/applications/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const params = UpdateApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data, lastUpdated: new Date(), updatedAt: new Date() };

  // Auto-set appliedAt when status becomes "applied"
  if (parsed.data.status === "applied" && !parsed.data.appliedAt) {
    updateData.appliedAt = new Date();
  }

  const [updated] = await db
    .update(applicationsTable)
    .set(updateData)
    .where(
      and(
        eq(applicationsTable.id, params.data.id),
        eq(applicationsTable.clerkUserId, userId),
      )
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  // Log status change activity
  if (parsed.data.status) {
    const [job] = await db
      .select()
      .from(jobListingsTable)
      .where(eq(jobListingsTable.id, updated.jobListingId));

    await db.insert(activityEventsTable).values({
      clerkUserId: userId,
      type: "status_changed",
      description: `Application at ${job?.company ?? "Unknown"} moved to ${parsed.data.status}`,
      company: job?.company,
      jobTitle: job?.title,
      applicationId: updated.id,
    });
  }

  const full = await getApplicationWithJob(updated.id, userId);
  res.json(UpdateApplicationResponse.parse(full));
});

// Delete application
router.delete("/applications/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const params = DeleteApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(applicationsTable)
    .where(
      and(
        eq(applicationsTable.id, params.data.id),
        eq(applicationsTable.clerkUserId, userId),
      )
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
