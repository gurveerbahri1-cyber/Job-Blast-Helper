import * as cheerio from "cheerio";
import type { FetchResult, RawJob } from "./types";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Fetches job listings from LinkedIn's public guest jobs API.
 * No login required. Uses the undocumented but publicly accessible endpoint.
 */
export async function fetchLinkedIn(
  keywords: string[],
  locations: string[]
): Promise<FetchResult> {
  const jobs: RawJob[] = [];
  const errors: string[] = [];

  // Try each keyword × location combination (cap at 3×2 to avoid hammering)
  const keywordSlice = keywords.slice(0, 3);
  const locationSlice = locations.length > 0 ? locations.slice(0, 2) : [""];

  for (const keyword of keywordSlice) {
    for (const location of locationSlice) {
      try {
        const params = new URLSearchParams({
          keywords: keyword,
          location: location || "Worldwide",
          start: "0",
          count: "25",
          f_TPR: "r86400", // posted in last 24h
        });

        const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`;

        const response = await fetch(url, {
          headers: {
            "User-Agent": BROWSER_UA,
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://www.linkedin.com/jobs/search/",
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          errors.push(`LinkedIn ${keyword}@${location}: HTTP ${response.status}`);
          continue;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        $("li").each((_, el) => {
          const card = $(el);

          // Extract source ID from data-entity-urn or from the link
          const urn = card.find("[data-entity-urn]").first().attr("data-entity-urn") ?? "";
          const sourceIdMatch = urn.match(/jobPosting:(\d+)/);
          const linkEl = card.find("a.base-card__full-link, a[href*='/jobs/view/']").first();
          const href = linkEl.attr("href") ?? "";
          const urlMatch = href.match(/\/jobs\/view\/(\d+)/);

          const sourceId = sourceIdMatch?.[1] ?? urlMatch?.[1] ?? "";
          if (!sourceId) return;

          const title =
            card.find(".base-search-card__title, h3.base-search-card__title").first().text().trim() ||
            card.find("[class*='title']").first().text().trim();

          const company =
            card.find(".base-search-card__subtitle, h4.base-search-card__subtitle").first().text().trim() ||
            card.find("[class*='company']").first().text().trim();

          const locationText =
            card.find(".job-search-card__location, [class*='location']").first().text().trim();

          // Canonicalise the URL (strip tracking params)
          const jobUrl = href.startsWith("http")
            ? href.split("?")[0]
            : `https://www.linkedin.com/jobs/view/${sourceId}`;

          if (title && company) {
            jobs.push({
              sourceId,
              source: "linkedin",
              title,
              company,
              location: locationText || location || "Remote",
              url: jobUrl,
              description: "",
            });
          }
        });

        // Polite delay between requests
        await new Promise((r) => setTimeout(r, 800));
      } catch (err) {
        errors.push(`LinkedIn ${keyword}: ${String(err)}`);
      }
    }
  }

  return {
    jobs: dedupeBySourceId(jobs),
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

function dedupeBySourceId(jobs: RawJob[]): RawJob[] {
  const seen = new Set<string>();
  return jobs.filter((j) => {
    if (seen.has(j.sourceId)) return false;
    seen.add(j.sourceId);
    return true;
  });
}
