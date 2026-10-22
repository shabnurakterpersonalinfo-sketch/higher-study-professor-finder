/**
 * Row-level parsing + validation for directory CSVs (universities, programs,
 * professors). Shared by the seed (prisma/seed.ts) and the admin CSV import,
 * so a row is accepted, normalised and derived identically either way.
 *
 * Parsers never throw: they return the cleaned row plus errors (row rejected)
 * and warnings (row accepted, worth a look).
 */
import { clean, deriveProgram, deriveUniversity, splitList, stripHonorific } from './derive';
import { ID_PATTERN } from './validators';

export type DirectoryEntity = 'universities' | 'programs' | 'professors';
export const DIRECTORY_ENTITIES: DirectoryEntity[] = ['universities', 'programs', 'professors'];

/** Column spec per entity. `required` columns must exist in the header; values may still be optional. */
export const COLUMNS: Record<DirectoryEntity, { required: string[]; optional: string[]; example: Record<string, string> }> = {
  universities: {
    required: ['name', 'location'],
    optional: ['id', 'cs_rank', 'wes_required'],
    example: { id: 'univ_example', name: 'Example State University', location: 'Austin, TX', cs_rank: '#40 in Computer Science (tie)', wes_required: 'false' },
  },
  programs: {
    required: ['university_id', 'program_name', 'degree_level'],
    optional: [
      'id', 'catalog_link', 'deadline_date', 'application_fee', 'fee_waiver_type', 'fee_waiver_info',
      'gre_requirement', 'ielts_requirement', 'financial_aid_policy', 'limitations_notes',
    ],
    example: {
      id: 'prog_example_phd', university_id: 'univ_example', program_name: 'Computer Science, PhD', degree_level: 'PhD',
      catalog_link: 'https://grad.example.edu/cs-phd', deadline_date: 'Dec 15', application_fee: '$75', fee_waiver_type: 'Central Request',
      fee_waiver_info: 'Request via graduate school form', gre_requirement: 'GRE not required', ielts_requirement: '7.0 overall',
      financial_aid_policy: 'Fully funded with TA/RA support', limitations_notes: 'Requires 3 LORs',
    },
  },
  professors: {
    required: ['university_id', 'name'],
    optional: ['id', 'email', 'department', 'profile_link', 'google_scholar_link', 'lab_website', 'h_index', 'citation_count', 'accepting_students', 'research_areas'],
    example: {
      id: 'prof_example_doe', university_id: 'univ_example', name: 'Jane Doe', email: 'jdoe@example.edu', department: 'Computer Science',
      profile_link: 'https://cs.example.edu/~jdoe', google_scholar_link: '', lab_website: '', h_index: '25', citation_count: '4100',
      accepting_students: 'true', research_areas: 'Machine Learning;Computer Vision',
    },
  },
};

export interface RowResult<T> {
  data: T | null;
  errors: string[];
  warnings: string[];
}

export interface UniversityRow {
  id: string | null;
  name: string;
  location: string;
  csRank: string | null;
  wesRequired: boolean;
  country: string;
  state: string | null;
  csRankPosition: number | null;
  csRankTied: boolean;
}
export interface ProgramRow {
  id: string | null;
  /** id or exact university name as written in the CSV; resolved by the caller */
  universityRef: string;
  programName: string;
  degreeLevel: 'MS' | 'PhD' | 'PostDoc';
  catalogLink: string | null;
  deadlineDate: string | null;
  applicationFee: string | null;
  feeWaiverType: string | null;
  feeWaiverInfo: string | null;
  greRequirement: string | null;
  ieltsRequirement: string | null;
  financialAidPolicy: string | null;
  limitationsNotes: string | null;
  applicationFeeUsd: number | null;
  greRequired: boolean | null;
  ieltsMinOverall: number | null;
  fundingLevel: string | null;
  wesRequired: boolean;
}
export interface ProfessorRow {
  id: string | null;
  universityRef: string;
  name: string;
  email: string | null;
  department: string | null;
  profileLink: string | null;
  googleScholarLink: string | null;
  labWebsite: string | null;
  hIndex: number | null;
  citationCount: number | null;
  /** null = column empty → keep the existing value (or schema default true on create) */
  acceptingStudents: boolean | null;
  researchAreas: string[];
}

// ------------------------------------------------------------------ helpers
const v = (r: Record<string, string>, k: string) => clean(r[k]);

export function parseBool(raw: string | null | undefined, field: string, errors: string[]): boolean | null {
  const t = clean(raw)?.toLowerCase();
  if (t == null) return null;
  if (['true', '1', 'yes', 'y'].includes(t)) return true;
  if (['false', '0', 'no', 'n'].includes(t)) return false;
  errors.push(`${field}: "${raw}" is not true/false`);
  return null;
}

function parseInt0(raw: string | null | undefined, field: string, errors: string[]): number | null {
  const t = clean(raw)?.replace(/,/g, '');
  if (t == null) return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) {
    errors.push(`${field}: "${raw}" is not a whole number ≥ 0`);
    return null;
  }
  return n;
}

function parseId(raw: string | null | undefined, errors: string[]): string | null {
  const t = clean(raw);
  if (t == null) return null;
  if (!ID_PATTERN.test(t)) errors.push(`id: "${t}" may only contain letters, digits, "_" and "-" (max 64)`);
  return t;
}

function parseUrl(raw: string | null | undefined, field: string, errors: string[]): string | null {
  const t = clean(raw);
  if (t == null) return null;
  if (/suspicious link removed/i.test(t)) {
    errors.push(`${field}: contains "[suspicious link removed]" — the spreadsheet export stripped this link; paste the real URL`);
    return null;
  }
  try {
    const u = new URL(t);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
    return t;
  } catch {
    errors.push(`${field}: "${t}" is not an http(s) URL`);
    return null;
  }
}

function required(r: Record<string, string>, k: string, errors: string[]): string {
  const t = v(r, k);
  if (t == null) errors.push(`${k} is required`);
  return t ?? '';
}

function maxLen(value: string | null, field: string, n: number, errors: string[]) {
  if (value && value.length > n) errors.push(`${field}: longer than ${n} characters`);
}

// ------------------------------------------------------------------ parsers
export function parseUniversityRow(r: Record<string, string>): RowResult<UniversityRow> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const id = parseId(r.id, errors);
  const name = required(r, 'name', errors);
  const location = required(r, 'location', errors);
  const csRank = v(r, 'cs_rank');
  const wes = parseBool(r.wes_required, 'wes_required', errors);
  maxLen(name, 'name', 200, errors);
  const d = deriveUniversity({ location, csRank });
  if (csRank && d.csRankPosition == null) warnings.push(`couldn't read a rank number from cs_rank "${csRank}"`);
  if (location && !d.state && d.country === 'United States') warnings.push(`location "${location}" has no state code — expected "City, ST"`);
  if (errors.length) return { data: null, errors, warnings };
  return { data: { id, name, location, csRank, wesRequired: wes ?? false, ...d }, errors, warnings };
}

export function parseProgramRow(r: Record<string, string>): RowResult<ProgramRow> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const id = parseId(r.id, errors);
  const universityRef = required(r, 'university_id', errors);
  const programName = required(r, 'program_name', errors);
  const degree = v(r, 'degree_level');
  const degreeLevel = (['MS', 'PhD', 'PostDoc'] as const).find((x) => x.toLowerCase() === degree?.toLowerCase());
  if (!degreeLevel) errors.push(`degree_level: "${degree ?? ''}" must be MS, PhD or PostDoc`);
  const text = {
    catalogLink: parseUrl(r.catalog_link, 'catalog_link', errors),
    deadlineDate: v(r, 'deadline_date'),
    applicationFee: v(r, 'application_fee'),
    feeWaiverType: v(r, 'fee_waiver_type'),
    feeWaiverInfo: v(r, 'fee_waiver_info'),
    greRequirement: v(r, 'gre_requirement'),
    ieltsRequirement: v(r, 'ielts_requirement'),
    financialAidPolicy: v(r, 'financial_aid_policy'),
    limitationsNotes: v(r, 'limitations_notes'),
  };
  maxLen(programName, 'program_name', 200, errors);
  maxLen(text.financialAidPolicy, 'financial_aid_policy', 1000, errors);
  maxLen(text.limitationsNotes, 'limitations_notes', 1000, errors);
  const d = deriveProgram(text);
  if (!text.deadlineDate) warnings.push('deadline_date is empty');
  if (text.applicationFee && d.applicationFeeUsd == null) warnings.push(`couldn't read a fee from "${text.applicationFee}"`);
  if (text.financialAidPolicy && !d.fundingLevel) warnings.push(`couldn't classify funding from "${text.financialAidPolicy}"`);
  if (errors.length || !degreeLevel) return { data: null, errors, warnings };
  return { data: { id, universityRef, programName, degreeLevel, ...text, ...d }, errors, warnings };
}

export function parseProfessorRow(r: Record<string, string>): RowResult<ProfessorRow> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const id = parseId(r.id, errors);
  const universityRef = required(r, 'university_id', errors);
  const name = stripHonorific(required(r, 'name', errors));
  const email = v(r, 'email')?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`email: "${email}" is not an email address`);
  const row: ProfessorRow = {
    id,
    universityRef,
    name,
    email,
    department: v(r, 'department'),
    profileLink: parseUrl(r.profile_link, 'profile_link', errors),
    googleScholarLink: parseUrl(r.google_scholar_link, 'google_scholar_link', errors),
    labWebsite: parseUrl(r.lab_website, 'lab_website', errors),
    hIndex: parseInt0(r.h_index, 'h_index', errors),
    citationCount: parseInt0(r.citation_count, 'citation_count', errors),
    acceptingStudents: parseBool(r.accepting_students, 'accepting_students', errors),
    researchAreas: splitList(r.research_areas),
  };
  maxLen(name, 'name', 120, errors);
  if (!row.researchAreas.length) warnings.push("no research_areas — won't appear in tag search or fit ranking");
  if (!email) warnings.push('no email — students can still track outreach but can\'t email from the app');
  if (errors.length) return { data: null, errors, warnings };
  return { data: row, errors, warnings };
}

export const PARSERS = {
  universities: parseUniversityRow,
  programs: parseProgramRow,
  professors: parseProfessorRow,
} as const;

/** Header problems that make the whole file unusable (missing required columns) + unknown columns (warning). */
export function checkHeader(entity: DirectoryEntity, header: string[]) {
  const spec = COLUMNS[entity];
  const known = new Set([...spec.required, ...spec.optional]);
  return {
    missing: spec.required.filter((c) => !header.includes(c)),
    unknown: header.filter((c) => c && !known.has(c)),
  };
}

export function templateCsv(entity: DirectoryEntity): string {
  const spec = COLUMNS[entity];
  const cols = ['id', ...spec.required, ...spec.optional.filter((c) => c !== 'id')];
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return `${cols.join(',')}\n${cols.map((c) => esc(spec.example[c] ?? '')).join(',')}\n`;
}
