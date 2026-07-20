export interface RawJob {
  sourceId: string;
  source: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  postedDate?: string | null;
}

export interface FetchResult {
  jobs: RawJob[];
  error?: string;
}
