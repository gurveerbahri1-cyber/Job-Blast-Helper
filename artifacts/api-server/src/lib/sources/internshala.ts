import * as cheerio from "cheerio";
import type { FetchResult, RawJob } from "./types";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Fetches job and internship listings from Internshala's public pages.
 * Parses their public listing HTML — no login required.
 */
export async function fetchInternshala(
  keywords: string[]
): Promise<FetchResult> {
  const jobs: RawJob[] = [];
  const errors: string[] = [];

  const keywordSlice = keywords.slice(0, 3);

  for (const keyword of keywordSlice) {
    // Internshala uses hyphens in URL slugs
    const slug = keyword.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    // Fetch both jobs and internships
    const endpoints = [
      { url: `https://internshala.com/jobs/keyword-${slug}/`, type: "job" },
      { url: `https://internshala.com/internships/keyword-${slug}/`, type: "internship" },
    ];

    for (const { url, type } of endpoints) {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": BROWSER_UA,
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://internshala.com/",
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          errors.push(`Internshala ${type} ${keyword}: HTTP ${response.status}`);
          continue;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Internshala listing cards — they use .internship_meta or #internship_list
        $(".internship_meta, .individual_internship").each((_, el) => {
          const card = $(el);

          // Try to find the detail link
          const linkEl = card.find("a.job-title-href, a[href*='/internship/detail/'], a[href*='/job-detail/']").first();
          const href = linkEl.attr("href") ?? card.find("a").first().attr("href") ?? "";

          const sourceIdMatch = href.match(/\/(?:internship|job-detail|job)\/(?:detail\/)?([^/?#]+)/);
          const sourceId = sourceIdMatch?.[1] ?? "";
          if (!sourceId) return;

          const title =
            linkEl.text().trim() ||
            card.find(".profile, h3, [class*='title']").first().text().trim();

          const company =
            card.find(".company_name, [class*='company'], .company").first().text().trim();

          const locationText =
            card.find(".location_link, [class*='location'], .locations_label").first().text().trim();

          const stipend =
            card.find(".stipend, [class*='salary'], [class*='stipend']").first().text().trim();

          // Extract salary numbers from stipend text (e.g. "₹ 15,000 /month")
          const salaryMatch = stipend.replace(/,/g, "").match(/(\d+)/);
          const salaryMin = salaryMatch ? Number(salaryMatch[1]) : null;

          const jobUrl = href.startsWith("http")
            ? href
            : `https://internshala.com${href}`;

          if (title && (company || sourceId)) {
            jobs.push({
              sourceId: `${type}-${sourceId}`,
              source: "internshala",
              title: type === "internship" ? `${title} (Internship)` : title,
              company: company || "Unknown",
              location: locationText || "India",
              url: jobUrl,
              description: "",
              salaryMin,
            });
          }
        });

        await new Promise((r) => setTimeout(r, 800));
      } catch (err) {
        errors.push(`Internshala ${type} ${keyword}: ${String(err)}`);
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
