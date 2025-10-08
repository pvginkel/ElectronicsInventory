import { expect, type Locator, type Page } from '@playwright/test';
import type { FormTestEvent } from '@/types/test-events';
import { BasePage } from './base-page';
import { selectors } from '../selectors';
import { waitForListLoading, waitTestEvent } from '../helpers';

export const PART_SELECTOR_HARNESS_FORM_ID = 'partselectorharness_submit';

export class PartSelectorHarnessPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  get harnessRoot(): Locator {
    return this.page.locator(selectors.parts.selector.harness.page);
  }

  get selectorRoot(): Locator {
    return this.page.locator(selectors.parts.selector.root);
  }

  get input(): Locator {
    return this.page.locator(selectors.parts.selector.input);
  }

  get selectedSummary(): Locator {
    return this.page.locator(selectors.parts.selector.selected);
  }

  get submissionSummary(): Locator {
    return this.page.locator(selectors.parts.selector.harness.submission);
  }

  get submitButton(): Locator {
    return this.page.locator(selectors.parts.selector.harness.submit);
  }

  async goto(): Promise<void> {
    await this.page.goto('/parts/selector-harness');
  }

  async waitForReady(): Promise<void> {
    await waitForListLoading(this.page, 'parts.selector', 'ready');
  }

  async search(term: string): Promise<void> {
    await this.input.fill(term);
  }

  async selectOption(matcher: string | RegExp): Promise<void> {
    await expect(this.selectorRoot).toBeVisible();
    const listbox = await this.resolveListbox(matcher);
    await expect(listbox).toBeVisible();

    await listbox.evaluate((node, matcherOptions) => {
      const options = Array.from(node.querySelectorAll('[role="option"]')) as HTMLElement[];
      const target = options.find(option => {
        const text = option.textContent ?? '';
        if (matcherOptions.regex) {
          const regex = new RegExp(matcherOptions.regex.source, matcherOptions.regex.flags);
          return regex.test(text);
        }
        return matcherOptions.text ? text.includes(matcherOptions.text) : false;
      });

      if (target) {
        target.scrollIntoView({ block: 'nearest' });
      }
    }, {
      text: typeof matcher === 'string' ? matcher : undefined,
      regex: matcher instanceof RegExp ? { source: matcher.source, flags: matcher.flags } : undefined,
    });

    const option = listbox.getByRole('option', { name: matcher });
    await expect(option).toBeVisible();
    await expect(async () => {
      const isInView = await option.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const withinHorizontalBounds = rect.right > 0 && rect.left < window.innerWidth;
        const withinVerticalBounds = rect.bottom > 0 && rect.top < window.innerHeight;
        return withinHorizontalBounds && withinVerticalBounds;
      });
      expect(isInView).toBe(true);
    }).toPass();

    await option.click();
  }

  async expectInputValue(value: string | RegExp): Promise<void> {
    await expect(this.input).toHaveValue(value);
  }

  async expectOnlyOption(matcher: string | RegExp): Promise<void> {
    const listbox = await this.resolveListbox(matcher);
    await expect(listbox).toBeVisible();
    await expect(listbox.getByRole('option')).toHaveCount(1);
    await expect(listbox.getByRole('option', { name: matcher })).toBeVisible();
  }

  async submit(expectSuccess: boolean = true): Promise<{
    submitEvent: FormTestEvent;
    completionEvent: FormTestEvent;
  }> {
    const submitPromise = waitTestEvent<FormTestEvent>(this.page, 'form', (event) => {
      return event.formId === PART_SELECTOR_HARNESS_FORM_ID && event.phase === 'submit';
    });

    const completionPromise = waitTestEvent<FormTestEvent>(this.page, 'form', (event) => {
      return event.formId === PART_SELECTOR_HARNESS_FORM_ID &&
        event.phase === (expectSuccess ? 'success' : 'error');
    });

    await this.submitButton.click();
    const [submitEvent, completionEvent] = await Promise.all([submitPromise, completionPromise]);
    return { submitEvent, completionEvent };
  }

  private async resolveListbox(matcher: string | RegExp): Promise<Locator> {
    const listboxId = await this.input.getAttribute('aria-controls');
    if (listboxId) {
      return this.page.locator(`#${listboxId}`);
    }

    return this.page
      .locator('[role="listbox"]')
      .filter({ has: this.page.getByRole('option', { name: matcher }) })
      .first();
  }
}
