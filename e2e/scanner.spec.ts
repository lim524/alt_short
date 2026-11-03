import { test, expect } from "@playwright/test";
import { fixtureBundle } from "../src/tests/fixtures";
test("scan, inspect, edit, save, reopen and preserve original evidence", async ({
  page,
}) => {
  const fixture = fixtureBundle();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/market", (r) =>
    r.fulfill({
      json: {
        markets: [fixture.market],
        retrievedAt: Date.now(),
        expiresAt: Date.now() + 30000,
        warnings: ["자동 테스트용 합성 자료"],
        source: "TEST FIXTURE",
      },
    }),
  );
  await page.route("**/api/analysis?*", (r) => r.fulfill({ json: fixture }));
  await page.goto("/");
  await page.getByRole("button", { name: "▶ 스캔 시작" }).click();
  await expect(page.getByText("완료 · 전체", { exact: false })).toBeVisible();
  await page.locator(".candidate-open").first().click();
  await expect(
    page.getByRole("heading", { name: "숏 모의 시나리오" }),
  ).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.locator(".factor summary").first().click();
  await expect(page.getByText("실측:", { exact: false }).first()).toBeVisible();
  const original = await page
    .getByLabel("진입 가격", { exact: true })
    .inputValue();
  await page.getByLabel("진입 가격", { exact: true }).fill("98");
  await page.getByLabel("진입 가격", { exact: true }).blur();
  await page
    .getByRole("button", { name: "시나리오 저장", exact: true })
    .click();
  await expect(page.getByRole("status").first()).toContainText(
    "시나리오 저장 완료",
  );
  await page.getByRole("button", { name: "■ 스캔 중지" }).click();
  await page
    .getByRole("button", { name: "저장 시나리오", exact: true })
    .click();
  await page.getByRole("button", { name: "수정 계획 v1" }).click();
  await expect(page.getByLabel("진입 가격", { exact: true })).toHaveValue("98");
  await page.getByRole("button", { name: "추천값 복원" }).click();
  await expect(page.getByLabel("진입 가격", { exact: true })).toHaveValue(
    original,
  );
  await page.getByRole("button", { name: "🔒 선 편집 잠김" }).click();
  await expect(page.getByLabel("entry 차트 선 이동")).toBeVisible();
  // Numeric fallback is exercised on both browser engines; mouse drag additionally on desktop.
  if (!test.info().project.name.includes("iphone")) {
    const handle = page.getByLabel("entry 차트 선 이동");
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    if (!box) throw Error("핸들 없음");
    await page.mouse.move(box.x + 30, box.y + 22);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + 37, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByLabel("진입 가격", { exact: true })).not.toHaveValue(
      original,
    );
  }
  await page.reload();
  await page
    .getByRole("button", { name: "저장 시나리오", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "원본 분석", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "원본 분석", exact: true }).click();
  await expect(page.getByLabel("진입 가격", { exact: true })).toHaveValue(
    original,
  );
  expect(errors).toEqual([]);
});
