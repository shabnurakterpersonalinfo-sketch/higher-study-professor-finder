import { parseCsv, parseCsvTable } from './csv';

describe('parseCsv', () => {
  it('handles quotes, embedded commas and escaped quotes', () => {
    const rows = parseCsv('id,name,note\nu1,"Cambridge, MA","He said ""hi"""\r\nu2,Plain,\n');
    expect(rows).toEqual([
      { id: 'u1', name: 'Cambridge, MA', note: 'He said "hi"' },
      { id: 'u2', name: 'Plain', note: '' },
    ]);
  });
  it('keeps newlines inside quoted cells', () => {
    expect(parseCsv('a,b\n"line1\nline2",x')).toEqual([{ a: 'line1\nline2', b: 'x' }]);
  });
  it('rejects rows whose width differs from the header', () => {
    expect(() => parseCsv('a,b,c\n1,2\n', 'programs.csv')).toThrow('programs.csv: line 2 has 2 cells, header has 3');
  });
  it('rejects unterminated quotes', () => {
    expect(() => parseCsv('a\n"oops')).toThrow(/unterminated quote/);
  });
  it('lenient mode reports bad rows instead of failing the file', () => {
    const t = parseCsvTable('A,B\n1,2\n3\n4,5', 'x', { lenient: true });
    expect(t.header).toEqual(['a', 'b']);
    expect(t.rows.map((r) => r.error ?? r.record.a)).toEqual(['1', 'line 3 has 1 cells, header has 2 — check for unquoted commas', '4']);
  });
});
