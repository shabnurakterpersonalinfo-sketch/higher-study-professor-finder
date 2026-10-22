import { buildChecklist, checklistProgress, requiredLors } from './checklist';

const none = {
  officialTranscriptSubmitted: false, lor1Submitted: false, lor2Submitted: false, lor3Submitted: false,
  sopSubmitted: false, cvSubmitted: false, greSubmitted: false, ieltsSubmitted: false,
};

describe('application checklist', () => {
  it('reads LOR counts from limitation notes', () => {
    expect(requiredLors('Requires 2-3 LORs')).toBe(2);
    expect(requiredLors('Requires official transcripts')).toBe(3);
    expect(requiredLors(null)).toBe(3);
  });

  it('matches app_001 (GMU): only LOR 3 missing, and it is optional', () => {
    const items = buildChecklist(
      { ...none, officialTranscriptSubmitted: true, lor1Submitted: true, lor2Submitted: true, sopSubmitted: true, cvSubmitted: true, greSubmitted: true, ieltsSubmitted: true },
      { greRequired: true, ieltsRequirement: '7.0 overall (6.5 min per sub-score)', limitationsNotes: 'Requires 2-3 LORs', wesRequired: false },
    );
    expect(items.find((i) => i.key === 'lor3Submitted')).toMatchObject({ required: false, done: false });
    expect(checklistProgress(items)).toEqual({ done: 7, total: 7 });
  });

  it('labels the transcript for WES programs and accepts TOEFL where allowed', () => {
    const items = buildChecklist(
      { ...none, toeflSubmitted: true },
      { greRequired: true, ieltsRequirement: 'Official IELTS / TOEFL', limitationsNotes: 'Requires Official Transcript or WES evaluation', wesRequired: true },
    );
    expect(items[0].label).toBe('Official transcript / WES evaluation');
    expect(items.find((i) => i.key === 'ieltsSubmitted')).toMatchObject({ label: 'IELTS / TOEFL scores', done: true });
  });

  it('drops GRE when the program says it is not required', () => {
    const items = buildChecklist(none, { greRequired: false, ieltsRequirement: null, limitationsNotes: null, wesRequired: false });
    expect(items.find((i) => i.key === 'greSubmitted')?.required).toBe(false);
    expect(items.find((i) => i.key === 'ieltsSubmitted')).toBeUndefined();
  });
});
