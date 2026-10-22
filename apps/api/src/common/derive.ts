/**
 * Turns the free-text fields in the source data (spreadsheet → CSV) into
 * structured, filterable values. Used by BOTH the seed and the admin write
 * paths, so derived columns always agree with the text they came from.
 *
 * Every parser returns null when it can't tell — it never guesses.
 */

const US_STATES = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR'.split(' '),
);

/** "" / "N/A" / "-" / "null" → null; otherwise the trimmed string. */
export function clean(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return /^(|n\/?a|none|null|-|—)$/i.test(t) ? null : t;
}

/** "Cambridge, MA" → { state: "MA", country: "United States" }. */
export function parseLocation(location: string): { state: string | null; country: string } {
  const m = location.trim().match(/,\s*([A-Za-z]{2})$/);
  if (m && US_STATES.has(m[1].toUpperCase())) return { state: m[1].toUpperCase(), country: 'United States' };
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean);
  return { state: null, country: parts.length > 1 ? parts[parts.length - 1] : 'United States' };
}

/** "#2 in Computer Science (tie)" → { position: 2, tied: true }. */
export function parseCsRank(text: string | null | undefined): { position: number | null; tied: boolean } {
  const t = clean(text);
  if (!t) return { position: null, tied: false };
  const m = t.match(/#\s*(\d+)/);
  return { position: m ? Number(m[1]) : null, tied: /\(\s*tie\s*\)/i.test(t) };
}

/** "$80" → 80, "$0" / "Free" → 0, "USD 75" → 75. */
export function parseFeeUsd(text: string | null | undefined): number | null {
  const t = clean(text);
  if (!t) return null;
  if (/^free$|^waived$/i.test(t)) return 0;
  const m = t.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? Math.round(Number(m[1])) : null;
}

/** "Official GRE Required" → true; "GRE Optional" / "Not required" / "Waived" → false. */
export function parseGreRequired(text: string | null | undefined): boolean | null {
  const t = clean(text);
  if (!t) return null;
  if (/not\s+required|optional|waived|no\s+gre|not\s+accepted/i.test(t)) return false;
  if (/required|mandatory/i.test(t)) return true;
  return null;
}

/** "7.0 overall (6.5 min per sub-score)" → 7. "Official IELTS Required" → null (no number). */
export function parseIeltsMin(text: string | null | undefined): number | null {
  const t = clean(text);
  if (!t) return null;
  const overall = t.match(/(\d(?:\.\d)?)\s*(?:overall|band)/i) ?? t.match(/(?:overall|band|minimum|min\.?)\s*(?:of\s*)?(\d(?:\.\d)?)/i);
  const n = overall ? Number(overall[1]) : null;
  return n != null && n >= 4 && n <= 9 ? n : null;
}

export type FundingLevel = 'GUARANTEED' | 'AVAILABLE' | 'CONDITIONAL';

/** Classifies a program's financial-aid policy text. */
export function parseFundingLevel(text: string | null | undefined): FundingLevel | null {
  const t = clean(text);
  if (!t) return null;
  if (/depend|subject to|if available|not guaranteed|limited|competitive/i.test(t)) return 'CONDITIONAL';
  if (/fully funded|guarantee|all (?:full-time )?(?:admitted )?(?:doctoral|phd) students|all doctoral/i.test(t)) return 'GUARANTEED';
  if (/assistantship|fellowship|\bT\.?A\.?s?\b|\bR\.?A\.?s?\b|stipend|available|offered/i.test(t)) return 'AVAILABLE';
  return null;
}

/** True when any of the texts mention WES / a credential evaluation for foreign degrees. */
export function mentionsWes(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => !!t && /\bWES\b|credential evaluation|course-by-course evaluation/i.test(t));
}

/** "Prof. Jonathan Smith" → "Jonathan Smith". The UI adds the honorific. */
export function stripHonorific(name: string): string {
  return name.replace(/^\s*(prof\.?|professor|dr\.?)\s+/i, '').trim();
}

/** "Fully Funded" → FULLY_FUNDED, "Partial Funded" → PARTIAL, "Self Funded" → SELF. */
export function normalizeFundingPreference(v: string | null | undefined): 'FULLY_FUNDED' | 'PARTIAL' | 'SELF' | null {
  const t = clean(v)?.toLowerCase().replace(/[^a-z]/g, '');
  if (!t) return null;
  if (t.startsWith('full')) return 'FULLY_FUNDED';
  if (t.startsWith('partial')) return 'PARTIAL';
  if (t.startsWith('self')) return 'SELF';
  return null;
}

/**
 * Tag normalisation: case, spaces and punctuation are ignored, so
 * "Cybersecurity" == "Cyber Security" == "cyber-security".
 * MUST match the SQL function hs_norm_tag() in migration 2.
 */
export function normTag(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Research areas (original casing) that overlap the student's interests. */
export function matchedAreas(interests: string[], areas: string[]): string[] {
  const want = new Set(interests.map(normTag).filter(Boolean));
  const seen = new Set<string>();
  return areas.filter((a) => {
    const k = normTag(a);
    if (!want.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Split a ";"-separated CSV cell into trimmed, de-duplicated values. */
const unquote = (x: string) => x.trim().replace(/^(["'])([\s\S]*)\1$/, '$2').trim();

/** A list written as a whole array: JSON `["a","b"]`, Python `['a', 'b']` or Postgres `{a,"b c"}`. */
function parseArrayLiteral(s: string): string[] | null {
  if (/^\[[\s\S]*\]$/.test(s)) {
    try {
      const a = JSON.parse(s);
      if (Array.isArray(a)) return a.map((x) => String(x));
    } catch {
      /* not strict JSON (e.g. single quotes) — split by hand below */
    }
    return s.slice(1, -1).split(',').map(unquote);
  }
  if (/^\{[\s\S]*\}$/.test(s)) return s.slice(1, -1).split(',').map(unquote);
  return null;
}

/**
 * Multi-value cell → clean list. Accepts the documented `A; B; C`, and also what
 * spreadsheets and exports produce: `A | B`, `A, B` (when there's no ; or |),
 * and whole-array literals (`["A", "B"]`, `{A,B}`). Trims quotes, drops blanks
 * and duplicates, keeps order.
 */
export function splitList(v: string | null | undefined): string[] {
  const s = (v ?? '').trim();
  const parts = parseArrayLiteral(s) ?? s.split(/[;|]/.test(s) ? /[;|]/ : /,/);
  const out: string[] = [];
  for (const p of parts.map(unquote).filter(Boolean)) if (!out.includes(p)) out.push(p);
  return out;
}

/**
 * For lists that arrive as arrays (API bodies): expands any element that is
 * itself an array literal, e.g. ['["A","B"]'] → ['A','B']. Ordinary elements
 * are kept as-is, commas included.
 */
export function normalizeList(list: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const item of list ?? []) {
    for (const p of (parseArrayLiteral(item.trim()) ?? [item]).map(unquote).filter(Boolean)) if (!out.includes(p)) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Row-level derivations used on every write

export function deriveUniversity(u: { location: string; csRank?: string | null }) {
  const loc = parseLocation(u.location);
  const rank = parseCsRank(u.csRank);
  return { country: loc.country, state: loc.state, csRankPosition: rank.position, csRankTied: rank.tied };
}

export function deriveProgram(p: {
  applicationFee?: string | null;
  greRequirement?: string | null;
  ieltsRequirement?: string | null;
  financialAidPolicy?: string | null;
  limitationsNotes?: string | null;
}) {
  return {
    applicationFeeUsd: parseFeeUsd(p.applicationFee),
    greRequired: parseGreRequired(p.greRequirement),
    ieltsMinOverall: parseIeltsMin(p.ieltsRequirement),
    fundingLevel: parseFundingLevel(p.financialAidPolicy),
    wesRequired: mentionsWes(p.limitationsNotes),
  };
}

// ---------------------------------------------------------------------------
// University match score — explains itself, and only uses fields the data has.

export interface MatchProfile {
  targetDegree: string;
  fundingPreference: string | null;
  preferredCountries: string[];
  researchInterests: string[];
  greScore: number | null;
  ieltsScore: number | null;
}
export interface MatchUniversity {
  country: string;
  wesRequired: boolean;
  researchAreas: string[]; // distinct areas across the university's professors
  programs: { degreeLevel: string; fundingLevel: string | null; greRequired: boolean | null; ieltsMinOverall: number | null; wesRequired: boolean }[];
}
export interface MatchResult {
  score: number;
  reasons: { ok: boolean; text: string }[];
}

/**
 * 0–100, from five parts:
 *   research fit 40 · program at your target degree 20 · funding 15 · test requirements 15 · country 10
 */
export function universityMatch(p: MatchProfile, u: MatchUniversity): MatchResult {
  const reasons: MatchResult['reasons'] = [];
  let score = 0;

  const fit = matchedAreas(p.researchInterests, u.researchAreas);
  if (fit.length) {
    score += fit.length >= 2 ? 40 : 25;
    reasons.push({ ok: true, text: `Faculty research in ${fit.slice(0, 3).join(', ')}` });
  } else if (u.researchAreas.length) {
    reasons.push({ ok: false, text: 'No listed faculty match your research interests' });
  } else {
    reasons.push({ ok: false, text: 'No faculty listed yet' });
  }

  const programs = u.programs.filter((pr) => pr.degreeLevel.toLowerCase() === p.targetDegree.toLowerCase());
  if (programs.length) {
    score += 20;
    reasons.push({ ok: true, text: `Has a ${p.targetDegree} program` });
  } else {
    reasons.push({ ok: false, text: u.programs.length ? `No ${p.targetDegree} program listed` : 'No program details yet' });
  }

  const levels = programs.map((pr) => pr.fundingLevel);
  if (p.fundingPreference === 'FULLY_FUNDED') {
    if (levels.includes('GUARANTEED')) (score += 15), reasons.push({ ok: true, text: 'Funding guaranteed for admitted students' });
    else if (levels.includes('AVAILABLE')) (score += 8), reasons.push({ ok: true, text: 'Assistantships available' });
    else if (levels.includes('CONDITIONAL')) (score += 3), reasons.push({ ok: false, text: 'Funding depends on faculty grants' });
  } else if (programs.length) {
    score += 10;
  }

  if (programs.length) {
    const misses: string[] = [];
    if (programs.every((pr) => pr.greRequired) && !p.greScore) misses.push('GRE required');
    const ielts = programs.map((pr) => pr.ieltsMinOverall).filter((n): n is number => n != null);
    if (ielts.length && (p.ieltsScore == null || p.ieltsScore < Math.min(...ielts))) misses.push(`IELTS ${Math.min(...ielts)} required`);
    if (misses.length) reasons.push({ ok: false, text: misses.join(' · ') });
    else (score += 15), reasons.push({ ok: true, text: 'You meet the published test requirements' });
  }

  if (p.preferredCountries.some((c) => c.toLowerCase() === u.country.toLowerCase())) score += 10;
  else reasons.push({ ok: false, text: `${u.country} isn't in your preferred countries` });

  if (u.wesRequired || u.programs.some((pr) => pr.wesRequired)) reasons.push({ ok: false, text: 'Needs a WES credential evaluation' });

  return { score: Math.min(100, score), reasons };
}
