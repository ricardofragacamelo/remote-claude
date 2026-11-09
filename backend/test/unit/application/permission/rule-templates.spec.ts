import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isKnownRuleTemplateId, ruleTemplateCatalog } from '@application/permission';

const repository = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

/** A key of a locale catalogue of the web, by its dotted path — `undefined` when it is not there. */
const keyOf = (catalogue: string, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, segment) => (node as Record<string, unknown> | undefined)?.[segment],
      JSON.parse(
        readFileSync(path.join(repository, 'web/src/shared/i18n/locales', catalogue), 'utf8'),
      ) as unknown,
    );

/**
 * The catalog of pre-built rule bundles (plan 15, B-17, D-16) — canonical, `engine` null, read once
 * through the domain's own grammar and width.
 */
describe('ruleTemplateCatalog', () => {
  it('has at least one template, each with a name and description key and at least one rule', () => {
    const templates = ruleTemplateCatalog();

    expect(templates.length).toBeGreaterThan(0);

    for (const template of templates) {
      expect(template.name.messageKey).toMatch(/^permission\.ruleTemplate\.[a-zA-Z]+Name$/);
      expect(template.description.messageKey).toMatch(
        /^permission\.ruleTemplate\.[a-zA-Z]+Description$/,
      );
      expect(template.rules.length).toBeGreaterThan(0);
    }
  });

  it('never has an `allow` rule the domain itself would call unbounded — S-133', () => {
    const templates = ruleTemplateCatalog();

    for (const template of templates) {
      for (const rule of template.rules) {
        if (rule.decision === 'allow') {
          expect(rule.breadth).not.toBe('unbounded');
        }
      }
    }
  });

  it('every id is unique — a `templateId` only ever names one bundle', () => {
    const ids = ruleTemplateCatalog().map((template) => template.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reads each rule's reach from the same domain description a draft uses", () => {
    const [first] = ruleTemplateCatalog();

    expect(first?.rules[0]).toMatchObject({
      reach: { kind: expect.any(String), form: expect.any(String) },
    });
  });

  it('has a name and a description for every template, in en and pt-BR — S-134', () => {
    for (const template of ruleTemplateCatalog()) {
      expect(keyOf('en.json', template.name.messageKey)).toEqual(expect.any(String));
      expect(keyOf('en.json', template.description.messageKey)).toEqual(expect.any(String));
      expect(keyOf('pt-BR.json', template.name.messageKey)).toEqual(expect.any(String));
      expect(keyOf('pt-BR.json', template.description.messageKey)).toEqual(expect.any(String));
    }
  });
});

describe('isKnownRuleTemplateId — S-36', () => {
  it('answers true for every id the catalog actually has', () => {
    for (const template of ruleTemplateCatalog()) {
      expect(isKnownRuleTemplateId(template.id)).toBe(true);
    }
  });

  it('answers false for anything the catalog does not have', () => {
    expect(isKnownRuleTemplateId('not-a-real-template')).toBe(false);
  });
});
