import { describe, expect, it } from 'vitest';

import { emitDart } from '../../../scripts/lib/contracts-dart.mjs';
import { buildModel } from '../../../scripts/lib/contracts-model.mjs';
import { emitTypeScript } from '../../../scripts/lib/contracts-typescript.mjs';

const envelope = {
  source: 'envelope.schema.json',
  schema: {
    title: 'Envelope',
    type: 'object',
    required: ['v', 'kind', 'type'],
    properties: {
      v: { type: 'integer', const: 1 },
      kind: { type: 'string', enum: ['command', 'ack'] },
      type: { type: 'string' },
      seq: { type: 'integer' },
      payload: { type: 'object' },
    },
  },
};

const command = {
  source: 'commands/thing.schema.json',
  schema: {
    title: 'Thing',
    description: 'Does the thing.',
    'x-kind': 'command',
    'x-type': 'thing.do',
    type: 'object',
    required: ['token', 'client'],
    properties: {
      token: { type: 'string' },
      locale: { type: 'string', enum: ['en', 'pt-BR'] },
      client: {
        type: 'object',
        required: ['kind'],
        properties: { kind: { type: 'string' }, version: { type: 'string' } },
      },
      tags: { type: 'array', items: { type: 'string' } },
    },
  },
};

const model = buildModel(envelope, [command]);
const typescript = emitTypeScript(model);
const dart = emitDart(model);

describe('emitTypeScript', () => {
  it('says it is generated, and how to regenerate it', () => {
    expect(typescript).toContain('Do not edit');
    expect(typescript).toContain('pnpm contracts:generate');
  });

  it('maps a const to a literal type and an enum to a union', () => {
    expect(typescript).toContain('readonly v: 1;');
    expect(typescript).toContain("readonly locale?: 'en' | 'pt-BR';");
  });

  it('marks an optional field optional and a required one not', () => {
    expect(typescript).toContain('readonly token: string;');
    expect(typescript).toContain('readonly seq?: number;');
  });

  it('maps an object with no properties to an open record, keeping unknown payloads readable', () => {
    expect(typescript).toContain('readonly payload?: Readonly<Record<string, unknown>>;');
  });

  it('maps an array to a readonly array of the item type', () => {
    expect(typescript).toContain('readonly tags?: readonly string[];');
  });

  it('gives the frame the literal kind and type, so a switch narrows on them', () => {
    expect(typescript).toContain("readonly kind: 'command';");
    expect(typescript).toContain("readonly type: 'thing.do';");
  });

  it('checks the const in the guard — the version is a real compatibility check', () => {
    expect(typescript).toContain("record['v'] !== 1");
  });

  it('does not check enum membership in the guard, so a future value is not rejected', () => {
    // A closed check here would make every added locale or kind a breaking change for clients
    // already published — see docs/architecture/shared/05-websocket-protocol.md.
    expect(typescript).not.toContain("'pt-BR' ||");
    // `kind` is a required enum: the guard checks that it is a string, never which string.
    expect(typescript).toContain("typeof record['kind'] !== 'string'");
    expect(typescript).not.toContain("record['kind'] !== 'command'");
  });

  it('does not check optional fields in the guard', () => {
    const guard = /export function isThingPayload\(.*?\n}/s.exec(typescript)?.[0] ?? '';

    expect(guard).toContain("record['token']");
    expect(guard).not.toContain("record['tags']");
  });

  it('lists every frame type it generated', () => {
    expect(typescript).toContain("'thing.do',");
  });
});

describe('emitDart', () => {
  it('says it is generated, and how to regenerate it', () => {
    expect(dart).toContain('Do not edit');
    expect(dart).toContain('pnpm contracts:generate');
  });

  it('declares an immutable class with a const constructor', () => {
    expect(dart).toContain('class ThingPayload {');
    expect(dart).toContain('const ThingPayload({');
  });

  it('makes a required field required and an optional one nullable', () => {
    expect(dart).toContain('required this.token,');
    expect(dart).toContain('final String? locale;');
  });

  it('keeps an enum as a String, so a value added after release does not throw', () => {
    expect(dart).toContain('final String? locale;');
    expect(dart).not.toContain('enum ');
  });

  it('reads a nested object through its own fromJson', () => {
    expect(dart).toContain("ThingPayloadClient.fromJson(json['client']! as Map<String, Object?>)");
  });

  it('reads a list without dynamic anywhere', () => {
    expect(dart).toContain("(json['tags']! as List<Object?>)");
    expect(dart).not.toContain('dynamic');
  });

  it('leaves an absent optional field out of toJson instead of writing null', () => {
    expect(dart).toContain('if (locale != null) {');
  });

  it('exposes the kind and type of every frame as constants', () => {
    expect(dart).toContain("const String thingKind = 'command';");
    expect(dart).toContain("const String thingType = 'thing.do';");
  });
});

describe('both emitters', () => {
  it('are pure — the same model twice produces byte-identical output', () => {
    const again = buildModel(envelope, [command]);

    expect(emitTypeScript(again)).toBe(typescript);
    expect(emitDart(again)).toBe(dart);
  });

  it('cover the same set of frame types', () => {
    for (const message of model.messages) {
      expect(typescript).toContain(`'${message.frameType}'`);
      expect(dart).toContain(`'${message.frameType}'`);
    }
  });

  it('end with exactly one newline', () => {
    expect(typescript.endsWith('\n')).toBe(true);
    expect(typescript.endsWith('\n\n')).toBe(false);
    expect(dart.endsWith('\n')).toBe(true);
    expect(dart.endsWith('\n\n')).toBe(false);
  });
});

/**
 * A second command, written to reach the shapes the first one does not: an **optional** nested
 * object, an optional array of objects, a free-form record, and a numeric `const`.
 *
 * They are all shapes the real contract already uses or will use — an optional `details[]` on
 * the error frame, a numeric protocol version — and each one emits differently in both
 * languages. A shape nobody generated is a shape nobody knows generates correctly.
 */
const optionals = {
  source: 'events/optional.schema.json',
  schema: {
    title: 'Optional',
    'x-kind': 'event',
    'x-type': 'optional.happened',
    type: 'object',
    required: ['status', 'ok', 'meta', 'tags'],
    properties: {
      status: { type: 'integer', const: 413 },
      ok: { type: 'boolean' },
      meta: { type: 'object' },
      tags: { type: 'array', items: { type: 'string' } },
      client: {
        type: 'object',
        required: ['kind'],
        properties: { kind: { type: 'string' } },
      },
      details: {
        type: 'array',
        items: {
          type: 'object',
          required: ['field'],
          properties: { field: { type: 'string' } },
        },
      },
      labels: { type: 'array', items: { type: 'string' } },
      params: { type: 'object' },
    },
  },
};

const optionalModel = buildModel(envelope, [optionals]);
const optionalTypeScript = emitTypeScript(optionalModel);
const optionalDart = emitDart(optionalModel);

describe('the shapes an optional field takes', () => {
  it('reads an optional nested object only when it is there — Dart', () => {
    expect(optionalDart).toContain(
      "json['client'] == null ? null : OptionalPayloadClient.fromJson",
    );
  });

  it('reads an optional array of objects only when it is there — Dart', () => {
    expect(optionalDart).toContain("json['details'] == null ? null :");
    expect(optionalDart).toContain('.map((item) => OptionalPayloadDetailsItem.fromJson');
  });

  it('reads an optional array of scalars the same way — Dart', () => {
    expect(optionalDart).toContain("json['labels'] == null ? null :");
    expect(optionalDart).toContain('item! as String');
  });

  it('writes an optional nested object through the null-aware call — Dart', () => {
    expect(optionalDart).toContain('client?.toJson()');
    expect(optionalDart).toContain('details?.map((item) => item.toJson())');
  });

  it('gives a numeric const the numeric type, not the string one — Dart', () => {
    expect(optionalDart).toContain('final int status;');
    expect(optionalDart).toContain("json['status']! as int");
  });

  it('gives a numeric const the numeric literal type — TypeScript', () => {
    expect(optionalTypeScript).toContain('readonly status: 413;');
  });

  it('checks a numeric const by value in the guard — TypeScript', () => {
    expect(optionalTypeScript).toContain('!== 413');
  });

  it('guards every required shape, not only the ones with a scalar type', () => {
    expect(optionalTypeScript).toContain("typeof record['ok'] !== 'boolean'");
    expect(optionalTypeScript).toContain("typeof record['meta'] !== 'object'");
    expect(optionalTypeScript).toContain("!Array.isArray(record['tags'])");
  });

  it('types a free-form record as a map in both languages', () => {
    expect(optionalDart).toContain('Map<String, Object?>? params');
    expect(optionalTypeScript).toContain('Readonly<Record<string, unknown>>');
  });

  it('types an array of objects as a list of them in both languages', () => {
    expect(optionalDart).toContain('List<OptionalPayloadDetailsItem>? details');
    expect(optionalTypeScript).toContain(
      'readonly details?: readonly OptionalPayloadDetailsItem[];',
    );
  });
});
