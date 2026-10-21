import { test, expect } from "@playwright/test";
test("manual CRUD, persistence, sample opt-in, calendar, notes and graceful AI fallback", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "오늘의 중요한 일." }),
  ).toBeVisible();
  await expect(page.getByText("작은 시작이 큰 변화를 만듭니다.")).toBeVisible();
  await page.getByRole("button", { name: "새 업무", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("제목", { exact: true }).fill("브라우저 테스트 업무");
  await dialog
    .getByRole("combobox", { name: "중요도", exact: true })
    .selectOption("5");
  await dialog
    .getByRole("combobox", { name: "긴급도", exact: true })
    .selectOption("5");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "브라우저 테스트 업무" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "브라우저 테스트 업무" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "브라우저 테스트 업무 완료", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "브라우저 테스트 업무" }),
  ).toBeHidden();
  await expect(page.getByText("100").first()).toBeVisible();
  await page.getByRole("button", { name: "업무 수정", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("제목", { exact: true })
    .fill("수정된 업무");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /수정된 업무/ }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "업무 수정", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("작은 시작이 큰 변화를 만듭니다.")).toBeVisible();
  await page.getByRole("button", { name: /먼저 둘러보고/ }).click();
  await expect(
    page.getByRole("heading", { name: "리뉴얼 핵심 요구사항 정리" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "바로 시작", exact: true }),
  ).toHaveCount(3);
  if (test.info().project.name === "mobile")
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Calendar", exact: true })
      .click();
  else
    await page.getByRole("button", { name: "일정 보기", exact: true }).click();
  await page.getByRole("button", { name: "일정 추가", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("제목", { exact: true })
    .fill("집중 업무 블록");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /09:00 집중 업무 블록/ }),
  ).toBeVisible();
  const ai = page
    .getByRole("navigation")
    .getByRole("button", { name: /AI 업무 비서|^AI$/ });
  await ai.filter({ visible: true }).click();
  await page
    .getByRole("button", { name: "오늘 내가 가장 먼저 해야 할 일은?" })
    .click();
  await expect(page.getByText(/로컬 규칙 기반 안내/)).toBeVisible();
  await page.screenshot({
    path: `test-results/${test.info().project.name}-workspace.png`,
    fullPage: true,
  });
});
test("record permissions, manual transcript saving and meeting deletion", async ({
  page,
}) => {
  await page.goto("/");
  const record = page
    .getByRole("navigation")
    .getByRole("button", { name: /녹음 · 회의록|Record/ });
  await record.filter({ visible: true }).click();
  await expect(
    page.getByRole("button", { name: "녹음 시작", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("회의 제목", { exact: true }).fill("제품 회의");
  await page
    .getByLabel("녹취록", { exact: true })
    .fill(
      "이번 주에는 업무 목록 필터를 개선하기로 결정했습니다. 담당자와 마감일은 추후 확인합니다.",
    );
  await page.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(page.getByRole("button", { name: /제품 회의/ })).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /녹음 · 회의록|Record/ })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole("button", { name: /제품 회의/ })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "회의 삭제", exact: true }).click();
  await expect(page.getByRole("button", { name: /제품 회의/ })).toBeHidden();
});
test("local browser tabs synchronize; unsupported cloud APIs fail explicitly", async ({
  page,
  context,
  request,
}) => {
  await page.goto("/");
  const second = await context.newPage();
  await second.goto("/");
  await page.getByRole("button", { name: "새 업무", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("제목", { exact: true })
    .fill("탭 동기화 업무");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await expect(
    second.getByRole("heading", { name: "탭 동기화 업무" }),
  ).toBeVisible();
  const ai = await request.post("/api/ai", {
    data: { kind: "chat", message: "오늘 업무" },
  });
  expect(ai.status()).toBe(503);
  const mcp = await request.post("/mcp", {
    data: { jsonrpc: "2.0", method: "tools/list", id: 1 },
  });
  expect(mcp.status()).toBe(503);
});

test("microphone consent, recording, pause, resume and playable output", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  await page.goto("/");
  await expect(page.getByText("작은 시작이 큰 변화를 만듭니다.")).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /녹음 · 회의록|Record/ })
    .filter({ visible: true })
    .click();
  await page.getByLabel("회의 참석자의 녹음·처리 동의를 확인했습니다.").check();
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "일시정지", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "재개", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "재개", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "녹음 종료", exact: true }).click();
  await expect(page.locator("audio")).toBeVisible();
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/);
  await expect(
    page.getByRole("button", { name: "텍스트 변환", exact: true }),
  ).toBeEnabled();
});

test("dependencies prevent blocked work from appearing in focus", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("작은 시작이 큰 변화를 만듭니다.")).toBeVisible();
  for (const title of ["선행 기획 업무", "후속 디자인 업무"]) {
    await page.getByRole("button", { name: "새 업무", exact: true }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("제목", { exact: true }).fill(title);
    if (title === "후속 디자인 업무")
      await d.getByLabel("선행 기획 업무", { exact: true }).check();
    await d.getByRole("button", { name: "저장", exact: true }).click();
    await expect(d).toBeHidden();
  }
  await expect(
    page.getByRole("heading", { name: "후속 디자인 업무", exact: true }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "선행 기획 업무 완료", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "후속 디자인 업무", exact: true }),
  ).toBeVisible();
});

test("project and KPI goal creation, editing and deletion", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("작은 시작이 큰 변화를 만듭니다.")).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^프로젝트$|^Projects$/ })
    .filter({ visible: true })
    .click();
  await page
    .getByRole("button", { name: "프로젝트 추가", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("제목", { exact: true })
    .fill("신규 플랫폼");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "신규 플랫폼", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "목표", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "목표 추가", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("제목", { exact: true }).fill("전환율 개선");
  await d
    .getByRole("combobox", { name: "프로젝트", exact: true })
    .selectOption({ label: "신규 플랫폼" });
  await d.getByLabel("KPI 단위", { exact: true }).fill("건");
  await d.getByLabel("목표 수치", { exact: true }).fill("200");
  await d.getByLabel("현재 실적", { exact: true }).fill("100");
  await d.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "전환율 개선", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("50%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /목표 수정/ }).click();
  await page
    .getByRole("dialog")
    .getByLabel("현재 실적", { exact: true })
    .fill("160");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await expect(page.getByText("80%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /목표 수정/ }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "전환율 개선", exact: true }),
  ).toBeHidden();
});
