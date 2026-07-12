import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, jobListingsTable, profilesTable } from "@workspace/db";
import { TailorDocumentsBody, TailorDocumentsResponse } from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";
import { logger } from "../lib/logger";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

router.post("/ai/tailor", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const parsed = TailorDocumentsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const anthropic = getAnthropicClient();
  if (!anthropic) {
    res.status(503).json({
      error: "AI tailoring is not configured. Add your ANTHROPIC_API_KEY to Secrets to enable this feature.",
    });
    return;
  }

  const { jobId, tone = "professional" } = parsed.data;

  const [job] = await db
    .select()
    .from(jobListingsTable)
    .where(eq(jobListingsTable.id, jobId));

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkUserId, userId));

  const masterResume = profile?.masterResume ?? "No resume provided. Generate generic professional bullets.";

  const toneGuide = {
    professional: "formal, concise, results-oriented",
    conversational: "warm, direct, first-person, approachable",
    enthusiastic: "energetic, passionate, emphasis on excitement for the role",
  }[tone] ?? "professional";

  const systemPrompt = `You are an expert technical resume writer and career coach. Your task is to tailor resume bullets and a cover letter specifically for a job description. Be specific, use numbers and metrics where possible, and mirror the language from the JD to pass ATS screening. Tone: ${toneGuide}.`;

  const userPrompt = `Job Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? "Remote"}

Job Description:
${job.description?.slice(0, 3000) ?? "No description provided."}

Master Resume:
${masterResume.slice(0, 3000)}

Please respond with a JSON object with this exact structure:
{
  "resumeBullets": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"],
  "coverLetter": "Full cover letter text...",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}

Requirements:
- resumeBullets: 5 strong, tailored bullets that highlight relevant experience from the master resume. Each bullet starts with a strong action verb.
- coverLetter: 3 short paragraphs (opening hook, relevant experience, closing call-to-action). Max 250 words. Do NOT use "I am excited" or "I am passionate".
- keywords: Top 5-8 ATS keywords extracted from the job description.
Respond with valid JSON only, no markdown.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      res.status(500).json({ error: "Unexpected AI response format" });
      return;
    }

    let parsed_result: { resumeBullets: string[]; coverLetter: string; keywords: string[] };
    try {
      // Strip markdown code fences if present
      const cleaned = content.text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      parsed_result = JSON.parse(cleaned);
    } catch {
      res.status(500).json({ error: "Failed to parse AI response" });
      return;
    }

    const result = {
      resumeBullets: parsed_result.resumeBullets ?? [],
      coverLetter: parsed_result.coverLetter ?? "",
      jobTitle: job.title,
      company: job.company,
      keywords: parsed_result.keywords ?? [],
    };

    res.json(TailorDocumentsResponse.parse(result));
  } catch (err) {
    logger.error({ err }, "Anthropic API error");
    res.status(500).json({ error: "AI tailoring failed. Please try again." });
  }
});

export default router;
