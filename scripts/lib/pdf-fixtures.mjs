/**
 * The PDFs the reader of plan 21 is tested with — written by hand, byte by byte, so the same run
 * always gives the same bytes and nothing outside Node is needed (21 · D-03).
 *
 * A PDF is a list of numbered objects, a table of where each one starts, and a trailer naming the
 * catalogue. This module writes the three the suites need:
 *
 * - `reader.pdf`: 12 pages with known text, an outline three levels deep, links inside the document
 *   (a named destination and an explicit one) and out of it (`https`, `mailto`, `javascript:`,
 *   `file:`), and a last page with no text, as a scan has;
 * - `scripted.pdf`: a JavaScript action run on opening and a form field — what a preview must never
 *   run nor let be filled in;
 * - `locked.pdf`: the reader with a user password, under the standard security handler, revision 3
 *   (RC4, 128 bits). The cipher is written here too, from the algorithms of the PDF reference, with a
 *   fixed file id: `gs` would pick a random one, and the copy would never compare equal.
 *
 * Pure: it builds bytes and reads no disk; the entry point writes and compares them.
 */

import { createHash } from 'node:crypto';

/** @typedef {{ kind: 'name', value: string }} PdfName */
/** @typedef {{ kind: 'ref', number: number }} PdfRef */
/** @typedef {{ kind: 'string', value: string }} PdfString */
/** @typedef {{ kind: 'stream', dict: PdfDict, data: string }} PdfStream */
/** @typedef {{ [key: string]: PdfValue }} PdfDict */
/** @typedef {Array<PdfValue>} PdfArray */
/** @typedef {number | boolean | null | PdfName | PdfRef | PdfString | PdfStream | PdfArray | PdfDict} PdfValue */

/** @param {string} value @returns {PdfName} */
export const pdfName = (value) => ({ kind: 'name', value });

/** @param {number} number @returns {PdfRef} */
export const pdfRef = (number) => ({ kind: 'ref', number });

/** @param {string} value text in Latin-1 @returns {PdfString} */
export const pdfString = (value) => ({ kind: 'string', value });

/**
 * @param {PdfDict} dict what the stream says about itself, without its length
 * @param {string} data its bytes, in Latin-1
 * @returns {PdfStream}
 */
export const pdfStream = (dict, data) => ({ kind: 'stream', dict, data });

/**
 * The padding of the standard security handler — what a password shorter than 32 bytes is filled
 * with (PDF 1.7, 7.6.3.3, step a of algorithm 2).
 */
const PADDING = Buffer.from(
  '28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a',
  'hex',
);

/** What a reader of the locked copy may do: everything — the password only keeps it closed. */
const PERMISSIONS = -4;

/** @param {Buffer[]} parts */
function md5(...parts) {
  const hash = createHash('md5');
  for (const part of parts) {
    hash.update(part);
  }
  return hash.digest();
}

/**
 * RC4 — the cipher of revision 3. Node's OpenSSL keeps it in the legacy provider, which a build may
 * not load; it is a few lines, so it is written here.
 *
 * @param {Buffer} key
 * @param {Buffer} data
 * @returns {Buffer}
 */
export function rc4(key, data) {
  const state = Uint8Array.from({ length: 256 }, (_, index) => index);
  const at = (/** @type {number} */ index) => state[index] ?? 0;
  const swap = (/** @type {number} */ left, /** @type {number} */ right) => {
    const kept = at(left);
    state[left] = at(right);
    state[right] = kept;
  };
  let j = 0;

  for (let i = 0; i < 256; i += 1) {
    j = (j + at(i) + (key[i % key.length] ?? 0)) % 256;
    swap(i, j);
  }

  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;

  for (let index = 0; index < data.length; index += 1) {
    i = (i + 1) % 256;
    j = (j + at(i)) % 256;
    swap(i, j);
    out[index] = (data[index] ?? 0) ^ at((at(i) + at(j)) % 256);
  }

  return out;
}

/** A password padded, or cut, to the 32 bytes the handler works on. @param {string} password */
function padded(password) {
  return Buffer.concat([Buffer.from(password, 'latin1'), PADDING]).subarray(0, 32);
}

/** RC4 twenty times, the key changed each time — the last steps of algorithms 3 and 5. */
function twentyTimes(/** @type {Buffer} */ key, /** @type {Buffer} */ data) {
  let out = rc4(key, data);
  for (let round = 1; round <= 19; round += 1) {
    out = rc4(Buffer.from(key.map((byte) => byte ^ round)), out);
  }
  return out;
}

/** An MD5 hashed fifty more times — revision 3 of algorithms 2 and 3. @param {Buffer} first */
function rehashed(first) {
  let hash = first;
  for (let round = 0; round < 50; round += 1) {
    hash = md5(hash.subarray(0, 16));
  }
  return hash.subarray(0, 16);
}

/**
 * The entries of the encryption dictionary, and the key of the file — algorithms 2, 3 and 5 of the
 * PDF reference, revision 3, a 128-bit key.
 *
 * @param {{ userPassword: string, ownerPassword: string }} passwords
 * @param {Buffer} fileId the first part of the trailer's `/ID`
 * @returns {{ owner: Buffer, user: Buffer, key: Buffer }}
 */
export function standardSecurity({ userPassword, ownerPassword }, fileId) {
  const owner = twentyTimes(rehashed(md5(padded(ownerPassword))), padded(userPassword));
  const permissions = Buffer.alloc(4);
  permissions.writeInt32LE(PERMISSIONS);
  const key = rehashed(md5(padded(userPassword), owner, permissions, fileId));
  const user = Buffer.concat([twentyTimes(key, md5(PADDING, fileId)), Buffer.alloc(16)]);

  return { owner, user, key };
}

/** The key one object's strings and streams are ciphered with (algorithm 1). */
function objectKey(/** @type {Buffer} */ key, /** @type {number} */ number) {
  const salt = Buffer.from([number & 0xff, (number >> 8) & 0xff, (number >> 16) & 0xff, 0, 0]);
  return md5(key, salt).subarray(0, 16);
}

/** Escapes text for a literal string of a content stream. @param {string} value */
export function literal(value) {
  return `(${value.replace(/[\\()]/g, (character) => `\\${character}`)})`;
}

/**
 * One value, written — a string as hex, ciphered first when the object is.
 *
 * @param {PdfValue} value
 * @param {(bytes: Buffer) => Buffer} cipher
 * @returns {string}
 */
function written(value, cipher) {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((each) => written(each, cipher)).join(' ')}]`;
  }
  if (value.kind === 'name') {
    return `/${value.value}`;
  }
  if (value.kind === 'ref') {
    return `${value.number} 0 R`;
  }
  if (value.kind === 'string') {
    return `<${cipher(Buffer.from(value.value, 'latin1')).toString('hex')}>`;
  }
  const entries = Object.entries(value).map(([key, each]) => `/${key} ${written(each, cipher)}`);
  return `<< ${entries.join(' ')} >>`;
}

/**
 * An object's bytes: a value, or a stream with its length.
 *
 * @param {PdfValue} value
 * @param {(bytes: Buffer) => Buffer} cipher
 * @returns {Buffer}
 */
function body(value, cipher) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    if (value.kind === 'stream') {
      const data = cipher(Buffer.from(value.data, 'latin1'));
      const head = written({ ...value.dict, Length: data.length }, cipher);
      return Buffer.concat([
        Buffer.from(`${head}\nstream\n`, 'latin1'),
        data,
        Buffer.from('\nendstream', 'latin1'),
      ]);
    }
  }
  return Buffer.from(written(value, cipher), 'latin1');
}

/**
 * A whole PDF: the objects, numbered from 1 in the order given, the table of their offsets, and
 * the trailer — with an encryption dictionary as the last object, when `encryption` is given.
 *
 * @param {object} document
 * @param {PdfValue[]} document.objects
 * @param {number} document.root the number of the catalogue
 * @param {string} document.id what the file id is made from — the same id, the same bytes
 * @param {{ userPassword: string, ownerPassword: string }} [document.encryption]
 * @returns {Buffer}
 */
export function writePdf({ objects, root, id, encryption }) {
  const fileId = md5(Buffer.from(id, 'utf8'));
  const security = encryption === undefined ? null : standardSecurity(encryption, fileId);
  const all =
    security === null
      ? objects
      : [
          ...objects,
          {
            Filter: pdfName('Standard'),
            V: 2,
            R: 3,
            Length: 128,
            O: pdfString(security.owner.toString('latin1')),
            U: pdfString(security.user.toString('latin1')),
            P: PERMISSIONS,
          },
        ];
  const encryptNumber = security === null ? null : all.length;
  const chunks = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  /** @type {number[]} */
  const offsets = [];
  let length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

  all.forEach((value, index) => {
    const number = index + 1;
    // The encryption dictionary is never ciphered itself.
    const cipher =
      security === null || number === encryptNumber
        ? (/** @type {Buffer} */ bytes) => bytes
        : (/** @type {Buffer} */ bytes) => rc4(objectKey(security.key, number), bytes);
    const chunk = Buffer.concat([
      Buffer.from(`${number} 0 obj\n`, 'latin1'),
      body(value, cipher),
      Buffer.from('\nendobj\n', 'latin1'),
    ]);
    offsets.push(length);
    chunks.push(chunk);
    length += chunk.length;
  });

  const table = [
    'xref',
    `0 ${all.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
  ].join('\n');
  const trailer = {
    Size: all.length + 1,
    Root: pdfRef(root),
    ID: [pdfString(fileId.toString('latin1')), pdfString(fileId.toString('latin1'))],
    ...(encryptNumber === null ? {} : { Encrypt: pdfRef(encryptNumber) }),
  };
  chunks.push(
    Buffer.from(
      `${table}\ntrailer\n${written(/** @type {PdfValue} */ (trailer), (bytes) => bytes)}\nstartxref\n${length}\n%%EOF\n`,
      'latin1',
    ),
  );

  return Buffer.concat(chunks);
}

/** What one page of the reader says — the text a test finds, page by page. */
export const READER_PAGES = [
  ['Reader fixture', 'The links below go somewhere else.'],
  ['Chapter one', 'The lighthouse keeper starts the day.'],
  ['Section 1.1', 'Oil for the lamp is carried up the stairs.'],
  ['Page 4', 'Plain text of page four.'],
  ['Chapter two', 'A lighthouse stands on the coast.'],
  ['Page 6', 'Plain text of page six.'],
  ['Part two', 'At dusk the light goes out.'],
  ['Page 8', 'Plain text of page eight.'],
  ['Chapter three', 'Lighthouse at night, seen from the sea.'],
  ['Page 10', 'The explicit destination lands here.'],
  ['Appendix', 'Notes and sources.'],
  null,
];

/** The links of the first page: what each says, and where it goes. */
export const READER_LINKS = [
  { label: 'Go to chapter three', dest: 'chapter3' },
  { label: 'Go to page ten', page: 10 },
  { label: 'Open the web site', uri: 'https://example.com/reader' },
  { label: 'Write to the author', uri: 'mailto:author@example.com' },
  { label: 'Run a script', uri: 'javascript:alert(1)' },
  { label: 'Open a local file', uri: 'file:///etc/passwd' },
];

/** The outline: title, page, and the entries under it. */
export const READER_OUTLINE = [
  {
    title: 'Part one',
    page: 1,
    children: [
      { title: 'Chapter one', page: 2, children: [{ title: 'Section 1.1', page: 3 }] },
      { title: 'Chapter two', page: 5 },
    ],
  },
  { title: 'Part two', page: 7, children: [{ title: 'Chapter three', page: 9 }] },
  { title: 'Appendix', page: 11 },
];

/** The passwords of the locked copy. */
export const LOCKED_PASSWORDS = { userPassword: 'reader-secret', ownerPassword: 'owner-secret' };

/** Letter, in points. */
const PAGE_BOX = [0, 0, 612, 792];

/**
 * A page of letter size in the standard Helvetica, its content in object `contents`.
 *
 * @param {number} contents
 * @param {PdfDict} [extra] what else the page says — its annotations
 * @returns {PdfDict}
 */
function aPage(contents, extra = {}) {
  return {
    Type: pdfName('Page'),
    Parent: pdfRef(2),
    MediaBox: PAGE_BOX,
    Resources: { Font: { F1: pdfRef(3) } },
    Contents: pdfRef(contents),
    ...extra,
  };
}

/** Where the first link sits, and how far apart they are. */
const LINK_TOP = 640;
const LINK_STEP = 30;

/** The content of a page: its heading and its line — or, with none, a grey block, as a scan. */
function pageContent(/** @type {readonly string[] | null} */ text, /** @type {boolean} */ links) {
  if (text === null) {
    return '0.85 g 72 72 468 648 re f\n';
  }
  const [heading = '', line = ''] = text;
  const lines = [
    `BT /F1 28 Tf 72 720 Td ${literal(heading)} Tj ET`,
    `BT /F1 14 Tf 72 690 Td ${literal(line)} Tj ET`,
  ];
  if (links) {
    READER_LINKS.forEach((link, index) => {
      lines.push(`BT /F1 14 Tf 72 ${LINK_TOP - index * LINK_STEP} Td ${literal(link.label)} Tj ET`);
    });
  }
  return `${lines.join('\n')}\n`;
}

/**
 * The objects of an outline, appended to `objects`, under `parent` — numbered as they are made.
 *
 * @param {PdfValue[]} objects
 * @param {readonly { title: string, page: number, children?: readonly unknown[] }[]} entries
 * @param {number} parent
 * @param {(page: number) => number} pageNumber the object number of a page
 * @returns {number[]} the numbers of the entries made at this level
 */
function outlineObjects(objects, entries, parent, pageNumber) {
  const numbers = entries.map(() => {
    objects.push({});
    return objects.length;
  });

  const numberAt = (/** @type {readonly number[]} */ list, /** @type {number} */ index) =>
    list[index] ?? 0;

  entries.forEach((entry, index) => {
    const children = /** @type {typeof entries} */ (entry.children ?? []);
    const own = numberAt(numbers, index);
    const below = outlineObjects(objects, children, own, pageNumber);
    /** @type {Record<string, PdfValue>} */
    const item = {
      Title: pdfString(entry.title),
      Parent: pdfRef(parent),
      Dest: [pdfRef(pageNumber(entry.page)), pdfName('XYZ'), 0, 792, null],
    };
    if (index > 0) item['Prev'] = pdfRef(numberAt(numbers, index - 1));
    if (index < numbers.length - 1) item['Next'] = pdfRef(numberAt(numbers, index + 1));
    if (below.length > 0) {
      item['First'] = pdfRef(numberAt(below, 0));
      item['Last'] = pdfRef(numberAt(below, below.length - 1));
      // Negative: the entry starts closed — only the first level shows.
      item['Count'] = -below.length;
    }
    objects[own - 1] = item;
  });

  return numbers;
}

/** The link annotations of the first page. @param {(page: number) => number} pageNumber */
function linkAnnotations(pageNumber) {
  return READER_LINKS.map((link, index) => {
    const bottom = LINK_TOP - index * LINK_STEP - 4;
    /** @type {Record<string, PdfValue>} */
    const annotation = {
      Type: pdfName('Annot'),
      Subtype: pdfName('Link'),
      Rect: [70, bottom, 320, bottom + 20],
      Border: [0, 0, 0],
    };
    if (link.dest !== undefined) annotation['Dest'] = pdfString(link.dest);
    if (link.page !== undefined)
      annotation['Dest'] = [pdfRef(pageNumber(link.page)), pdfName('Fit')];
    if (link.uri !== undefined) {
      annotation['A'] = { S: pdfName('URI'), URI: pdfString(link.uri) };
    }
    return annotation;
  });
}

/**
 * The reader: catalogue 1, pages 2, font 3, then per page its object and its content, then the
 * links, then the outline.
 *
 * @param {{ encryption?: { userPassword: string, ownerPassword: string } }} [options]
 */
export function readerPdf(options = {}) {
  const pageNumber = (/** @type {number} */ page) => 4 + (page - 1) * 2;
  /** @type {PdfValue[]} */
  const objects = [
    null,
    null,
    { Type: pdfName('Font'), Subtype: pdfName('Type1'), BaseFont: pdfName('Helvetica') },
  ];
  const linksAt = 4 + READER_PAGES.length * 2;
  const links = linkAnnotations(pageNumber);

  READER_PAGES.forEach((text, index) => {
    objects.push(
      aPage(
        pageNumber(index + 1) + 1,
        index === 0 ? { Annots: links.map((_, at) => pdfRef(linksAt + at)) } : {},
      ),
    );
    objects.push(pdfStream({}, pageContent(text, index === 0)));
  });
  objects.push(...links);

  objects.push({});
  const outlines = objects.length;
  const top = outlineObjects(objects, READER_OUTLINE, outlines, pageNumber);
  objects[outlines - 1] = {
    Type: pdfName('Outlines'),
    First: pdfRef(top[0] ?? 0),
    Last: pdfRef(top.at(-1) ?? 0),
    Count: top.length,
  };

  objects[0] = {
    Type: pdfName('Catalog'),
    Pages: pdfRef(2),
    Outlines: pdfRef(outlines),
    PageMode: pdfName('UseOutlines'),
    Names: {
      Dests: {
        Names: [pdfString('chapter3'), [pdfRef(pageNumber(9)), pdfName('XYZ'), 0, 792, null]],
      },
    },
  };
  objects[1] = {
    Type: pdfName('Pages'),
    Kids: READER_PAGES.map((_, index) => pdfRef(pageNumber(index + 1))),
    Count: READER_PAGES.length,
  };

  return writePdf({ objects, root: 1, id: 'reader.pdf', ...options });
}

/** The text of the page of the scripted PDF. */
export const SCRIPTED_TEXT = 'A form and a script that must not run.';

/** The script the scripted PDF runs on opening — in a viewer that runs scripts. */
export const SCRIPTED_JS = "app.alert('the script ran');";

/** One page with a JavaScript action run on opening, and a text field. */
export function scriptedPdf() {
  const helvetica = {
    Type: pdfName('Font'),
    Subtype: pdfName('Type1'),
    BaseFont: pdfName('Helvetica'),
  };
  /** @type {PdfValue[]} */
  const objects = [
    {
      Type: pdfName('Catalog'),
      Pages: pdfRef(2),
      OpenAction: { S: pdfName('JavaScript'), JS: pdfString(SCRIPTED_JS) },
      AcroForm: {
        Fields: [pdfRef(6)],
        DA: pdfString('/Helv 0 Tf 0 g'),
        DR: { Font: { Helv: pdfRef(3) } },
      },
    },
    { Type: pdfName('Pages'), Kids: [pdfRef(4)], Count: 1 },
    helvetica,
    aPage(5, { Annots: [pdfRef(6)] }),
    pdfStream({}, `BT /F1 14 Tf 72 720 Td ${literal(SCRIPTED_TEXT)} Tj ET\n`),
    {
      Type: pdfName('Annot'),
      Subtype: pdfName('Widget'),
      FT: pdfName('Tx'),
      T: pdfString('name'),
      V: pdfString('filled in'),
      Rect: [72, 640, 320, 670],
      P: pdfRef(4),
      F: 4,
      DA: pdfString('/Helv 12 Tf 0 g'),
      AA: { K: { S: pdfName('JavaScript'), JS: pdfString(SCRIPTED_JS) } },
    },
  ];

  return writePdf({ objects, root: 1, id: 'scripted.pdf' });
}

/** Every fixture, by the name of its file. @returns {Record<string, Buffer>} */
export function pdfFixtures() {
  return {
    'reader.pdf': readerPdf(),
    'scripted.pdf': scriptedPdf(),
    'locked.pdf': readerPdf({ encryption: LOCKED_PASSWORDS }),
  };
}

/**
 * The fixtures that differ from what is on disk — missing, or not the same bytes.
 *
 * @param {Record<string, Buffer>} expected
 * @param {(name: string) => Buffer | null} read what is on disk, `null` when nothing is
 * @returns {string[]}
 */
export function divergentFixtures(expected, read) {
  return Object.entries(expected)
    .filter(([name, bytes]) => {
      const actual = read(name);
      return actual === null || !actual.equals(bytes);
    })
    .map(([name]) => name);
}
