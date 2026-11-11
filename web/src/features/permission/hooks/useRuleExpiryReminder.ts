import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';

import { notify } from '@/shared/lib/notify';
import { readVisitor, writeVisitor } from '@/shared/lib/visitor-storage';
import { fetchRuleSummary } from '../services/rule.service';
import { EXPIRY_WARNING_MS } from '../lib/listed-rule';
import { DEFAULT_RULES_SEARCH, ruleSummaryFilters } from '../lib/rules-search';

/** What a visitor keeps: the local calendar day (`YYYY-MM-DD`) the reminder last showed on. */
const LAST_SHOWN_KEY = 'rules.expiryReminder.lastShownOn';

function isDayString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** This machine's own calendar day — never UTC, so "today" matches what the person reading it means. */
function localDayOf(now: number): string {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Tells the person, once a day at most, how many active rules expire within seven days — the same
 * count the badge and the "Perto de expirar" tab read (plan 15, B-25, S-179; [D-18](../../../../../docs/plans/15-rules-management/decisions.md#d-18--por-onde-o-lembrete-de-expiração-chega)).
 *
 * Checked once per mount (a sign-in, or a fresh load) — never on an interval — and only raised when
 * there is at least one rule to report: a day with nothing due says nothing, and tries again next
 * time rather than marking the day "done" over an empty count. A failed read says nothing either,
 * and is retried on the next mount, never recorded as if it had shown something.
 */
export function useRuleExpiryReminder(): void {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    const today = localDayOf(now);
    const lastShownOn = readVisitor(LAST_SHOWN_KEY, (value) =>
      isDayString(value) ? value : undefined,
    );

    if (lastShownOn === today) {
      return undefined;
    }

    const expiresBefore = new Date(now + EXPIRY_WARNING_MS).toISOString();

    void fetchRuleSummary(ruleSummaryFilters(DEFAULT_RULES_SEARCH, expiresBefore))
      .then((summary) => {
        if (cancelled || summary.expiringBefore <= 0) {
          return;
        }

        writeVisitor(LAST_SHOWN_KEY, today);
        notify({
          severity: 'info',
          messageKey: 'notification.rules.expiringSoon',
          params: { count: summary.expiringBefore },
          actions: [
            {
              labelKey: 'rules.action.open',
              run: () => {
                void navigate({
                  to: '/rules',
                  search: { ...DEFAULT_RULES_SEARCH, tab: 'expiringSoon' },
                });
              },
            },
          ],
        });
      })
      .catch(() => {
        // Informational only — nothing on screen depends on this, and the next mount tries again.
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);
}
