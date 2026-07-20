import type { FetchResult, RawJob } from "./types";

export async function fetchRemoteOK(_keywords: string[]): Promise<FetchResult> {
  try {
    const response = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "JobBlast/1.0 (job search assistant)" },
    });
    if (!response.ok) {
      return { jobs: [], error: `RemoteOK responded ${response.status}` };
    }

    const data = (await response.json()) as Array<Record<string, unknown>>;
    const jobs: RawJob[] = data
      .filter((item) => item.id && item.position)
      .slice(0, 50)
      .map((item) => ({
        sourceId: String(item.id),
        source: "remoteok",
        title: String(item.position ?? ""),
        company: String(item.company ?? "Unknown"),
        location: String(item.location ?? "Remote"),
        url: String(item.url ?? `https://remoteok.com/remote-jobs/${item.id}`),
        description: String(item.description ?? "").slice(0, 5000),
      }));

    return { jobs };
  } catch (err) {
    return { jobs: [], error: String(err) };
  }
}
