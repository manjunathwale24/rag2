import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, USER_A } from "./global-setup";

const NOTES = "Employees get 25 days of paid annual leave every year.";
const NOT_FOUND = "I couldn't find anything in this knowledge base that answers that question.";

async function signInAndCreateKb(page: Page, name: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USER_A);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/kbs$/);

  await page.getByPlaceholder("New knowledge base name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/kbs\/[0-9a-f-]{36}$/);
}

test("uploads a file, syncs it, and answers with a cited source", async ({ page }) => {
  await signInAndCreateKb(page, "Leave policy");

  await page.getByLabel("Choose a file to upload").setInputFiles({
    name: "leave-policy.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(`# Leave\n\n${NOTES}\n`),
  });
  await expect(page.getByText("leave-policy.md")).toBeVisible();
  await expect(page.getByText("pending", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sync" }).click();
  await expect(page.getByRole("status")).toHaveText("Everything is indexed.");
  await expect(page.getByText("indexed", { exact: true })).toBeVisible();

  await page.getByPlaceholder("What does the document say about…?").fill("How many days of paid annual leave do employees get?");
  await page.getByRole("button", { name: "Ask" }).click();

  await expect(page.getByLabel("Answer")).toHaveText("Employees get 25 days of paid annual leave every year. [1]");

  await page.getByText("Sources (1)").click();
  await expect(page.locator("details").getByText("leave-policy.md", { exact: false })).toBeVisible();
});

test("says so when the knowledge base has no matching sources", async ({ page }) => {
  await signInAndCreateKb(page, "Empty base");

  await page.getByPlaceholder("What does the document say about…?").fill("What is the refund policy?");
  await page.getByRole("button", { name: "Ask" }).click();

  await expect(page.getByText(NOT_FOUND)).toBeVisible();
});
