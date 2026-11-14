import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, jobListingsTable, profilesTable } from "@workspace/db";
import { TailorDocumentsBody, TailorDocumentsResponse } from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";
import { logger } from "../lib/logger";
import { tailorGraph } from "../lib/rag/pipeline";

const router: IRouter = Router();

router.post("/ai/tailor", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;

  const parsed = TailorDocumentsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({
      error:
        "AI tailoring is not configured. Add your GEMINI_API_KEY to Secrets to enable this feature.",
    });
    return;
  }

  const { jobId, tone = "professional" } = parsed.data;

  // Load job + profile in parallel
  const [[job], [profile]] = await Promise.all([
    db.select().from(jobListingsTable).where(eq(jobListingsTable.id, jobId)),
    db.select().from(profilesTable).where(eq(profilesTable.clerkUserId, userId)),
  ]);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const profileText =
    profile?.masterResume ??
    "No resume provided. Generate generic professional bullets.";

  try {
    logger.info({ jobId, tone }, "Starting RAG tailoring pipeline");

    // Run the LangGraph RAG pipeline
    const finalState = await tailorGraph.invoke({
      jobTitle:       job.title,
      jobDescription: job.description ?? "",
      company:        job.company,
      location:       job.location ?? "",
      tone,
      profileText,
    });

    if (!finalState.output) {
      res.status(500).json({ error: "Pipeline produced no output" });
      return;
    }

    logger.info(
      {
        jobId,
        chunksUsed: finalState.relevantChunks.length,
        bulletCount: finalState.output.resumeBullets.length,
      },
      "RAG tailoring complete"
    );

    res.json(
      TailorDocumentsResponse.parse({
        resumeBullets: finalState.output.resumeBullets,
        coverLetter:   finalState.output.coverLetter,
        jobTitle:      job.title,
        company:       job.company,
        keywords:      finalState.output.keywords,
      })
    );
  } catch (err) {
    logger.error({ err }, "RAG tailoring pipeline error");
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `AI tailoring failed: ${message}` });
  }
});

export default router;
