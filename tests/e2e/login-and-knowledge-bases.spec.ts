import { randomUUID } from "node:crypto";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import { E2E_PASSWORD, USER_A, USER_B } from "./global-setup";
import { E2E_CAPTCHA_TOKEN } from "./stubs/turnstile-stub";

test("signs in, creates a knowledge base, and signs out", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Email").fill(USER_A);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/kbs$/);

  await page.getByPlaceholder("New knowledge base name").fill("Team handbook");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/kbs\/[0-9a-f-]{36}$/);

  await page.goto("/kbs");
  await expect(page.getByRole("link", { name: "Team handbook" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("a signed-in user cannot use another user's knowledge base", async ({ browser, baseURL }) => {
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await owner.goto("/login");
  await owner.getByLabel("Email").fill(USER_A);
  await owner.getByLabel("Password").fill(E2E_PASSWORD);
  await owner.getByRole("button", { name: "Sign in" }).click();
  await expect(owner).toHaveURL(/\/kbs$/);
  await owner.getByPlaceholder("New knowledge base name").fill("Private notes");
  await owner.getByRole("button", { name: "Create" }).click();
  await expect(owner).toHaveURL(/\/kbs\/[0-9a-f-]{36}$/);
  const kbId = new URL(owner.url()).pathname.split("/").pop() as string;
  await ownerContext.close();

  const intruder = await playwrightRequest.newContext({ baseURL });
  const login = await intruder.post("/api/login", {
    data: { email: USER_B, password: E2E_PASSWORD, captchaToken: E2E_CAPTCHA_TOKEN },
  });
  expect(login.ok()).toBe(true);

  const sync = await intruder.post(`/api/kbs/${kbId}/sync`);
  expect(sync.status()).toBe(404);
  await intruder.dispose();
});

test("an anonymous visitor is sent to the sign-in page", async ({ page }) => {
  await page.goto("/kbs");
  await expect(page).toHaveURL(/\/login$/);
});

test("a new visitor creates an account and lands on their knowledge bases", async ({ page }) => {
  const email = `new-${randomUUID()}@example.test`;
  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/signup$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a new password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/kbs$/);
  await expect(page.getByPlaceholder("New knowledge base name")).toBeVisible();
});
