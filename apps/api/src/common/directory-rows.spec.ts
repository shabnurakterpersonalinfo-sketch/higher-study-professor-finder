import { parseCsvTable } from './csv';
import { checkHeader, DIRECTORY_ENTITIES, parseProfessorRow, parseProgramRow, parseUniversityRow, PARSERS, templateCsv } from './directory-rows';

describe('directory rows', () => {
  it.each(DIRECTORY_ENTITIES)('the %s template parses cleanly with no errors', (entity) => {
    const t = parseCsvTable(templateCsv(entity), entity);
    expect(checkHeader(entity, t.header).missing).toEqual([]);
    const res = PARSERS[entity](t.rows[0].record);
    expect(res.errors).toEqual([]);
    expect(res.data).not.toBeNull();
  });

  it('derives university rank/state', () => {
    const r = parseUniversityRow({ id: 'univ_x', name: 'X U', location: 'Tampa, FL', cs_rank: '#106 in Computer Science (tie)', wes_required: '' });
    expect(r.data).toMatchObject({ state: 'FL', csRankPosition: 106, csRankTied: true, wesRequired: false });
  });

  it('rejects the stripped-link placeholder with a helpful message', () => {
    const r = parseProgramRow({ university_id: 'univ_gmu', program_name: 'CS PhD', degree_level: 'PhD', catalog_link: '[suspicious link removed]' });
    expect(r.data).toBeNull();
    expect(r.errors[0]).toMatch(/spreadsheet export stripped this link/);
  });

  it('accepts degree level case-insensitively and rejects unknown ones', () => {
    expect(parseProgramRow({ university_id: 'u', program_name: 'P', degree_level: 'phd' }).data?.degreeLevel).toBe('PhD');
    expect(parseProgramRow({ university_id: 'u', program_name: 'P', degree_level: 'BSc' }).errors[0]).toMatch(/degree_level/);
  });

  it('cleans professor rows and validates numbers/emails', () => {
    const ok = parseProfessorRow({ university_id: 'u', name: 'Prof. Ada Lovelace', email: 'ADA@X.EDU', h_index: '1,200', research_areas: 'AI; AI;Logic' });
    expect(ok.data).toMatchObject({ name: 'Ada Lovelace', email: 'ada@x.edu', hIndex: 1200, researchAreas: ['AI', 'Logic'], acceptingStudents: null });
    const bad = parseProfessorRow({ university_id: 'u', name: 'B', email: 'nope', h_index: '-3', accepting_students: 'maybe' });
    expect(bad.errors).toHaveLength(3);
  });

  it('splits research areas written as a JSON array (spreadsheet/DB exports)', () => {
    const r = parseProfessorRow({ university_id: 'u', name: 'Baoxin Li', research_areas: '["Computer Vision", "Pattern Recognition", "Image Processing", "Machine Learning"]' });
    expect(r.data?.researchAreas).toEqual(['Computer Vision', 'Pattern Recognition', 'Image Processing', 'Machine Learning']);
  });

  it('reports missing required columns and unknown extras', () => {
    expect(checkHeader('programs', ['id', 'university_id', 'program_name', 'colour'])).toEqual({ missing: ['degree_level'], unknown: ['colour'] });
  });
});
