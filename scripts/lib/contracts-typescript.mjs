/**
 * Emits the TypeScript half of `packages/contracts` from the shared model.
 *
 * The guards check the **shape** of required fields, and the `const` values that carry
 * compatibility meaning — `v: 1`. They deliberately do not check enum membership, and they
 * ignore unknown fields: a client must accept a frame carrying something it has never heard of,
 * or no event could ever be added without breaking an app already published to a store
 * (docs/architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos).
 */

import { BANNER, docComment as comment } from './contracts-emit.mjs';
/**
 * @param {import('./contracts-model.mjs').TypeRef} type
 * @returns {string}
 */
function typeExpression(type) {
  switch (type.kind) {
    case 'string':
      return 'string';
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'record':
      return 'Readonly<Record<string, unknown>>';
    case 'const':
      return typeof type.value === 'string' ? `'${type.value}'` : String(type.value);
    case 'enum':
      return type.values.map((value) => `'${value}'`).join(' | ');
    case 'array':
      return `readonly ${typeExpression(type.items)}[]`;
    case 'object':
      return type.name;
  }
}

/**
 * @param {import('./contracts-model.mjs').Interface} declaration
 * @returns {string}
 */
function emitInterface(declaration) {
  const lines = [
    ...comment(declaration.description, '', 'block'),
    `export interface ${declaration.name} {`,
  ];

  for (const field of declaration.fields) {
    lines.push(...comment(field.description, '  ', 'block'));
    lines.push(
      `  readonly ${field.name}${field.required ? '' : '?'}: ${typeExpression(field.type)};`,
    );
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * The runtime check for one field of a guard, or null when the field carries no checkable shape.
 *
 * @param {import('./contracts-model.mjs').Field} field
 * @returns {string | null}
 */
function fieldCheck(field) {
  const access = `record['${field.name}']`;

  switch (field.type.kind) {
    case 'string':
    case 'enum':
      return `typeof ${access} !== 'string'`;
    case 'integer':
      return `typeof ${access} !== 'number'`;
    case 'boolean':
      return `typeof ${access} !== 'boolean'`;
    case 'const':
      return `${access} !== ${typeof field.type.value === 'string' ? `'${String(field.type.value)}'` : String(field.type.value)}`;
    case 'record':
      return `typeof ${access} !== 'object' || ${access} === null`;
    case 'array':
      return `!Array.isArray(${access})`;
    case 'object':
      return `!is${field.type.name}(${access})`;
  }
}

/**
 * @param {import('./contracts-model.mjs').Interface} declaration
 * @returns {string}
 */
function emitGuard(declaration) {
  const checks = declaration.fields
    .filter((field) => field.required)
    .map((field) => fieldCheck(field))
    .filter((check) => check !== null);

  const lines = [
    `/** Whether \`value\` carries every required field of {@link ${declaration.name}}. Unknown fields are accepted. */`,
    `export function is${declaration.name}(value: unknown): value is ${declaration.name} {`,
    `  if (typeof value !== 'object' || value === null) {`,
    '    return false;',
    '  }',
    '',
    '  const record = value as Readonly<Record<string, unknown>>;',
    '',
    ...(checks.length === 0
      ? ['  return true;']
      : [
          '  return !(',
          ...checks.map(
            (check, index) => `    ${check}${index === checks.length - 1 ? '' : ' ||'}`,
          ),
          '  );',
        ]),
    '}',
  ];

  return lines.join('\n');
}

/**
 * @param {import('./contracts-model.mjs').Message} message
 * @returns {string}
 */
function emitFrame(message) {
  // `Omit` rather than a plain `extends`: the envelope declares `payload` as an open record, and
  // a subtype may not narrow an inherited property to something incompatible with it.
  return [
    ...comment(message.description, '', 'block'),
    `export interface ${message.name}Frame extends Omit<Envelope, 'kind' | 'type' | 'payload'> {`,
    `  readonly kind: '${message.frameKind}';`,
    `  readonly type: '${message.frameType}';`,
    `  readonly payload: ${message.payload};`,
    '}',
    '',
    `/** Whether \`value\` is a {@link ${message.name}Frame}. */`,
    `export function is${message.name}Frame(value: unknown): value is ${message.name}Frame {`,
    '  if (!isEnvelope(value)) {',
    '    return false;',
    '  }',
    '',
    '  return (',
    `    value.kind === '${message.frameKind}' &&`,
    `    value.type === '${message.frameType}' &&`,
    `    is${message.payload}(value.payload)`,
    '  );',
    '}',
  ].join('\n');
}

/**
 * The whole generated TypeScript file.
 *
 * @param {import('./contracts-model.mjs').Model} model
 * @returns {string}
 */
export function emitTypeScript(model) {
  const declarations = [model.envelope, ...model.interfaces];

  const blocks = [
    BANNER,
    '',
    `/** The protocol version this build speaks. */`,
    `export const PROTOCOL_VERSION = 1;`,
    '',
    `/** Every \`type\` the generated frames cover, for exhaustiveness at the call site. */`,
    `export const FRAME_TYPES = [`,
    ...model.messages.map((message) => `  '${message.frameType}',`),
    `] as const;`,
    '',
    ...declarations.flatMap((declaration) => [emitInterface(declaration), '']),
    ...declarations.flatMap((declaration) => [emitGuard(declaration), '']),
    ...model.messages.flatMap((message) => [emitFrame(message), '']),
  ];

  return `${blocks.join('\n').trimEnd()}\n`;
}
