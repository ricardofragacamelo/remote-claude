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
const SUPPORTED = new Set([
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'const',
  'x-required-when',
]);

/** The `kind` values the envelope allows; a message declaring anything else is rejected. */
export const FRAME_KINDS = ['command', 'event', 'request', 'response', 'ack', 'error'];

/**
 * Kinds that are **not** frames: a payload that travels over HTTP and is still one contract.
 *
 * Device registration is the case it exists for. The payload has to mean the same thing in three
 * languages, exactly like a frame does, but it never crosses a socket — so it gets its type and
 * its guard and no `frameType` entry, because a client offering to send `device.register` on the
 * WebSocket would be offering something the gateway has no handler for.
 */
export const PAYLOAD_KINDS = ['http'];

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
 * A field the contract requires only in a given case — `reason` when the decision is `deny`,
 * `seq` when the frame is an event.
 *
 * It lives in the schema rather than in each end's validation because a rule spread over three
 * languages is a rule that holds in two of them. See
 * docs/architecture/shared/05-websocket-protocol.md.
 *
 * @typedef {object} Conditional
 * @property {string} field the field that becomes required
 * @property {string} whenField the field that decides
 * @property {string | boolean} equals the value of `whenField` that makes `field` required
 * @property {string} because why the rule exists, carried into the generated comment
 */

/**
 * @typedef {object} Interface
 * @property {string} name
 * @property {string} description
 * @property {Field[]} fields
 * @property {Conditional[]} conditionals
 */

/**
 * @typedef {object} Message
 * @property {string} name e.g. `ConnectionAuthenticate`
 * @property {string} frameKind one of FRAME_KINDS, or one of PAYLOAD_KINDS
 * @property {string} frameType e.g. `connection.authenticate`
 * @property {boolean} frame whether it travels as a frame; false for a PAYLOAD_KINDS message
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
    return { kind: 'const', value: schema['const'], of: constKind(declared) };
  }

  if (schema['enum'] !== undefined) {
    return resolveEnum(source, name, schema['enum']);
  }

  const resolve = RESOLVERS.get(declared);
  if (resolve === undefined) {
    throw new ContractError(source, `\`${name}\` has unsupported type \`${declared}\``);
  }
  return resolve(source, name, schema, collected);
}

/**
 * The primitive a `const` is a value of; anything but an integer or a boolean is a string.
 *
 * @param {string} declared
 * @returns {ConstType['of']}
 */
function constKind(declared) {
  return declared === 'integer' || declared === 'boolean' ? declared : 'string';
}

/**
 * @param {string} source
 * @param {string} name
 * @param {unknown} values the schema's `enum`
 * @returns {EnumType}
 */
function resolveEnum(source, name, values) {
  if (!Array.isArray(values) || values.some((entry) => typeof entry !== 'string')) {
    throw new ContractError(source, `\`${name}\` has an enum that is not a list of strings`);
  }
  return { kind: 'enum', values: /** @type {string[]} */ (values) };
}

/**
 * Resolves a schema of one declared `type`, once `const` and `enum` are ruled out.
 *
 * @typedef {(source: string, name: string, schema: Record<string, unknown>, collected: Interface[]) => TypeRef} Resolver
 */

/**
 * An array, whose items resolve under the name of the array plus `Item`.
 *
 * @type {Resolver}
 */
function resolveArray(source, name, schema, collected) {
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

/**
 * An object, collected as a named interface — or an open map when it declares no properties.
 *
 * @type {Resolver}
 */
function resolveObject(source, name, schema, collected) {
  if (schema['properties'] === undefined) {
    // An object with no declared properties is an open map — `params` of an error, say.
    return { kind: 'record' };
  }
  collected.push(toInterface(source, name, schema, collected));
  return { kind: 'object', name };
}

/** @type {ReadonlyMap<string, Resolver>} */
const RESOLVERS = new Map([
  ['string', () => ({ kind: 'string' })],
  ['integer', () => ({ kind: 'integer' })],
  ['boolean', () => ({ kind: 'boolean' })],
  ['array', resolveArray],
  ['object', resolveObject],
]);

/**
 * Reads `x-required-when`, refusing a rule that could never fire.
 *
 * Three refusals, and each one is a rule that would look present and do nothing: a condition on
 * a field nobody declared, a condition that decides on a field nobody declared, and a condition
 * on a field that is already unconditionally required.
 *
 * @param {string} source
 * @param {string} name
 * @param {Record<string, unknown>} schema
 * @param {Set<string>} required
 * @param {Record<string, unknown>} properties
 * @returns {Conditional[]}
 */
function toConditionals(source, name, schema, required, properties) {
  const declared = schema['x-required-when'];

  if (declared === undefined) {
    return [];
  }

  if (!Array.isArray(declared)) {
    throw new ContractError(source, `\`x-required-when\` of \`${name}\` is not a list`);
  }

  return declared.map((entry) => {
    const rule = /** @type {Record<string, unknown>} */ (entry);
    const when = /** @type {Record<string, unknown>} */ (rule['when'] ?? {});

    const field = conditionalField(source, name, rule['field'], required, properties);
    const { whenField, equals } = conditionalTrigger(source, name, when, properties);
    const because = conditionalReason(source, name, rule['because']);

    return { field, whenField, equals, because };
  });
}

/**
 * The field an `x-required-when` rule makes required: declared, and not already required.
 *
 * @param {string} source
 * @param {string} name
 * @param {unknown} field
 * @param {Set<string>} required
 * @param {Record<string, unknown>} properties
 * @returns {string}
 */
function conditionalField(source, name, field, required, properties) {
  if (typeof field !== 'string' || properties[field] === undefined) {
    throw new ContractError(
      source,
      `\`x-required-when\` of \`${name}\` names \`${String(field)}\`, which is never declared`,
    );
  }
  if (required.has(field)) {
    throw new ContractError(
      source,
      `\`${field}\` of \`${name}\` is already required, so the condition can never fire`,
    );
  }
  return field;
}

/**
 * The `when` of an `x-required-when` rule: a declared field, compared with a string or a boolean.
 *
 * @param {string} source
 * @param {string} name
 * @param {Record<string, unknown>} when
 * @param {Record<string, unknown>} properties
 * @returns {Pick<Conditional, 'whenField' | 'equals'>}
 */
function conditionalTrigger(source, name, when, properties) {
  const whenField = when['field'];
  const equals = when['equals'];

  if (typeof whenField !== 'string' || properties[whenField] === undefined) {
    throw new ContractError(
      source,
      `\`x-required-when\` of \`${name}\` decides on \`${String(whenField)}\`, which is never declared`,
    );
  }
  if (typeof equals !== 'string' && typeof equals !== 'boolean') {
    throw new ContractError(
      source,
      `\`x-required-when\` of \`${name}\` compares \`${whenField}\` with something that is not a string or a boolean`,
    );
  }
  return { whenField, equals };
}

/**
 * The `because` of an `x-required-when` rule, which may not be missing or empty.
 *
 * @param {string} source
 * @param {string} name
 * @param {unknown} because
 * @returns {string}
 */
function conditionalReason(source, name, because) {
  if (typeof because !== 'string' || because === '') {
    throw new ContractError(
      source,
      `\`x-required-when\` of \`${name}\` has no \`because\` — a rule nobody can review is a rule nobody maintains`,
    );
  }
  return because;
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
    conditionals: toConditionals(source, name, schema, required, properties),
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
    const message = toMessage(source, schema);
    interfaces.push(toInterface(source, message.payload, schema, interfaces));
    built.push(message);
  }

  const duplicate = built.find(
    (message, index) => built.findIndex((other) => other.frameType === message.frameType) !== index,
  );
  if (duplicate !== undefined) {
    throw new ContractError(duplicate.name, `\`${duplicate.frameType}\` is declared twice`);
  }

  return { envelope: envelopeInterface, interfaces, messages: built };
}

/**
 * Reads what a message schema says about the message itself, refusing one that says too little.
 *
 * @param {string} source
 * @param {Record<string, unknown>} schema
 * @returns {Message}
 */
function toMessage(source, schema) {
  const title = schema['title'];
  const frameKind = schema['x-kind'];
  const frameType = schema['x-type'];

  if (typeof title !== 'string' || title === '') {
    throw new ContractError(source, 'a message schema needs a `title`');
  }
  if (typeof frameType !== 'string' || frameType === '') {
    throw new ContractError(source, 'a message schema needs an `x-type`');
  }
  if (
    typeof frameKind !== 'string' ||
    (!FRAME_KINDS.includes(frameKind) && !PAYLOAD_KINDS.includes(frameKind))
  ) {
    throw new ContractError(
      source,
      `\`x-kind\` is ${JSON.stringify(frameKind)}, which the envelope does not allow (${[...FRAME_KINDS, ...PAYLOAD_KINDS].join(', ')})`,
    );
  }

  return {
    name: title,
    frameKind,
    frameType,
    frame: FRAME_KINDS.includes(frameKind),
    description: String(schema['description'] ?? ''),
    payload: `${title}Payload`,
  };
}
