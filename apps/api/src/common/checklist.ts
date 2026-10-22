/**
 * Document checklist for an application, derived from the program's published
 * requirements rather than a fixed list:
 *   - LOR count from limitation notes ("Requires 2-3 LORs" → 2 required, 3rd optional)
 *   - GRE only when the program says it's required (or doesn't say)
 *   - IELTS only when the program lists an IELTS/TOEFL requirement
 *   - transcript wording mentions WES when the university or program needs it
 */
export interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
  done: boolean;
}

type Flags = {
  officialTranscriptSubmitted: boolean;
  lor1Submitted: boolean;
  lor2Submitted: boolean;
  lor3Submitted: boolean;
  sopSubmitted: boolean;
  cvSubmitted: boolean;
  greSubmitted: boolean;
  ieltsSubmitted: boolean;
  toeflSubmitted?: boolean;
};
type ProgramReqs = {
  greRequired: boolean | null;
  ieltsRequirement: string | null;
  limitationsNotes: string | null;
  wesRequired: boolean;
  university?: { wesRequired: boolean } | null;
};

/** "Requires 2-3 LORs" → 2; "three letters" → 3; default 3 (the common US PhD ask). */
export function requiredLors(notes: string | null): number {
  if (!notes) return 3;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
  const m = notes.match(/(\d|one|two|three|four)\s*(?:-|–|to)?\s*(\d|one|two|three|four)?\s*(?:LORs?|letters?|recommendations?)/i);
  if (!m) return 3;
  const n = (s: string) => words[s.toLowerCase()] ?? Number(s);
  return Math.min(3, Math.max(1, n(m[1])));
}

export function buildChecklist(a: Flags, p: ProgramReqs): ChecklistItem[] {
  const lors = requiredLors(p.limitationsNotes);
  const wes = p.wesRequired || !!p.university?.wesRequired;
  const items: ChecklistItem[] = [
    { key: 'officialTranscriptSubmitted', label: wes ? 'Official transcript / WES evaluation' : 'Official transcript', required: true, done: a.officialTranscriptSubmitted },
    { key: 'lor1Submitted', label: 'LOR 1', required: lors >= 1, done: a.lor1Submitted },
    { key: 'lor2Submitted', label: 'LOR 2', required: lors >= 2, done: a.lor2Submitted },
    { key: 'lor3Submitted', label: 'LOR 3', required: lors >= 3, done: a.lor3Submitted },
    { key: 'sopSubmitted', label: 'SOP / Personal statement', required: true, done: a.sopSubmitted },
    { key: 'cvSubmitted', label: 'Resume / CV', required: true, done: a.cvSubmitted },
    { key: 'greSubmitted', label: 'GRE scores', required: p.greRequired !== false, done: a.greSubmitted },
  ];
  if (p.ieltsRequirement) {
    const toeflOk = /toefl/i.test(p.ieltsRequirement);
    items.push({
      key: 'ieltsSubmitted',
      label: toeflOk ? 'IELTS / TOEFL scores' : 'IELTS scores',
      required: true,
      done: a.ieltsSubmitted || (toeflOk && !!a.toeflSubmitted),
    });
  }
  return items;
}

export function checklistProgress(items: ChecklistItem[]) {
  const req = items.filter((i) => i.required);
  return { done: req.filter((i) => i.done).length, total: req.length };
}
