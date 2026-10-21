import { test, expect } from "@playwright/test";
test("callback failures are visible and never expose raw codes or upstream messages", async ({
  page,
}) => {
  await page.goto(
    "/auth/callback?error=access_denied&error_code=otp_expired&error_description=private-test-value",
  );
  await expect(page).toHaveURL(/\/login\?error=link_expired$/);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "만료됐거나 이미 사용",
  );
  await expect(page.locator("body")).not.toContainText("private-test-value");
  await page.goto("/auth/callback");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "코드가 전달되지",
  );
  await page.goto("/login?error=browser_mismatch");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "같은 브라우저",
  );
});
