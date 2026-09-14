import { describe, expect, it } from 'vitest';

import { ContractError, FRAME_KINDS, buildModel } from '../../../scripts/lib/contracts-model.mjs';

/** @param {Record<string, unknown>} schema */
function envelope(schema = {}) {
  return {
    source: 'envelope.schema.json',
    schema: {
      title: 'Envelope',
      type: 'object',
      required: ['v', 'kind', 'type'],
      properties: {
        v: { type: 'integer', const: 1 },
        kind: { type: 'string', enum: FRAME_KINDS },
        type: { type: 'string' },
        payload: { type: 'object' },
      },
      ...schema,
    },
  };
}

/** @param {Record<string, unknown>} schema */
function message(schema) {
  return { source: 'commands/thing.schema.json', schema };
}

describe('buildModel', () => {
  it('turns the envelope into an interface, required and optional apart', () => {
    const model = buildModel(envelope(), []);

    expect(model.envelope.name).toBe('Envelope');
    expect(model.envelope.fields.map((field) => [field.name, field.required])).toEqual([
      ['v', true],
      ['kind', true],
      ['type', true],
      ['payload', false],
    ]);
  });

  it('reads a const as a literal, which is what pins the protocol version', () => {
    const model = buildModel(envelope(), []);
    const version = model.envelope.fields.find((field) => field.name === 'v');

    expect(version?.type).toEqual({ kind: 'const', value: 1, of: 'integer' });
  });

  it('reads an object with no declared properties as an open map', () => {
    const model = buildModel(envelope(), []);
    const payload = model.envelope.fields.find((field) => field.name === 'payload');

    expect(payload?.type).toEqual({ kind: 'record' });
  });

  it('names a nested object after the property that holds it', () => {
    const model = buildModel(envelope(), [
      message({
        title: 'Thing',
        'x-kind': 'command',
        'x-type': 'thing.do',
        type: 'object',
        required: ['client'],
        properties: {
          client: {
            type: 'object',
            required: ['kind'],
            properties: { kind: { type: 'string' } },
          },
        },
      }),
    ]);

    expect(model.interfaces.map((declaration) => declaration.name)).toEqual([
      'ThingPayloadClient',
      'ThingPayload',
    ]);
  });

  it('declares a nested type before the interface that uses it', () => {
    const model = buildModel(envelope(), [
      message({
        title: 'Thing',
        'x-kind': 'event',
        'x-type': 'thing.happened',
        type: 'object',
        properties: { inner: { type: 'object', properties: { a: { type: 'string' } } } },
      }),
    ]);
    const names = model.interfaces.map((declaration) => declaration.name);

    expect(names.indexOf('ThingPayloadInner')).toBeLessThan(names.indexOf('ThingPayload'));
  });

  it('carries the frame kind and type onto the message', () => {
    const model = buildModel(envelope(), [
      message({
        title: 'ConnectionReady',
        'x-kind': 'ack',
        'x-type': 'connection.ready',
        type: 'object',
        properties: {},
      }),
    ]);

    expect(model.messages).toEqual([
      {
        name: 'ConnectionReady',
        frameKind: 'ack',
        frameType: 'connection.ready',
        description: '',
        payload: 'ConnectionReadyPayload',
      },
    ]);
  });

  it('reads an array of objects as a list of a named type', () => {
    const model = buildModel(envelope(), [
      message({
        title: 'Thing',
        'x-kind': 'error',
        'x-type': 'error',
        type: 'object',
        properties: {
          details: {
            type: 'array',
            items: { type: 'object', properties: { field: { type: 'string' } } },
          },
        },
      }),
    ]);
    const details = model.interfaces
      .find((declaration) => declaration.name === 'ThingPayload')
      ?.fields.find((field) => field.name === 'details');

    expect(details?.type).toEqual({
      kind: 'array',
      items: { kind: 'object', name: 'ThingPayloadDetailsItem' },
    });
  });

  it('refuses a kind the envelope does not allow, instead of generating it', () => {
    expect(() =>
      buildModel(envelope(), [
        message({ title: 'Thing', 'x-kind': 'telegram', 'x-type': 'thing', type: 'object' }),
      ]),
    ).toThrow(ContractError);
  });

  it('names the offending file and the allowed kinds when it refuses one', () => {
    const failure = (() => {
      try {
        buildModel(envelope(), [
          message({ title: 'Thing', 'x-kind': 'telegram', 'x-type': 'thing', type: 'object' }),
        ]);
        return null;
      } catch (error) {
        return /** @type {ContractError} */ (error);
      }
    })();

    expect(failure?.message).toContain('commands/thing.schema.json');
    expect(failure?.message).toContain('command, event, request, response, ack, error');
  });

  it('refuses a message with no x-type', () => {
    expect(() =>
      buildModel(envelope(), [message({ title: 'Thing', 'x-kind': 'command', type: 'object' })]),
    ).toThrow(/needs an `x-type`/);
  });

  it('refuses a message with no title, which is what every generated name comes from', () => {
    expect(() =>
      buildModel(envelope(), [
        message({ 'x-kind': 'command', 'x-type': 'thing.do', type: 'object' }),
      ]),
    ).toThrow(/needs a `title`/);
  });

  it('refuses two messages claiming the same frame type', () => {
    const duplicate = {
      'x-kind': 'command',
      'x-type': 'thing.do',
      type: 'object',
      properties: {},
    };

    expect(() =>
      buildModel(envelope(), [
        message({ title: 'One', ...duplicate }),
        message({ title: 'Two', ...duplicate }),
      ]),
    ).toThrow(/declared twice/);
  });

  it('refuses a keyword outside the supported subset, rather than quietly dropping it', () => {
    expect(() =>
      buildModel(envelope(), [
        message({
          title: 'Thing',
          'x-kind': 'command',
          'x-type': 'thing.do',
          type: 'object',
          properties: { token: { type: 'string', pattern: '^x' } },
        }),
      ]),
    ).toThrow(/pattern.*outside the supported/);
  });

  it('refuses a property with no type', () => {
    expect(() =>
      buildModel(envelope(), [
        message({
          title: 'Thing',
          'x-kind': 'command',
          'x-type': 'thing.do',
          type: 'object',
          properties: { token: { description: 'no type here' } },
        }),
      ]),
    ).toThrow(/declares no `type`/);
  });

  it('refuses an array with no items', () => {
    expect(() =>
      buildModel(envelope(), [
        message({
          title: 'Thing',
          'x-kind': 'command',
          'x-type': 'thing.do',
          type: 'object',
          properties: { list: { type: 'array' } },
        }),
      ]),
    ).toThrow(/without `items`/);
  });

  it('refuses a required field that is never declared', () => {
    expect(() =>
      buildModel(envelope(), [
        message({
          title: 'Thing',
          'x-kind': 'command',
          'x-type': 'thing.do',
          type: 'object',
          required: ['ghost'],
          properties: {},
        }),
      ]),
    ).toThrow(/`ghost` is required but never declared/);
  });

  it('refuses an unsupported type', () => {
    expect(() =>
      buildModel(envelope(), [
        message({
          title: 'Thing',
          'x-kind': 'command',
          'x-type': 'thing.do',
          type: 'object',
          properties: { amount: { type: 'number' } },
        }),
      ]),
    ).toThrow(/unsupported type `number`/);
  });

  it('builds nothing but the envelope when there are no messages', () => {
    const model = buildModel(envelope(), []);

    expect(model.messages).toEqual([]);
    expect(model.interfaces).toEqual([]);
  });
});
