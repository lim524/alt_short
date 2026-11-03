import { test, expect } from "@playwright/test";
import { fixtureBundle } from "../src/tests/fixtures";
test("light dashboard, responsive navigation, watch list and reduced motion", async ({
  page,
}, testInfo) => {
  const symbols = ["AAVEUSDT", "SOLUSDT", "OPUSDT", "ARBUSDT", "SUIUSDT"];
  const fixtures = symbols.map((s) => fixtureBundle(s));
  await page.route("**/api/market", (r) =>
    r.fulfill({
      json: {
        markets: fixtures.map((f) => f.market),
        retrievedAt: Date.now(),
        expiresAt: Date.now() + 30000,
        warnings: ["시각 검증용 합성 데이터 · 실제 시세 아님"],
        source: "TEST FIXTURE",
      },
    }),
  );
  await page.route("**/api/analysis?*", (r) =>
    r.fulfill({
      json:
        fixtures.find(
          (f) =>
            f.market.symbol ===
            new URL(r.request().url()).searchParams.get("symbol"),
        ) ?? fixtures[0],
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflows = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
  expect(await overflows()).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("dashboard-empty.png"),
    fullPage: testInfo.project.name !== "iphone-webkit",
    animations: "disabled",
    scale: "css",
  });
  await page.getByRole("button", { name: "▶ 스캔 시작" }).click();
  await expect(page.getByText("완료 · 전체", { exact: false })).toBeVisible();
  await page.locator(".candidate-open").first().click();
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.locator(".summary-grid")).toContainText("숏 후보");
  await page
    .getByRole("button", { name: "AAVEUSDT 관심 종목", exact: true })
    .first()
    .click();
  await expect(page.locator(".card-watch strong")).toContainText("1");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: testInfo.outputPath("dashboard-scanned.png"),
    fullPage: false,
    animations: "disabled",
    scale: "css",
  });
  if (testInfo.project.name === "desktop-chromium") {
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: testInfo.outputPath("dashboard-wide.png"),
      fullPage: false,
      animations: "disabled",
      scale: "css",
    });
  }
  await page.getByRole("button", { name: "관심 종목", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "관심 종목 리스트", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".candidate-open")).toHaveCount(2);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "전략 설정", exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "대시보드", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".summary-card")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(await overflows()).toBe(false);
  if (testInfo.project.name === "iphone-webkit") {
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await overflows()).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath("dashboard-320.png"),
      fullPage: false,
    });
  }
});
