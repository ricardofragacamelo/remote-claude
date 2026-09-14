/**
 * Reading `packages/contracts/schema/` into the model the TypeScript and Dart emitters share.
 *
 * The schemas are the source of truth for the WebSocket protocol, and this is the only place
 * that interprets them. It accepts a deliberately small subset of JSON Schema — object, string,
 * integer, boolean, array, enum, const — and **refuses** anything outside it rather than
 * emitting something that silently means less than the schema says.
 */

/** Keywords a message schema may carry beyond the subset below. */
const METADATA = new Set(['$schema', '$id', 'title', 'description', 'x-kind', 'x-type']);

/** Keywords the subset understands. */
const SUPPORTED = new Set(['type', 'properties', 'required', 'items', 'enum', 'const']);

/** The `kind` values the envelope allows; a message declaring anything else is rejected. */
export const FRAME_KINDS = ['command', 'event', 'request', 'response', 'ack', 'error'];

/** A schema the generator cannot honour. Thrown rather than worked around. */
export class ContractError extends Error {
  /**
   * @param {string} source file the problem is in
   * @param {string} message
   */
  constructor(source, message) {
    super(`${source}: ${message}`);
    this.name = 'ContractError';
    this.source = source;
  }
}

/**
 * @typedef {{ kind: 'string' | 'integer' | 'boolean' | 'record' }} PrimitiveType
 * @typedef {{ kind: 'const', value: unknown, of: 'string' | 'integer' | 'boolean' }} ConstType
 * @typedef {{ kind: 'enum', values: string[] }} EnumType
 * @typedef {{ kind: 'object', name: string }} ObjectType
 * @typedef {{ kind: 'array', items: TypeRef }} ArrayType
 * @typedef {PrimitiveType | ConstType | EnumType | ObjectType | ArrayType} TypeRef
 */

/**
 * @typedef {object} Field
 * @property {string} name
 * @property {boolean} required
 * @property {string} description
 * @property {TypeRef} type
 */

/**
 * @typedef {object} Interface
 * @property {string} name
 * @property {string} description
 * @property {Field[]} fields
 */

/**
 * @typedef {object} Message
 * @property {string} name e.g. `ConnectionAuthenticate`
 * @property {string} frameKind one of FRAME_KINDS
 * @property {string} frameType e.g. `connection.authenticate`
 * @property {string} description
 * @property {string} payload name of the payload interface
 */

/**
 * @typedef {object} Model
 * @property {Interface} envelope
 * @property {Interface[]} interfaces every named object type, dependencies first
 * @property {Message[]} messages
 */

/** @param {string} text @returns {string} */
function pascalCase(text) {
  return text
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * @param {string} source
 * @param {Record<string, unknown>} schema
 */
function rejectUnknownKeywords(source, schema) {
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED.has(keyword) && !METADATA.has(keyword)) {
      throw new ContractError(source, `\`${keyword}\` is outside the supported JSON Schema subset`);
    }
  }
}

/**
 * Resolves one property schema to a type, collecting nested object types as named interfaces.
 *
 * @param {string} source
 * @param {string} name name to give a nested object
 * @param {Record<string, unknown>} schema
 * @param {Interface[]} collected
 * @returns {TypeRef}
 */
function resolveType(source, name, schema, collected) {
  rejectUnknownKeywords(source, schema);

  const declared = schema['type'];
  if (typeof declared !== 'string') {
    throw new ContractError(source, `\`${name}\` declares no \`type\``);
  }

  if (schema['const'] !== undefined) {
    const value = schema['const'];
    const of = declared === 'integer' ? 'integer' : declared === 'boolean' ? 'boolean' : 'string';
    return { kind: 'const', value, of };
  }

  if (schema['enum'] !== undefined) {
    const values = schema['enum'];
    if (!Array.isArray(values) || values.some((entry) => typeof entry !== 'string')) {
      throw new ContractError(source, `\`${name}\` has an enum that is not a list of strings`);
    }
    return { kind: 'enum', values: /** @type {string[]} */ (values) };
  }

  switch (declared) {
    case 'string':
    case 'integer':
    case 'boolean':
      return { kind: declared };

    case 'array': {
      const items = schema['items'];
      if (typeof items !== 'object' || items === null) {
        throw new ContractError(source, `\`${name}\` is an array without \`items\``);
      }
      return {
        kind: 'array',
        items: resolveType(
          source,
          `${name}Item`,
          /** @type {Record<string, unknown>} */ (items),
          collected,
        ),
      };
    }

    case 'object': {
      if (schema['properties'] === undefined) {
        // An object with no declared properties is an open map — `params` of an error, say.
        return { kind: 'record' };
      }
      collected.push(toInterface(source, name, schema, collected));
      return { kind: 'object', name };
    }

    default:
      throw new ContractError(source, `\`${name}\` has unsupported type \`${declared}\``);
  }
}

/**
 * @param {string} source
 * @param {string} name
 * @param {Record<string, unknown>} schema
 * @param {Interface[]} collected
 * @returns {Interface}
 */
function toInterface(source, name, schema, collected) {
  const properties = /** @type {Record<string, Record<string, unknown>>} */ (
    schema['properties'] ?? {}
  );
  const required = new Set(
    Array.isArray(schema['required']) ? /** @type {string[]} */ (schema['required']) : [],
  );

  for (const field of required) {
    if (properties[field] === undefined) {
      throw new ContractError(source, `\`${field}\` is required but never declared`);
    }
  }

  return {
    name,
    description: String(schema['description'] ?? ''),
    fields: Object.entries(properties).map(([field, property]) => ({
      name: field,
      required: required.has(field),
      description: String(property['description'] ?? ''),
      type: resolveType(source, `${name}${pascalCase(field)}`, property, collected),
    })),
  };
}

/**
 * @typedef {{ source: string, schema: Record<string, unknown> }} Document
 */

/**
 * Builds the model every emitter reads.
 *
 * @param {Document} envelope
 * @param {readonly Document[]} messages in a stable order — the generated files are committed,
 *   so the output has to depend only on the input, never on directory listing order
 * @returns {Model}
 */
export function buildModel(envelope, messages) {
  /** @type {Interface[]} */
  const interfaces = [];
  const envelopeInterface = toInterface(envelope.source, 'Envelope', envelope.schema, interfaces);

  /** @type {Message[]} */
  const built = [];

  for (const { source, schema } of messages) {
    const title = schema['title'];
    const frameKind = schema['x-kind'];
    const frameType = schema['x-type'];

    if (typeof title !== 'string' || title === '') {
      throw new ContractError(source, 'a message schema needs a `title`');
    }
    if (typeof frameType !== 'string' || frameType === '') {
      throw new ContractError(source, 'a message schema needs an `x-type`');
    }
    if (typeof frameKind !== 'string' || !FRAME_KINDS.includes(frameKind)) {
      throw new ContractError(
        source,
        `\`x-kind\` is ${JSON.stringify(frameKind)}, which the envelope does not allow (${FRAME_KINDS.join(', ')})`,
      );
    }

    const payload = `${title}Payload`;
    interfaces.push(toInterface(source, payload, schema, interfaces));

    built.push({
      name: title,
      frameKind,
      frameType,
      description: String(schema['description'] ?? ''),
      payload,
    });
  }

  const duplicate = built.find(
    (message, index) => built.findIndex((other) => other.frameType === message.frameType) !== index,
  );
  if (duplicate !== undefined) {
    throw new ContractError(duplicate.name, `\`${duplicate.frameType}\` is declared twice`);
  }

  return { envelope: envelopeInterface, interfaces, messages: built };
}
