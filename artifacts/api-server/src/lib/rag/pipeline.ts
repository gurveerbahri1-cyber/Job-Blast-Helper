/**
 * RAG tailoring pipeline using LangChain + LangGraph
 *
 * Graph:
 *   START → [retrieve] → [generate] → END
 *
 * retrieve:  chunks the master resume,
 *            embeds with Google text-embedding-004 via @langchain/google-genai,
 *            computes cosine similarity, and retrieves top chunks most similar to JD.
 *
 * generate:  sends the retrieved chunks + job details to Gemini as structured
 *            context and returns resumeBullets, coverLetter, and keywords.
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitText(text: string, chunkSize = 600, overlap = 120): string[] {
  if (!text || !text.trim()) return ["No resume provided."];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    if (end < text.length) {
      const boundary =
        Math.max(
          text.lastIndexOf("\n\n", end),
          text.lastIndexOf("\n", end),
          text.lastIndexOf(". ", end),
          text.lastIndexOf(" ", end)
        );
      if (boundary > start + 100) {
        end = boundary + 1;
      }
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks.length > 0 ? chunks : [text.trim()];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

// ─── State ────────────────────────────────────────────────────────────────────

const TailorState = Annotation.Root({
  // inputs
  jobTitle:        Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  jobDescription:  Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  company:         Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  location:        Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  tone:            Annotation<string>({ reducer: (_, b) => b, default: () => "professional" }),
  profileText:     Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  // intermediate
  relevantChunks:  Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  // output
  output: Annotation<{
    resumeBullets: string[];
    coverLetter: string;
    keywords: string[];
  } | null>({ reducer: (_, b) => b, default: () => null }),
});

type TailorStateType = typeof TailorState.State;

// ─── Node 1: Retrieve ─────────────────────────────────────────────────────────

async function retrieveNode(state: TailorStateType): Promise<Partial<TailorStateType>> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const chunks = splitText(state.profileText || "No resume provided.");

  if (!apiKey || chunks.length <= 1) {
    return {
      relevantChunks: chunks.slice(0, 5),
    };
  }

  try {
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey,
      model: "text-embedding-004",
    });

    const query = `${state.jobTitle} at ${state.company}. ${state.jobDescription.slice(0, 600)}`;
    const [queryEmb, docEmbs] = await Promise.all([
      embeddings.embedQuery(query),
      embeddings.embedDocuments(chunks),
    ]);

    const scored = chunks.map((chunk, index) => ({
      chunk,
      score: cosineSimilarity(queryEmb, docEmbs[index]),
    }));

    scored.sort((a, b) => b.score - a.score);
    return {
      relevantChunks: scored.slice(0, 5).map((s) => s.chunk),
    };
  } catch {
    // Fallback if embeddings call fails: take top chunks
    return {
      relevantChunks: chunks.slice(0, 5),
    };
  }
}

// ─── Node 2: Generate ─────────────────────────────────────────────────────────

const TONE_GUIDE: Record<string, string> = {
  professional:   "formal, concise, results-oriented — no fluff",
  conversational: "warm, direct, first-person, approachable",
  enthusiastic:   "energetic, show genuine excitement for the role",
};

async function generateNode(state: TailorStateType): Promise<Partial<TailorStateType>> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const tone = TONE_GUIDE[state.tone] ?? TONE_GUIDE.professional;

  const llm = new ChatGoogleGenerativeAI({
    apiKey,
    model: "gemini-2.0-flash",
    maxOutputTokens: 8192,
    temperature: 0.4,
  });

  const systemPrompt =
    `You are an expert technical resume writer and ATS specialist. ` +
    `Tailor the candidate's documents for this specific job using only ` +
    `evidence from the retrieved resume sections — never invent experience. ` +
    `Mirror the exact language and keywords from the job description to pass ATS. ` +
    `Tone: ${tone}.`;

  const chunksBlock = state.relevantChunks.length > 0
    ? state.relevantChunks.map((c, i) => `[Resume Section ${i + 1}]\n${c}`).join("\n\n")
    : "No resume provided — generate generic professional content.";

  const userPrompt =
    `Job Title: ${state.jobTitle}\n` +
    `Company: ${state.company}\n` +
    `Location: ${state.location || "Not specified"}\n\n` +
    `Job Description:\n${state.jobDescription.slice(0, 2500)}\n\n` +
    `Most Relevant Resume Sections (retrieved via semantic similarity):\n${chunksBlock}\n\n` +
    `Respond with a single valid JSON object — no markdown, no code fences:\n` +
    `{\n` +
    `  "resumeBullets": ["5 tailored bullet points starting with action verbs, grounded in the resume sections above"],\n` +
    `  "coverLetter": "3 short paragraphs: opening hook, relevant experience mapped to JD, closing CTA. Max 250 words. Never start with 'I am excited' or 'I am passionate'.",\n` +
    `  "keywords": ["top 5-8 ATS keywords extracted directly from the JD"]\n` +
    `}`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);

  const raw = typeof response.content === "string"
    ? response.content
    : JSON.stringify(response.content);

  const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    output: {
      resumeBullets: parsed.resumeBullets ?? [],
      coverLetter:   parsed.coverLetter   ?? "",
      keywords:      parsed.keywords      ?? [],
    },
  };
}

// ─── Graph ────────────────────────────────────────────────────────────────────

const tailorGraph = new StateGraph(TailorState)
  .addNode("retrieve", retrieveNode)
  .addNode("generate", generateNode)
  .addEdge(START, "retrieve")
  .addEdge("retrieve", "generate")
  .addEdge("generate", END)
  .compile();

export { tailorGraph };
export type { TailorStateType };
