import { Page, Locator, expect } from '@playwright/test';

/**
 * Base page object with common patterns and utilities
 * All page objects should extend this base class
 */
export class BasePage {
  constructor(protected readonly page: Page) {}

  /**
   * Navigates to a specific path
   * @param path - The path to navigate to (relative to base URL)
   */
  async goto(path: string = ''): Promise<void> {
    await this.page.goto(path);
  }

  /**
   * Waits for the page to be fully loaded
   * @param options - Optional timeout configuration
   */
  async waitForPageLoad(options?: { timeout?: number }): Promise<void> {
    await this.page.waitForLoadState('networkidle', options);
  }

  /**
   * Waits for a specific element to be visible
   * @param selector - The selector for the element
   * @param options - Optional timeout configuration
   */
  async waitForElement(selector: string, options?: { timeout?: number }): Promise<void> {
    await this.page.waitForSelector(selector, { state: 'visible', ...options });
  }

  /**
   * Clicks an element and waits for navigation if expected
   * @param selector - The selector for the element to click
   * @param options - Options for click and navigation
   */
  async clickAndWaitForNavigation(
    selector: string,
    options?: { waitForNavigation?: boolean; timeout?: number }
  ): Promise<void> {
    if (options?.waitForNavigation !== false) {
      await Promise.all([
        this.page.waitForNavigation({ timeout: options?.timeout }),
        this.page.click(selector),
      ]);
    } else {
      await this.page.click(selector);
    }
  }

  /**
   * Gets a button by its text content
   * @param text - The text content of the button
   * @returns Locator for the button
   */
  getButton(text: string | RegExp): Locator {
    return this.page.getByRole('button', { name: text });
  }

  /**
   * Gets a link by its text content
   * @param text - The text content of the link
   * @returns Locator for the link
   */
  getLink(text: string | RegExp): Locator {
    return this.page.getByRole('link', { name: text });
  }

  /**
   * Gets a form field by its label
   * @param label - The label text for the field
   * @returns Locator for the form field
   */
  getField(label: string | RegExp): Locator {
    return this.page.getByLabel(label);
  }

  /**
   * Gets a heading by level and optional text
   * @param level - The heading level (1-6)
   * @param text - Optional text content
   * @returns Locator for the heading
   */
  getHeading(level: 1 | 2 | 3 | 4 | 5 | 6, text?: string | RegExp): Locator {
    const role = `heading`;
    const options: any = { level };
    if (text) {
      options.name = text;
    }
    return this.page.getByRole(role, options);
  }

  /**
   * Checks if an element is visible
   * @param selector - The selector for the element
   * @returns True if visible, false otherwise
   */
  async isVisible(selector: string): Promise<boolean> {
    return this.page.isVisible(selector);
  }

  /**
   * Gets the text content of an element
   * @param selector - The selector for the element
   * @returns The text content
   */
  async getText(selector: string): Promise<string | null> {
    return this.page.textContent(selector);
  }

  /**
   * Fills a form field with a value
   * @param selector - The selector for the field
   * @param value - The value to fill
   */
  async fillField(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }

  /**
   * Selects an option from a dropdown
   * @param selector - The selector for the dropdown
   * @param value - The value or label to select
   */
  async selectOption(selector: string, value: string | { label?: string; value?: string }): Promise<void> {
    await this.page.selectOption(selector, value);
  }

  /**
   * Checks or unchecks a checkbox
   * @param selector - The selector for the checkbox
   * @param checked - Whether the checkbox should be checked
   */
  async setCheckbox(selector: string, checked: boolean): Promise<void> {
    if (checked) {
      await this.page.check(selector);
    } else {
      await this.page.uncheck(selector);
    }
  }

  /**
   * Takes a screenshot of the current page
   * @param name - The name for the screenshot file
   * @param options - Screenshot options
   */
  async screenshot(name: string, options?: { fullPage?: boolean }): Promise<void> {
    await this.page.screenshot({ path: `screenshots/${name}.png`, ...options });
  }

  /**
   * Waits for a toast notification to appear
   * @param options - Options for waiting
   * @returns The toast element
   */
  async waitForToast(options?: { timeout?: number }): Promise<Locator> {
    const toast = this.page.getByRole('status');
    await toast.waitFor({ state: 'visible', ...options });
    return toast;
  }

  /**
   * Asserts that a toast with specific text appears
   * @param text - The expected toast text
   * @param options - Options for assertion
   */
  async expectToast(text: string | RegExp, options?: { timeout?: number }): Promise<void> {
    const toast = await this.waitForToast(options);
    await expect(toast).toContainText(text, options);
  }

  /**
   * Dismisses a toast notification
   */
  async dismissToast(): Promise<void> {
    const closeButton = this.page.locator('[role="status"] button[aria-label="Close"]');
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
  }

  /**
   * Gets the current URL
   * @returns The current page URL
   */
  async getUrl(): Promise<string> {
    return this.page.url();
  }

  /**
   * Asserts the current URL matches a pattern
   * @param urlPattern - The expected URL pattern
   */
  async expectUrl(urlPattern: string | RegExp): Promise<void> {
    await expect(this.page).toHaveURL(urlPattern);
  }

  /**
   * Reloads the current page
   * @param options - Reload options
   */
  async reload(options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void> {
    await this.page.reload(options);
  }

  /**
   * Waits for a specific amount of time
   * @param ms - Milliseconds to wait
   */
  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /**
   * Gets all elements matching a selector
   * @param selector - The selector
   * @returns Array of locators
   */
  getAllElements(selector: string): Locator {
    return this.page.locator(selector);
  }

  /**
   * Counts elements matching a selector
   * @param selector - The selector
   * @returns The count of matching elements
   */
  async countElements(selector: string): Promise<number> {
    return this.page.locator(selector).count();
  }

  /**
   * Scrolls an element into view
   * @param selector - The selector for the element
   */
  async scrollIntoView(selector: string): Promise<void> {
    await this.page.locator(selector).scrollIntoViewIfNeeded();
  }

  /**
   * Presses a keyboard key
   * @param key - The key to press (e.g., 'Enter', 'Escape')
   */
  async pressKey(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  /**
   * Gets the test data attribute selector
   * @param testId - The test ID value
   * @returns The selector string
   */
  protected getTestIdSelector(testId: string): string {
    return `[data-testid="${testId}"]`;
  }
}