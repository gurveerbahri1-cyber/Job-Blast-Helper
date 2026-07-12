/**
 * Simple relevance scoring for job listings vs. user profile.
 * Returns a score 0-1 and an array of match reasons.
 */

interface ScoringInput {
  jobTitle: string;
  jobDescription: string;
  jobLocation: string | null;
  jobSalaryMin: number | null;
  targetRoles: string[];
  targetLocations: string[];
  salaryFloor: number | null;
  excludedCompanies: string[];
  company: string;
}

interface ScoringResult {
  score: number;
  reasons: string[];
}

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

export function scoreJob(input: ScoringInput): ScoringResult {
  const reasons: string[] = [];
  let score = 0;
  const totalWeight = 100;

  // Excluded company check
  const companyLower = normalize(input.company);
  for (const excluded of input.excludedCompanies) {
    if (companyLower.includes(normalize(excluded))) {
      return { score: 0, reasons: ["Company is on excluded list"] };
    }
  }

  // Role title match (40 points)
  const titleLower = normalize(input.jobTitle);
  for (const role of input.targetRoles) {
    const roleLower = normalize(role);
    if (titleLower.includes(roleLower) || roleLower.includes(titleLower)) {
      score += 40;
      reasons.push(`Title matches target role: ${role}`);
      break;
    }
    // Partial word match
    const words = roleLower.split(" ");
    const matchedWords = words.filter((w) => titleLower.includes(w));
    if (matchedWords.length > 0) {
      const partial = Math.round((matchedWords.length / words.length) * 25);
      score += partial;
      reasons.push(`Partial title match: ${matchedWords.join(", ")}`);
      break;
    }
  }

  // Location match (20 points)
  if (!input.jobLocation) {
    score += 10;
    reasons.push("Remote/flexible location");
  } else {
    const locationLower = normalize(input.jobLocation);
    if (locationLower.includes("remote")) {
      score += 20;
      reasons.push("Remote position");
    } else {
      for (const loc of input.targetLocations) {
        if (locationLower.includes(normalize(loc))) {
          score += 20;
          reasons.push(`Location matches: ${loc}`);
          break;
        }
      }
    }
  }

  // Salary match (20 points)
  if (input.salaryFloor && input.jobSalaryMin) {
    if (input.jobSalaryMin >= input.salaryFloor) {
      score += 20;
      reasons.push(`Salary meets floor: $${input.jobSalaryMin.toLocaleString()}`);
    } else if (input.jobSalaryMin >= input.salaryFloor * 0.9) {
      score += 10;
      reasons.push("Salary close to floor");
    }
  } else if (!input.jobSalaryMin) {
    score += 10; // no salary listed — neutral
  }

  // Description keyword match (20 points)
  if (input.jobDescription && input.targetRoles.length > 0) {
    const descLower = normalize(input.jobDescription);
    let keywordHits = 0;
    const foundKeywords: string[] = [];
    for (const role of input.targetRoles) {
      const words = normalize(role).split(" ");
      for (const word of words) {
        if (word.length > 3 && descLower.includes(word)) {
          keywordHits++;
          foundKeywords.push(word);
        }
      }
    }
    if (keywordHits > 0) {
      const keywordScore = Math.min(20, keywordHits * 5);
      score += keywordScore;
      if (foundKeywords.length > 0) {
        reasons.push(`Keywords found: ${[...new Set(foundKeywords)].slice(0, 3).join(", ")}`);
      }
    }
  }

  return {
    score: Math.min(score, totalWeight) / totalWeight,
    reasons: reasons.length > 0 ? reasons : ["General match"],
  };
}
