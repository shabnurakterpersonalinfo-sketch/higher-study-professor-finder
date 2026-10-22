import {
  clean,
  deriveProgram,
  deriveUniversity,
  matchedAreas,
  normalizeFundingPreference,
  parseCsRank,
  parseFeeUsd,
  parseFundingLevel,
  parseGreRequired,
  parseIeltsMin,
  parseLocation,
  normalizeList,
  splitList,
  stripHonorific,
  universityMatch,
} from './derive';

// Inputs below are the literal values from the seed CSVs.
describe('derive: universities', () => {
  it('parses US locations', () => {
    expect(parseLocation('Cambridge, MA')).toEqual({ state: 'MA', country: 'United States' });
    expect(parseLocation('El Paso, TX')).toEqual({ state: 'TX', country: 'United States' });
    expect(parseLocation('Toronto, Canada')).toEqual({ state: null, country: 'Canada' });
  });
  it('parses CS rank text', () => {
    expect(parseCsRank('#1 in Computer Science')).toEqual({ position: 1, tied: false });
    expect(parseCsRank('#106 in Computer Science (tie)')).toEqual({ position: 106, tied: true });
    expect(parseCsRank('')).toEqual({ position: null, tied: false });
  });
  it('derives all university columns', () => {
    expect(deriveUniversity({ location: 'Baltimore, MD', csRank: '#20 in Computer Science (tie)' })).toEqual({
      country: 'United States',
      state: 'MD',
      csRankPosition: 20,
      csRankTied: true,
    });
  });
});

describe('derive: programs', () => {
  it('parses fees', () => {
    expect(parseFeeUsd('$80')).toBe(80);
    expect(parseFeeUsd('$0')).toBe(0);
    expect(parseFeeUsd('')).toBeNull();
  });
  it('parses GRE requirement text', () => {
    expect(parseGreRequired('Official GRE Required')).toBe(true);
    expect(parseGreRequired('GRE not required')).toBe(false);
    expect(parseGreRequired('Optional')).toBe(false);
    expect(parseGreRequired('See website')).toBeNull();
  });
  it('only extracts IELTS when a number is published', () => {
    expect(parseIeltsMin('7.0 overall (6.5 min per sub-score)')).toBe(7);
    expect(parseIeltsMin('Official IELTS Required')).toBeNull();
    expect(parseIeltsMin('Official IELTS / TOEFL')).toBeNull();
  });
  it('classifies every financial-aid policy in the dataset', () => {
    expect(parseFundingLevel('Guaranteed TA or Fellowship for all full-time admitted PhD students.')).toBe('GUARANTEED');
    expect(parseFundingLevel('RAs and TAs available through college grants.')).toBe('AVAILABLE');
    expect(parseFundingLevel('Fully funded with tuition waiver, monthly stipend, and health insurance.')).toBe('GUARANTEED');
    expect(parseFundingLevel('Fully funded; all doctoral students receive TA/RA support.')).toBe('GUARANTEED');
    expect(parseFundingLevel('Departmental assistantships and fellowships offered upon admission.')).toBe('AVAILABLE');
    expect(parseFundingLevel('Assistantships depend on faculty funding availability.')).toBe('CONDITIONAL');
  });
  it('detects WES in limitation notes', () => {
    expect(deriveProgram({ limitationsNotes: 'Requires WES course-by-course evaluation' }).wesRequired).toBe(true);
    expect(deriveProgram({ limitationsNotes: 'Requires credential evaluation for foreign degrees' }).wesRequired).toBe(true);
    expect(deriveProgram({ limitationsNotes: 'Requires 2-3 LORs' }).wesRequired).toBe(false);
  });
});

describe('derive: people & tags', () => {
  it('cleans placeholders', () => {
    expect(clean('N/A')).toBeNull();
    expect(clean('  Pending ')).toBe('Pending');
  });
  it('strips honorifics', () => {
    expect(stripHonorific('Prof. Jonathan Smith')).toBe('Jonathan Smith');
    expect(stripHonorific('Qiang (Shawn) Cheng')).toBe('Qiang (Shawn) Cheng');
  });
  it('normalises funding preference', () => {
    expect(normalizeFundingPreference('Fully Funded')).toBe('FULLY_FUNDED');
    expect(normalizeFundingPreference('Self Funded')).toBe('SELF');
  });
  it('matches tags across spacing and case', () => {
    expect(matchedAreas(['Cybersecurity', 'Computer Vision'], ['Cyber Security', 'Software Engineering'])).toEqual(['Cyber Security']);
    expect(splitList('A; B;A;;C')).toEqual(['A', 'B', 'C']);
  });
  it('reads list cells written as arrays or with other separators', () => {
    const want = ['Computer Vision', 'Pattern Recognition', 'Image Processing', 'Machine Learning'];
    expect(splitList('["Computer Vision", "Pattern Recognition", "Image Processing", "Machine Learning"]')).toEqual(want);
    expect(splitList("['Computer Vision', 'Pattern Recognition', 'Image Processing', 'Machine Learning']")).toEqual(want);
    expect(splitList('{"Computer Vision","Pattern Recognition","Image Processing","Machine Learning"}')).toEqual(want);
    expect(splitList('Computer Vision | Pattern Recognition|Image Processing | Machine Learning')).toEqual(want);
    expect(splitList('Computer Vision, Pattern Recognition, Image Processing, Machine Learning')).toEqual(want);
    expect(splitList('Vision, Language; Robotics')).toEqual(['Vision, Language', 'Robotics']); // ; wins over ,
    expect(splitList('')).toEqual([]);
  });
  it('expands array literals stored inside API arrays', () => {
    expect(normalizeList(['["A", "B"]', 'C', 'A'])).toEqual(['A', 'B', 'C']);
    expect(normalizeList(['Vision, Language'])).toEqual(['Vision, Language']);
  });
});

describe('universityMatch', () => {
  const ahmed = {
    targetDegree: 'PhD',
    fundingPreference: 'FULLY_FUNDED',
    preferredCountries: ['United States', 'Canada', 'Germany'],
    researchInterests: ['Explainable AI', 'Machine Learning', 'Computer Vision', 'Cybersecurity'],
    greScore: 318,
    ieltsScore: 7.5,
  };
  it('scores Stevens highly (fit + guaranteed funding + requirements met)', () => {
    const r = universityMatch(ahmed, {
      country: 'United States',
      wesRequired: false,
      researchAreas: ['Explainable AI', 'Computer Vision'],
      programs: [{ degreeLevel: 'PhD', fundingLevel: 'GUARANTEED', greRequired: true, ieltsMinOverall: null, wesRequired: false }],
    });
    expect(r.score).toBe(100);
  });
  it('explains why a university without programs or faculty scores low', () => {
    const r = universityMatch(ahmed, { country: 'United States', wesRequired: false, researchAreas: [], programs: [] });
    expect(r.score).toBe(10);
    expect(r.reasons.map((x) => x.text)).toContain('No program details yet');
  });
  it('flags unmet IELTS', () => {
    const r = universityMatch({ ...ahmed, ieltsScore: 6.5 }, {
      country: 'United States',
      wesRequired: false,
      researchAreas: [],
      programs: [{ degreeLevel: 'PhD', fundingLevel: 'GUARANTEED', greRequired: true, ieltsMinOverall: 7, wesRequired: false }],
    });
    expect(r.reasons.find((x) => !x.ok && x.text.includes('IELTS'))).toBeTruthy();
  });
});
