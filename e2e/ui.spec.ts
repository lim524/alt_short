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
  await page.route("**/api/fundamentals?*", (r) =>
    r.fulfill({
      json: {
        symbol: "AAVEUSDT",
        mapping: "unverified",
        metrics: {},
        sources: [],
        warnings: ["자동 테스트용 펀더멘털 응답"],
        news: [],
        retrievedAt: Date.now(),
      },
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
  await expect(
    page.getByRole("button", { name: "전체 스캔 시작", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".evidence")).not.toBeVisible();
  await expect(page.locator(".planner")).not.toBeVisible();
  const openFundamentals = page.getByRole("button", {
    name: "펀더멘털",
    exact: false,
  });
  await openFundamentals.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "펀더멘털 조회" }),
  ).toBeVisible();
  await expect(
    dialog.getByLabel("개인 AI 접근 토큰", { exact: false }),
  ).not.toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await dialog.getByRole("button", { name: "펀더멘털 조회" }).click();
  await expect(dialog.getByText("자동 테스트용 펀더멘털 응답")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(openFundamentals).toBeFocused();
  await openFundamentals.click();
  await expect(dialog.getByText("자동 테스트용 펀더멘털 응답")).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "AI 시나리오", exact: false }).click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "펀더멘털 조회" }),
  ).not.toBeVisible();
  await expect(
    dialog.getByLabel("개인 AI 접근 토큰", { exact: false }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "창 닫기" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
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
