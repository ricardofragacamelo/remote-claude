import { describe, expect, it } from 'vitest';

import { parseRipgrepLine } from '@adapter/outbound/search/ripgrep-json.mapper';

describe('parseRipgrepLine — against real rg --json output', () => {
  it('reads a begin message', () => {
    expect(parseRipgrepLine('{"type":"begin","data":{"path":{"text":"sample.txt"}}}')).toEqual({
      type: 'begin',
      path: 'sample.txt',
    });
  });

  it('strips the ./ ripgrep adds because the search always names an explicit path', () => {
    expect(parseRipgrepLine('{"type":"begin","data":{"path":{"text":"./sample.txt"}}}')).toEqual({
      type: 'begin',
      path: 'sample.txt',
    });
  });

  it('reads an end message, ignoring the stats it carries', () => {
    expect(
      parseRipgrepLine(
        '{"type":"end","data":{"path":{"text":"sample.txt"},"binary_offset":null,"stats":{"matches":3}}}',
      ),
    ).toEqual({ type: 'end', path: 'sample.txt', binaryOffset: null });
  });

  it('reads an end message with a binary offset — ripgrep still matched, but flagged it — S-67', () => {
    expect(
      parseRipgrepLine('{"type":"end","data":{"path":{"text":"bin.dat"},"binary_offset":11}}'),
    ).toEqual({ type: 'end', path: 'bin.dat', binaryOffset: 11 });
  });

  it('treats a non-numeric binary_offset as absent, never a throw', () => {
    expect(
      parseRipgrepLine('{"type":"end","data":{"path":{"text":"a.txt"},"binary_offset":"odd"}}'),
    ).toEqual({ type: 'end', path: 'a.txt', binaryOffset: null });
  });

  it('reads a match message with two submatches, stripping the trailing newline — S-64', () => {
    const line =
      '{"type":"match","data":{"path":{"text":"sample.txt"},"lines":{"text":"foo bar foo\\n"},"line_number":2,"absolute_offset":13,"submatches":[{"match":{"text":"foo"},"start":0,"end":3},{"match":{"text":"foo"},"start":8,"end":11}]}}';

    expect(parseRipgrepLine(line)).toEqual({
      type: 'match',
      data: {
        path: 'sample.txt',
        lineNumber: 2,
        lineText: 'foo bar foo',
        submatches: [
          { start: 0, end: 3, text: 'foo' },
          { start: 8, end: 11, text: 'foo' },
        ],
      },
    });
  });

  it('reads a match whose byte offsets land after a multibyte character — S-65', () => {
    const line =
      '{"type":"match","data":{"path":{"text":"sample.txt"},"lines":{"text":"\\ud83d\\ude00 emoji test foo\\n"},"line_number":3,"absolute_offset":25,"submatches":[{"match":{"text":"foo"},"start":16,"end":19}]}}';

    const message = parseRipgrepLine(line);
    expect(message).toMatchObject({ type: 'match', data: { lineNumber: 3 } });
    if (message.type === 'match') {
      expect(message.data.submatches).toEqual([{ start: 16, end: 19, text: 'foo' }]);
    }
  });

  it('reads a context message', () => {
    const line =
      '{"type":"context","data":{"path":{"text":"sample.txt"},"lines":{"text":"before\\n"},"line_number":1}}';

    expect(parseRipgrepLine(line)).toEqual({
      type: 'context',
      data: { path: 'sample.txt', lineNumber: 1, lineText: 'before' },
    });
  });

  it('reads a summary message', () => {
    expect(parseRipgrepLine('{"type":"summary","data":{"stats":{}}}')).toEqual({
      type: 'summary',
    });
  });

  it('is unknown for a path that is not valid UTF-8 — the bytes form', () => {
    const line = '{"type":"begin","data":{"path":{"bytes":"bm90LXV0Zjg="}}}';

    expect(parseRipgrepLine(line)).toEqual({ type: 'unknown' });
  });

  it('is unknown for invalid JSON, never a throw', () => {
    expect(parseRipgrepLine('not json at all')).toEqual({ type: 'unknown' });
  });

  it('is unknown for an empty line', () => {
    expect(parseRipgrepLine('')).toEqual({ type: 'unknown' });
  });

  it('is unknown for a match message missing submatches', () => {
    const line =
      '{"type":"match","data":{"path":{"text":"a.txt"},"lines":{"text":"x\\n"},"line_number":1}}';

    expect(parseRipgrepLine(line)).toEqual({ type: 'unknown' });
  });

  it('is unknown for a recognised type with no data at all', () => {
    expect(parseRipgrepLine('{"type":"match"}')).toEqual({ type: 'unknown' });
    expect(parseRipgrepLine('{"type":"context"}')).toEqual({ type: 'unknown' });
    expect(parseRipgrepLine('{"type":"begin"}')).toEqual({ type: 'unknown' });
    expect(parseRipgrepLine('{"type":"end"}')).toEqual({ type: 'unknown' });
  });

  it('is unknown for a path given as a raw string instead of the text/bytes object', () => {
    expect(parseRipgrepLine('{"type":"begin","data":{"path":"a.txt"}}')).toEqual({
      type: 'unknown',
    });
  });

  it('is unknown for an end message whose path is missing', () => {
    expect(parseRipgrepLine('{"type":"end","data":{"binary_offset":null}}')).toEqual({
      type: 'unknown',
    });
  });

  it('is unknown for a match whose lines is not the text/bytes object', () => {
    const line =
      '{"type":"match","data":{"path":{"text":"a.txt"},"lines":"oops","line_number":1,"submatches":[]}}';

    expect(parseRipgrepLine(line)).toEqual({ type: 'unknown' });
  });

  it('is unknown for a context message whose lines is not the text/bytes object', () => {
    const line =
      '{"type":"context","data":{"path":{"text":"a.txt"},"lines":"oops","line_number":1}}';

    expect(parseRipgrepLine(line)).toEqual({ type: 'unknown' });
  });

  it('is unknown for a context message whose path is missing', () => {
    const line = '{"type":"context","data":{"lines":{"text":"x\\n"},"line_number":1}}';

    expect(parseRipgrepLine(line)).toEqual({ type: 'unknown' });
  });

  it('is unknown for a submatch given as a raw value instead of an object', () => {
    const line =
      '{"type":"match","data":{"path":{"text":"a.txt"},"lines":{"text":"x\\n"},"line_number":1,"submatches":[42]}}';

    expect(parseRipgrepLine(line)).toEqual({ type: 'unknown' });
  });

  it('is unknown for a whole line that parses to valid JSON that is not an object', () => {
    expect(parseRipgrepLine('42')).toEqual({ type: 'unknown' });
    expect(parseRipgrepLine('"just a string"')).toEqual({ type: 'unknown' });
  });

  it('is unknown for a type ripgrep has never documented', () => {
    expect(parseRipgrepLine('{"type":"something-new","data":{}}')).toEqual({ type: 'unknown' });
  });

  it('is unknown for a submatch whose match.text is missing', () => {
    const line =
      '{"type":"match","data":{"path":{"text":"a.txt"},"lines":{"text":"x\\n"},"line_number":1,"submatches":[{"start":0,"end":1}]}}';

    expect(parseRipgrepLine(line)).toEqual({ type: 'unknown' });
  });

  it('a line with no trailing newline is kept exactly as given', () => {
    const line =
      '{"type":"match","data":{"path":{"text":"a.txt"},"lines":{"text":"no-newline"},"line_number":1,"submatches":[{"match":{"text":"no"},"start":0,"end":2}]}}';

    const message = parseRipgrepLine(line);
    expect(message).toMatchObject({ type: 'match', data: { lineText: 'no-newline' } });
  });
});
