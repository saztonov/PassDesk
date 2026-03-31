const { test } = require('@playwright/test');

test('smoke', async ({ page }) => {
  await page.goto('http://localhost:5173/login');
});
