/**
 * Emits the Dart half of the contract, into `mobile/lib/core/network/contracts/`.
 *
 * Flutter is outside the pnpm workspace, so the mobile app cannot import the TypeScript package
 * — parity comes from generating both halves from the same schema, and from `pnpm
 * contracts:check` failing when either drifts. Nothing in TypeScript imports the Dart, so that
 * check is the only thing standing between a schema change and a runtime break on a published
 * app (risk R-04 of the bootstrap plan).
 *
 * Enums arrive as `String`, not as a Dart `enum`: an app already on a store has to survive a
 * value added after it shipped, and a closed enum would throw on it.
 */

import { BANNER, docComment as comment } from './contracts-emit.mjs';
/**
 * @param {import('./contracts-model.mjs').TypeRef} type
 * @returns {string}
 */
function typeExpression(type) {
  switch (type.kind) {
    case 'string':
    case 'enum':
      return 'String';
    case 'integer':
      return 'int';
    case 'boolean':
      return 'bool';
    case 'record':
      return 'Map<String, Object?>';
    case 'const':
      return typeof type.value === 'string' ? 'String' : 'int';
    case 'array':
      return `List<${typeExpression(type.items)}>`;
    case 'object':
      return type.name;
  }
}

/**
 * Expression that reads one field out of a decoded JSON map.
 *
 * @param {import('./contracts-model.mjs').Field} field
 * @returns {string}
 */
function readExpression(field) {
  const raw = `json['${field.name}']`;
  const dart = typeExpression(field.type);

  if (field.type.kind === 'object') {
    return field.required
      ? `${dart}.fromJson(${raw}! as Map<String, Object?>)`
      : `${raw} == null ? null : ${dart}.fromJson(${raw}! as Map<String, Object?>)`;
  }

  if (field.type.kind === 'array') {
    const items = field.type.items;
    const element =
      items.kind === 'object'
        ? `${typeExpression(items)}.fromJson(item! as Map<String, Object?>)`
        : `item! as ${typeExpression(items)}`;
    const mapped = `(${raw}! as List<Object?>).map((item) => ${element}).toList(growable: false)`;

    return field.required ? mapped : `${raw} == null ? null : ${mapped}`;
  }

  return field.required ? `${raw}! as ${dart}` : `${raw} as ${dart}?`;
}

/**
 * @param {import('./contracts-model.mjs').Field} field
 * @returns {string}
 */
function writeExpression(field) {
  if (field.type.kind === 'object') {
    return field.required ? `${field.name}.toJson()` : `${field.name}?.toJson()`;
  }

  if (field.type.kind === 'array' && field.type.items.kind === 'object') {
    const mapped = `.map((item) => item.toJson()).toList(growable: false)`;
    return field.required ? `${field.name}${mapped}` : `${field.name}?${mapped}`;
  }

  return field.name;
}

/**
 * Whether a decoded value fails to have the shape a field declares.
 *
 * Reads as a refusal rather than an assertion because that is how it is used: the generated
 * predicate answers `false` on the first rule that does not hold.
 *
 * @param {import('./contracts-model.mjs').TypeRef} type
 * @returns {string}
 */
function shapeRefusal(type) {
  switch (type.kind) {
    case 'string':
    case 'enum':
      return 'is! String';
    case 'integer':
      return 'is! int';
    case 'boolean':
      return 'is! bool';
    case 'const':
      return typeof type.value === 'string' ? 'is! String' : 'is! int';
    case 'array':
      return 'is! List<Object?>';
    case 'object':
    case 'record':
      return 'is! Map<String, Object?>';
  }
}

/**
 * The conditional requirements of one declaration, as a predicate over a decoded map.
 *
 * Dart gets a predicate where TypeScript gets a type guard, because that is the shape each
 * language already uses — but both are generated from the same `x-required-when`, which is the
 * point: a rule written once cannot hold on one end and not on the other.
 *
 * @param {import('./contracts-model.mjs').Interface} declaration
 * @returns {string[]} empty when the declaration has no conditional requirement
 */
function emitConditionals(declaration) {
  if (declaration.conditionals.length === 0) {
    return [];
  }

  const name = `${camelCase(declaration.name)}ConditionalsHold`;

  const lines = [
    `/// Whether [json] satisfies the conditional requirements of [${declaration.name}].`,
    '///',
  ];

  for (const conditional of declaration.conditionals) {
    lines.push(
      `/// \`${conditional.field}\` is also required when \`${conditional.whenField}\` is`,
      `/// \`${String(conditional.equals)}\` — ${conditional.because}.`,
    );
  }

  lines.push(`bool ${name}(Map<String, Object?> json) {`);

  for (const conditional of declaration.conditionals) {
    // Known to exist: `buildModel` refuses a rule naming a field nobody declared.
    const field = /** @type {import('./contracts-model.mjs').Field} */ (
      declaration.fields.find((candidate) => candidate.name === conditional.field)
    );
    const refusal = shapeRefusal(field.type);
    const expected =
      typeof conditional.equals === 'string'
        ? `'${conditional.equals}'`
        : String(conditional.equals);

    lines.push(
      `  if (json['${conditional.whenField}'] == ${expected} && json['${conditional.field}'] ${refusal}) {`,
      '    return false;',
      '  }',
      '',
    );
  }

  lines.push('  return true;', '}');

  return [lines.join('\n'), ''];
}

/**
 * @param {import('./contracts-model.mjs').Interface} declaration
 * @returns {string}
 */
function emitClass(declaration) {
  const parameters = declaration.fields.map(
    (field) => `    ${field.required ? 'required ' : ''}this.${field.name},`,
  );

  const lines = [
    ...comment(declaration.description, '', 'line'),
    `class ${declaration.name} {`,
    `  const ${declaration.name}({`,
    ...parameters,
    '  });',
    '',
    `  /// Reads a decoded JSON map. Unknown keys are ignored, never rejected.`,
    `  factory ${declaration.name}.fromJson(Map<String, Object?> json) => ${declaration.name}(`,
    ...declaration.fields.map((field) => `        ${field.name}: ${readExpression(field)},`),
    '      );',
    '',
  ];

  for (const field of declaration.fields) {
    lines.push(...comment(field.description, '  ', 'line'));
    lines.push(`  final ${typeExpression(field.type)}${field.required ? '' : '?'} ${field.name};`);
    lines.push('');
  }

  lines.push('  /// A JSON map with the absent optional fields left out.');
  lines.push('  Map<String, Object?> toJson() {');
  lines.push('    final Map<String, Object?> json = <String, Object?>{');
  for (const field of declaration.fields.filter((candidate) => candidate.required)) {
    lines.push(`      '${field.name}': ${writeExpression(field)},`);
  }
  lines.push('    };');

  for (const field of declaration.fields.filter((candidate) => !candidate.required)) {
    lines.push('');
    lines.push(`    if (${field.name} != null) {`);
    lines.push(`      json['${field.name}'] = ${writeExpression(field)};`);
    lines.push('    }');
  }

  lines.push('');
  lines.push('    return json;');
  lines.push('  }');
  lines.push('}');

  return lines.join('\n');
}

/**
 * The whole generated Dart file.
 *
 * @param {import('./contracts-model.mjs').Model} model
 * @returns {string}
 */
export function emitDart(model) {
  // A payload-only contract has a class and no frame constants: see PAYLOAD_KINDS.
  const frames = model.messages.filter((message) => message.frame);

  const blocks = [
    BANNER,
    '',
    // `dart format` and this emitter disagree about how to indent an initialiser list, and both
    // are right by their own rules. Rather than let them rewrite each other — a formatting run
    // would put `contracts:check` out of sync, and regenerating would put `format:check` out of
    // sync — the formatter is told to leave generated territory alone. The analyzer already
    // excludes it, for the same reason.
    '// dart format off',
    '',
    '/// The protocol version this build speaks.',
    'const int protocolVersion = 1;',
    '',
    '/// Every frame `type` the classes below cover.',
    'const List<String> frameTypes = <String>[',
    ...frames.map((message) => `  '${message.frameType}',`),
    '];',
    '',
    ...frames.flatMap((message) => [
      `/// \`kind\` of a ${message.frameType} frame.`,
      `const String ${camelCase(message.name)}Kind = '${message.frameKind}';`,
      '',
      `/// \`type\` of a ${message.frameType} frame.`,
      `const String ${camelCase(message.name)}Type = '${message.frameType}';`,
      '',
    ]),
    ...[model.envelope, ...model.interfaces].flatMap((declaration) => [
      emitClass(declaration),
      '',
      ...emitConditionals(declaration),
    ]),
  ];

  return `${blocks.join('\n').trimEnd()}\n`;
}

/** @param {string} text @returns {string} */
function camelCase(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
