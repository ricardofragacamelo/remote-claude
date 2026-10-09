import { describe, expect, it } from 'vitest';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOCKED_PASSWORDS,
  READER_LINKS,
  READER_PAGES,
  SCRIPTED_JS,
  divergentFixtures,
  literal,
  pdfFixtures,
  rc4,
  readerPdf,
  standardSecurity,
} from '../../../scripts/lib/pdf-fixtures.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const versioned = path.join(repoRoot, 'e2e', 'fixtures', 'files');

/** The text of a whole PDF, as Latin-1 — what its unciphered parts can be searched in. */
const textOf = (/** @type {Buffer} */ bytes) => bytes.toString('latin1');

describe('the PDF fixtures of plan 21 — S-05', () => {
  it('writes the same bytes on every run, the locked copy included', () => {
    const first = pdfFixtures();
    const second = pdfFixtures();

    expect(Object.keys(first)).toEqual(['reader.pdf', 'scripted.pdf', 'locked.pdf']);
    for (const [name, bytes] of Object.entries(first)) {
      expect(bytes.equals(second[name] ?? Buffer.alloc(0))).toBe(true);
    }
  });

  it('is what is versioned — the suites read the files, the script keeps them honest', () => {
    const read = (/** @type {string} */ name) => fs.readFileSync(path.join(versioned, name));

    expect(divergentFixtures(pdfFixtures(), read)).toEqual([]);
  });

  it('names a fixture that differs from the script, and one that is missing', () => {
    const fixtures = pdfFixtures();
    const disk = {
      'reader.pdf': fixtures['reader.pdf'],
      'scripted.pdf': Buffer.from('%PDF-1.7 something else'),
    };

    expect(
      divergentFixtures(fixtures, (name) => disk[/** @type {keyof typeof disk} */ (name)] ?? null),
    ).toEqual(['scripted.pdf', 'locked.pdf']);
  });

  it('is a PDF with a cross-reference table that points at every object', () => {
    const text = textOf(readerPdf());
    const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)?.[1]);
    const table = text.slice(start);
    const offsets = [...table.matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));

    expect(text.startsWith('%PDF-1.7\n')).toBe(true);
    expect(table.startsWith('xref\n')).toBe(true);
    offsets.forEach((offset, index) => {
      expect(text.slice(offset).startsWith(`${index + 1} 0 obj\n`)).toBe(true);
    });
  });

  it('writes the twelve pages, the last one with no text, and the links of the first', () => {
    const text = textOf(readerPdf());

    expect(text).toContain('/Count 12');
    expect(READER_PAGES).toHaveLength(12);
    expect(READER_PAGES.at(-1)).toBeNull();
    expect(text).toContain('0.85 g 72 72 468 648 re f');
    for (const link of READER_LINKS) {
      expect(text).toContain(literal(link.label));
    }
    expect(text).toContain('/S /URI');
    expect(text).toContain('/Fit');
    expect(text).toContain('/Outlines');
  });

  it('carries a script run on opening and a form field in the scripted copy', () => {
    const text = textOf(pdfFixtures()['scripted.pdf'] ?? Buffer.alloc(0));

    expect(text).toContain('/OpenAction << /S /JavaScript');
    expect(text).toContain(Buffer.from(SCRIPTED_JS, 'latin1').toString('hex'));
    expect(text).toContain('/AcroForm');
    expect(text).toContain('/FT /Tx');
  });

  it('ciphers the locked copy: an Encrypt dictionary, and none of the text in the clear', () => {
    const locked = textOf(pdfFixtures()['locked.pdf'] ?? Buffer.alloc(0));

    expect(locked).toMatch(/\/Filter \/Standard \/V 2 \/R 3 \/Length 128/);
    expect(locked).toMatch(/\/Encrypt \d+ 0 R/);
    expect(locked).not.toContain('Reader fixture');
    expect(textOf(readerPdf())).toContain('Reader fixture');
  });

  it('derives the entries of the standard security handler as the reference does', () => {
    const id = Buffer.alloc(16, 7);
    const one = standardSecurity(LOCKED_PASSWORDS, id);
    const again = standardSecurity(LOCKED_PASSWORDS, id);
    const other = standardSecurity({ ...LOCKED_PASSWORDS, userPassword: 'another' }, id);

    expect([one.owner.length, one.user.length, one.key.length]).toEqual([32, 32, 16]);
    expect(one.key.equals(again.key)).toBe(true);
    expect(one.key.equals(other.key)).toBe(false);
    expect(one.user.subarray(16).equals(Buffer.alloc(16))).toBe(true);
  });

  it('ciphers with RC4 as its published test vector says, and back', () => {
    const key = Buffer.from('Key', 'latin1');
    const ciphered = rc4(key, Buffer.from('Plaintext', 'latin1'));

    expect(ciphered.toString('hex')).toBe('bbf316e8d940af0ad3');
    expect(rc4(key, ciphered).toString('latin1')).toBe('Plaintext');
  });

  it('escapes what would end a literal string of a page', () => {
    expect(literal('a (b) c\\d')).toBe('(a \\(b\\) c\\\\d)');
  });
});
