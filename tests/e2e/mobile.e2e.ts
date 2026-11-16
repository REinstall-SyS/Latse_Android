import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { jpegExif } from "../../src/domain/__tests__/helpers/jpeg-exif";

const failures = new WeakMap<Page, string[]>();
fs.mkdirSync(".artifacts/overhaul", { recursive: true });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/tile\.openstreetmap\.org/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e4e8dc"/><path d="M0 190Q80 100 170 140T290 80M10 0Q110 80 80 180T110 280" fill="none" stroke="#d1dac7" stroke-width="18"/><path d="M-10 220Q90 120 200 180T280 90" fill="none" stroke="#f9f6ed" stroke-width="3"/></svg>',
    }),
  );
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
});
test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual([]);
});

async function lockedViewport(page: Page) {
  const result = await page.evaluate((viewport) => {
    const app = document.querySelector(".latse-app")!;
    const main = document.querySelector(".app-main")!;
    return {
      horizontal:
        document.documentElement.scrollWidth > viewport.width + 1 ||
        app.scrollWidth > viewport.width + 1 ||
        main.scrollWidth > main.clientWidth + 1,
      pageScroll: document.documentElement.scrollHeight > viewport.height + 1,
      mainScroll: main.scrollHeight > main.clientHeight + 1,
    };
  }, page.viewportSize()!);
  expect(result).toEqual({
    horizontal: false,
    pageScroll: false,
    mainScroll: false,
  });
  const small = await page.locator("button").evaluateAll((buttons) =>
    buttons.flatMap((button) => {
      const box = button.getBoundingClientRect();
      return box.width > 0 &&
        box.height > 0 &&
        (box.width < 43.9 || box.height < 43.9)
        ? [button.getAttribute("aria-label") || button.textContent]
        : [];
    }),
  );
  expect(small).toEqual([]);
}

async function scrubTo(page: Page, index: number) {
  const chart = page.getByRole("slider", {
    name: "Interactive elevation profile",
    exact: true,
  });
  await chart.focus();
  await chart.press("Home");
  for (let step = 0; step < Math.floor(index / 10); step++)
    await chart.press("Shift+ArrowRight");
  for (let step = 0; step < index % 10; step++) await chart.press("ArrowRight");
  await expect(chart).toHaveAttribute("aria-valuenow", String(index));
}

async function closePanel(page: Page) {
  if (
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .count()
  )
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
  else
    await page
      .locator(".studio-editor")
      .getByRole("button", { name: "Done", exact: true })
      .click();
}

async function chooseDesign(page: Page, style?: string, ratio?: string) {
  await page.getByRole("button", { name: "Design", exact: true }).click();
  if (style)
    await page.getByRole("button", { name: style, exact: true }).click();
  if (ratio)
    await page
      .getByRole("button", {
        name: ratio === "9:16" ? "Story · 9:16" : "Post · 4:5",
        exact: true,
      })
      .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
}
async function openStudioCover(page: Page) {
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page
    .getByRole("button", { name: "Cover photo & crop", exact: true })
    .click();
}
async function openStudioFiles(page: Page) {
  if (
    !(await page
      .getByRole("dialog", { name: "Privacy & files", exact: true })
      .count())
  )
    await page
      .getByRole("button", { name: "Studio options", exact: true })
      .click();
  const summary = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Route & interactive files" }),
  });
  if ((await summary.getAttribute("open")) === null)
    await summary.locator("summary").click();
}

async function canvasFits(page: Page) {
  const fits = await page.locator(".studio-canvas-stage").evaluate((stage) => {
    const canvas = stage.querySelector("canvas")!;
    const box = canvas.getBoundingClientRect(),
      parent = stage.getBoundingClientRect();
    return (
      box.width > 100 &&
      box.height > 100 &&
      box.left >= parent.left &&
      box.right <= parent.right + 1 &&
      box.top >= parent.top &&
      box.bottom <= parent.bottom + 1
    );
  });
  expect(fits).toBe(true);
}

test("four primary tabs stay within tall and compact phone viewports", async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 390, height: 720 },
    { width: 360, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    for (const tab of ["Trails", "Map", "Record", "Studio"]) {
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("button", { name: tab, exact: true })
        .click();
      await expect(
        page.getByRole("region", {
          name: (
            {
              Trails: "Trails",
              Map: "Trail map",
              Record: "Hike recorder",
              Studio: "Hike Studio",
            } as const
          )[tab as "Trails" | "Map" | "Record" | "Studio"],
          exact: true,
        }),
      ).toBeVisible();
      if (tab === "Map")
        await expect(
          page.locator(".navigation-leaflet path").first(),
        ).toBeVisible();
      if (tab === "Studio") {
        await expect(
          page.getByRole("button", {
            name: "Share keepsake",
            exact: true,
          }),
        ).toBeEnabled();
        await canvasFits(page);
      }
      await lockedViewport(page);
      if (viewport.height === 844)
        await page.screenshot({
          path: `.artifacts/overhaul/${tab.toLowerCase()}-390x844.png`,
        });
    }
  }
  await expect(page.getByRole("navigation").getByRole("button")).toHaveCount(4);
});

test("all three receipt designs export both ratios while the entire card stays visible", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open trail library" }).click();
  await page.getByRole("button", { name: /Half Dome via Mist Trail/ }).click();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  for (const [label, id] of [
    ["Postcard", "postcard"],
    ["Atlas", "atlas"],
    ["Afterlight", "afterlight"],
  ]) {
    await chooseDesign(page, label);
    for (const ratio of ["9:16", "4:5"]) {
      await chooseDesign(page, undefined, ratio);
      const save = page.getByRole("button", { name: "Save PNG", exact: true });
      await expect(save).toBeEnabled();
      expect(
        await page
          .locator(".studio-canvas-stage canvas")
          .evaluate((canvas: HTMLCanvasElement) => [
            canvas.width,
            canvas.height,
          ]),
      ).toEqual([1080, ratio === "9:16" ? 1920 : 1350]);
      await lockedViewport(page);
      await canvasFits(page);
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        save.click(),
      ]);
      await download.saveAs(
        `.artifacts/overhaul/${id}-${ratio.replace(":", "-")}.png`,
      );
    }
  }
});

test("a gallery backdrop renders inside the frame and long titles fit every style", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await chooseDesign(page, undefined, "4:5");
  await openStudioCover(page);
  const photo = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    const context = canvas.getContext("2d")!;
    const sky = context.createLinearGradient(0, 0, 0, 900);
    sky.addColorStop(0, "#728C98");
    sky.addColorStop(1, "#EBD7B4");
    context.fillStyle = sky;
    context.fillRect(0, 0, 1200, 900);
    context.fillStyle = "#415D54";
    context.beginPath();
    context.moveTo(0, 900);
    context.lineTo(0, 700);
    context.lineTo(500, 280);
    context.lineTo(900, 640);
    context.lineTo(1200, 440);
    context.lineTo(1200, 900);
    context.fill();
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page
    .locator('input[type=file][aria-label="Choose trail photos"]')
    .setInputFiles({
      name: "Summit light.png",
      mimeType: "image/png",
      buffer: Buffer.from(photo, "base64"),
    });
  await expect(page.locator(".studio-cover-proof")).toHaveAttribute(
    "src",
    /^data:image/,
  );
  await closePanel(page);
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill(
      "Tour du Mont Blanc — Les Houches to Les Contamines, a field edition",
    );
  await closePanel(page);
  for (const [label, id] of [
    ["Postcard", "postcard"],
    ["Atlas", "atlas"],
    ["Afterlight", "afterlight"],
  ]) {
    await chooseDesign(page, label);
    const save = page.getByRole("button", { name: "Save PNG", exact: true });
    await expect(save).toBeEnabled();
    await canvasFits(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      save.click(),
    ]);
    await download.saveAs(`.artifacts/overhaul/photo-long-title-${id}.png`);
  }
});

test("Studio options hide secondary controls, invalidate privacy links, and trim GPX capture times", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveCount(0);
  const save = page.getByRole("button", { name: "Save PNG", exact: true });
  await expect(save).toBeEnabled();
  await Promise.all([page.waitForEvent("download"), save.click()]);
  await page
    .getByRole("button", { name: "Studio options", exact: true })
    .click();
  const oldUrl = await page
    .locator(".prepared-artifact a")
    .getAttribute("href");
  await page
    .getByRole("checkbox", { name: "Hide First/Last", exact: false })
    .check();
  await expect(page.locator(".prepared-artifact")).toHaveCount(0);
  expect(
    await page.evaluate(
      (url) =>
        fetch(url!)
          .then(() => false)
          .catch(() => true),
      oldUrl,
    ),
  ).toBe(true);
  await closePanel(page);
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("A long day above the valley — Les Houches to Les Contamines");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await openStudioFiles(page);
  const [gpx] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export GPX Route", exact: true }).click(),
  ]);
  const content = fs.readFileSync((await gpx.path())!, "utf8");
  expect(content).not.toContain("<time>");
  expect(content).not.toContain("wallTime");
  await closePanel(page);
  await expect(save).toBeEnabled();
  await lockedViewport(page);
  await canvasFits(page);
  await chooseDesign(page, "Atlas");
  await page
    .getByRole("button", { name: "Studio options", exact: true })
    .click();
  await expect(page.locator(".prepared-artifact")).toHaveCount(0);
});

test("preferences open units and SOS while route details stay reachable", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", {
    name: "Preferences & Safety",
    exact: true,
  });
  await expect(
    settings.getByRole("group", { name: "Distance and elevation units" }),
  ).toBeVisible();
  await expect(page.locator(".app-header .unit-toggle")).toHaveCount(0);
  await settings
    .getByRole("button", { name: "SOS & location sharing", exact: true })
    .click();
  const sos = page.getByRole("dialog", { name: "SOS Beacon", exact: true });
  await expect(sos).toBeVisible();
  await sos
    .getByRole("button", { name: "Back to settings", exact: true })
    .click();
  await expect(settings).toBeVisible();
  await closePanel(page);
  await page.getByRole("button", { name: "SOS", exact: true }).click();
  await expect(sos).toBeVisible();
  await closePanel(page);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("button", { name: /^Route details:/ }).click();
  await page.getByRole("button", { name: "Find the high point" }).click();
  await lockedViewport(page);
});

test("recording preserves capture time across pauses without clock-tick persistence, and saves a receipt", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await page.addInitScript(() => {
    let next = 0;
    const watchers = new Map<number, PositionCallback>();
    let current = {
      latitude: 30.74,
      longitude: -89.08,
      altitude: 100,
      accuracy: 5,
    };
    const position = () =>
      ({
        coords: { ...current, altitudeAccuracy: 5, heading: null, speed: null },
        timestamp: Date.now(),
      }) as GeolocationPosition;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: (callback: PositionCallback) => {
          const id = ++next;
          watchers.set(id, callback);
          queueMicrotask(() => callback(position()));
          return id;
        },
        clearWatch: (id: number) => watchers.delete(id),
      },
    });
    (window as any).emitFix = () => {
      current = { ...current, latitude: 30.7403, altitude: 115 };
      watchers.forEach((callback) => callback(position()));
    };
    (window as any).draftWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "latse_recording_draft_v1") (window as any).draftWrites++;
      return original.call(this, key, value);
    };
  });
  await page.clock.install();
  await page.reload();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Hike title", exact: true })
    .fill("A quiet mile");
  await page.getByRole("button", { name: "Start Hike", exact: true }).click();
  const saved = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("latse_recording_draft_v1")!),
    );
  await expect.poll(async () => (await saved())?.points.length).toBe(1);
  const writes = await page.evaluate(() => (window as any).draftWrites);
  await page.clock.fastForward(5000);
  expect(await page.evaluate(() => (window as any).draftWrites)).toBe(writes);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.clock.fastForward(600000);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.clock.fastForward(5000);
  await page.evaluate(() => (window as any).emitFix());
  await expect.poll(async () => (await saved()).points.length).toBe(2);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const draft = await saved();
  const moving = draft.points[1].time - draft.points[0].time;
  const capture = draft.points[1].wallTime - draft.points[0].wallTime;
  expect(moving).toBeGreaterThanOrEqual(10000);
  expect(moving).toBeLessThan(15000);
  expect(capture - moving).toBeGreaterThanOrEqual(599900);
  await lockedViewport(page);
  await page.getByRole("button", { name: "Pin Photo", exact: true }).click();
  await page
    .getByRole("button", { name: "Add field note", exact: false })
    .click();
  await page
    .getByPlaceholder("What will you remember?")
    .fill("A sunny pause by the pines.");
  await page.getByRole("button", { name: "Save moments", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await saved()).pins).toHaveLength(1);
  await page.getByRole("button", { name: "Finish hike", exact: true }).click();
  await page.getByRole("button", { name: "Save & customize" }).click();
  await expect(
    page.getByRole("button", { name: "Share keepsake", exact: true }),
  ).toBeEnabled();
  await canvasFits(page);
  await lockedViewport(page);
});

test("routes can be plotted, imported, selected and deleted through the library", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add route", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Draw / Tap Quick Route on Map",
      exact: false,
    })
    .click();
  for (const position of [
    { x: 85, y: 180 },
    { x: 160, y: 105 },
    { x: 225, y: 190 },
  ])
    await page.locator(".quick-route-map").click({ position });
  await page
    .getByRole("button", { name: "Use this quick route", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use this trail", exact: false })
    .click();
  await expect(page.locator(".journey-title h2")).toHaveText("My quick route");
  await page.getByRole("button", { name: "Open trail library" }).click();
  await page
    .getByRole("button", { name: "Delete saved My quick route" })
    .click();
  await page.getByRole("button", { name: "Remove hike", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Delete saved My quick route" }),
  ).toHaveCount(0);
  await closePanel(page);
  await page.getByRole("button", { name: "Add route", exact: true }).click();
  await page
    .locator('input[type=file][accept*=".gpx"]')
    .setInputFiles("tests/fixtures/creek-ridge.gpx");
  await page
    .getByRole("button", { name: "Use this trail", exact: false })
    .click();
  await expect(page.locator(".journey-title h2")).toHaveText(
    "Creek Ridge verification",
  );
  await lockedViewport(page);
});

async function testPhoto(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 500;
    c.height = 400;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#9aaa7a";
    ctx.fillRect(0, 0, 500, 400);
    ctx.fillStyle = "#335944";
    ctx.beginPath();
    ctx.moveTo(0, 400);
    ctx.lineTo(250, 70);
    ctx.lineTo(500, 400);
    ctx.fill();
    return c.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(base64, "base64");
}

test("GPS denial still permits photos, restart, and saving a timed memory", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: (_: unknown, fail: PositionErrorCallback) => {
          queueMicrotask(() =>
            fail({ code: 1, message: "Denied" } as GeolocationPositionError),
          );
          return 1;
        },
        clearWatch: () => {},
      },
    });
  });
  await page.reload();
  await page.clock.install();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByRole("button", { name: "Start Hike", exact: true }).click();
  await page.clock.fastForward(5000);
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Restart hike" }).click();
  await page.getByRole("button", { name: "Reset recording" }).click();
  await expect(page.getByLabel("Active hike time")).toHaveText("00:00:00");
  await page.getByRole("button", { name: "Pin Photo", exact: true }).click();
  await page.locator('input[aria-label="Choose trail photos"]').setInputFiles({
    name: "Forest.png",
    mimeType: "image/png",
    buffer: await testPhoto(page),
  });
  await page.getByRole("button", { name: "Save moments", exact: true }).click();
  await page.getByRole("button", { name: "Start Hike", exact: true }).click();
  await page.clock.fastForward(65000);
  await page.getByRole("button", { name: "Finish hike" }).click();
  await expect(page.getByText(/Your time and photos are ready/)).toBeVisible();
  await page.getByRole("button", { name: "Save & customize" }).click();
  await expect(page.getByRole("button", { name: "Save PNG" })).toBeEnabled();
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("latse_saved_tracks_v1")!)[0],
  );
  expect(saved.timedSession).toBe(true);
  expect(saved.points).toEqual([]);
  expect(saved.unplacedPhotos).toHaveLength(1);
  expect(saved.stats.durationSec).toBeGreaterThanOrEqual(65);
  await page.reload();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByText("A memory without a map.")).toBeVisible();
  await page.getByRole("button", { name: "SOS", exact: true }).click();
  await expect(
    page.getByText("No location available. Choose your local service.", {
      exact: false,
    }),
  ).toBeVisible();
  await closePanel(page);
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Photo map", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Photo map", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Your photos belong on a map." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Place photos on map", exact: true })
    .click();
  await page.getByRole("button", { name: "Place on map", exact: true }).click();
  await page
    .getByRole("application", { name: "Tap map to position photo" })
    .click({ position: { x: 120, y: 105 } });
  await page
    .getByLabel("Photo caption", { exact: true })
    .fill("The pines after rain");
  await page.getByRole("button", { name: "Save moments", exact: true }).click();
  const frame = page.frameLocator(
    'iframe[title="Interactive trail storyboard"]',
  );
  await expect(frame.locator(".photo-pin img")).toHaveCount(1);
  await frame
    .getByRole("button", { name: /Open moment .*The pines after rain/ })
    .click();
  await expect(frame.locator("#pin-caption")).toHaveText(
    "The pines after rain",
  );
  await page.setViewportSize({ width: 390, height: 720 });
  await lockedViewport(page);
  await page.screenshot({
    path: ".artifacts/overhaul/photo-map-without-gps.png",
  });
  const [png] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Share photo map", exact: true }).click(),
  ]);
  expect(await png.suggestedFilename()).toMatch(/storyboard\.png$/);
  await openStudioFiles(page);
  const [web] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", {
        name: "Export Interactive Web File (.html)",
        exact: true,
      })
      .click(),
  ]);
  const html = fs.readFileSync((await web.path())!, "utf8");
  const recipient = await page.context().newPage();
  recipient.on("pageerror", (error) => failures.get(page)!.push(error.message));
  await recipient.route("**/*", (route) => route.abort());
  await recipient.setContent(html);
  await expect(recipient.locator(".photo-pin img")).toHaveCount(1);
  await recipient
    .getByRole("button", { name: /Open moment .*The pines after rain/ })
    .click();
  await expect(recipient.locator("#pin-caption")).toHaveText(
    "The pines after rain",
  );
  const payload = JSON.parse(
    (await recipient.locator("#track-data").textContent())!,
  );
  expect(payload.track.points).toEqual([]);
  expect(payload.gpx).toBe("");
  await recipient.close();
  await closePanel(page);
  await page.getByRole("button", { name: "Keepsake", exact: true }).click();
  await page.getByRole("button", { name: "Photos", exact: true }).click();
  await page.getByLabel("Photo caption", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save moments", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Photos", exact: true }).click();
  await expect(page.getByLabel("Photo caption", { exact: true })).toHaveValue(
    "",
  );
});

test("one stationary GPS fix can finish a hike", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 30.74,
    longitude: -89.08,
    accuracy: 5,
  });
  await page.clock.install();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByRole("button", { name: "Start Hike", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("latse_recording_draft_v1") || "{}")
            .points?.length,
      ),
    )
    .toBe(1);
  await page.clock.fastForward(10000);
  await page.getByRole("button", { name: "Finish hike" }).click();
  await page.getByRole("button", { name: "Save & customize" }).click();
  await expect(page.getByRole("button", { name: "Save PNG" })).toBeEnabled();
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("latse_saved_tracks_v1")!)[0],
  );
  expect(saved.points).toHaveLength(1);
  expect(saved.stats.totalDistKm).toBe(0);
  expect(saved.stats.durationSec).toBeGreaterThanOrEqual(10);
});

test("photo pins stay on the map and the exported story is interactive offline", async ({
  page,
  context,
}) => {
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".elevation-dock")).toBeVisible();
  await page
    .getByRole("slider", { name: "Interactive elevation profile", exact: true })
    .focus();
  await scrubTo(page, 40);
  await page.getByRole("button", { name: "Add trail moments" }).click();
  await page.locator('input[aria-label="Choose trail photos"]').setInputFiles({
    name: "Our forest pause.png",
    mimeType: "image/png",
    buffer: await testPhoto(page),
  });
  await page
    .getByPlaceholder("What will you remember?")
    .fill("A forest pause with friends");
  await page.getByRole("button", { name: "Save moments", exact: true }).click();
  await expect(page.locator(".trail-photo-pin img")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Collapse elevation scrubber" })
    .click();
  await page.getByRole("button", { name: /Open moment 4/ }).click();
  await expect(page.locator(".map-moment-card h2")).toHaveText(
    "A forest pause with friends",
  );
  await page.screenshot({ path: ".artifacts/overhaul/map-with-photo.png" });
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Photo map", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Share photo map", exact: true }),
  ).toBeEnabled();
  await expect(
    page
      .frameLocator('iframe[title="Interactive trail storyboard"]')
      .locator(".photo-pin img"),
  ).toHaveCount(1);
  await openStudioFiles(page);
  await page
    .getByRole("button", { name: "Open interactive map", exact: true })
    .click();
  const preview = page.frameLocator(
    'iframe[title="Interactive photo map preview"]',
  );
  await expect(preview.locator(".photo-pin img")).toHaveCount(1);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", {
        name: "Export Interactive Web File (.html)",
        exact: true,
      })
      .last()
      .click(),
  ]);
  const html = fs.readFileSync((await download.path())!, "utf8");
  const report = await context.newPage();
  report.on("pageerror", (error) => failures.get(page)!.push(error.message));
  await report.route("**/*", (route) => route.abort());
  await report.setContent(html);
  await expect(report.locator(".photo-pin img")).toHaveCount(1);
  await report.getByRole("button", { name: /Open moment 4/ }).click();
  await expect(report.locator("#pin-photo")).toBeVisible();
  await expect(report.locator("#pin-caption")).toHaveText(
    "A forest pause with friends",
  );
  const distance = await report.locator("#point-distance").textContent();
  await report
    .getByRole("button", { name: "Replay walk", exact: false })
    .click();
  await expect
    .poll(() => report.locator("#point-distance").textContent())
    .not.toBe(distance);
  await report
    .getByRole("button", { name: "Pause replay", exact: false })
    .click();
  await report.getByRole("button", { name: "Fit trail", exact: true }).click();
  await report.screenshot({
    path: ".artifacts/overhaul/shared-photo-map.png",
    fullPage: true,
  });
  await download.saveAs(".artifacts/overhaul/interactive-photo-map.html");
  await report.close();
});

test("Locate Me centers the map on the first acquired fix", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 45.8, longitude: 6.7, accuracy: 5 });
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("button", { name: "Locate Me", exact: true }).click();
  const marker = page.locator('.navigation-leaflet path[fill="#3477b9"]');
  await expect(marker).toHaveCount(1);
  await expect
    .poll(async () => {
      const [dot, stage] = await Promise.all([
        marker.boundingBox(),
        page.locator(".navigation-leaflet").boundingBox(),
      ]);
      return (
        !!dot &&
        !!stage &&
        Math.abs(dot.x + dot.width / 2 - stage.x - stage.width / 2) < 15 &&
        Math.abs(dot.y + dot.height / 2 - stage.y - stage.height / 2) < 15
      );
    })
    .toBe(true);
});

test("docked elevation scrubbing moves the amber map cursor and reveals nearby photos", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".elevation-dock")).toBeVisible();
  await page
    .getByRole("slider", { name: "Interactive elevation profile", exact: true })
    .focus();
  await scrubTo(page, 40);
  await page
    .getByRole("button", { name: "Add trail moments", exact: true })
    .click();
  await page.locator('input[aria-label="Choose trail photos"]').setInputFiles({
    name: "A little lookout.png",
    mimeType: "image/png",
    buffer: await testPhoto(page),
  });
  await page
    .getByPlaceholder("What will you remember?")
    .fill("A little lookout with friends");
  await page.getByRole("button", { name: "Save moments", exact: true }).click();
  await page
    .getByRole("slider", { name: "Interactive elevation profile", exact: true })
    .focus();
  const dock = await page.locator(".elevation-dock").boundingBox();
  const focusedSlider = await page
    .getByRole("slider", { name: "Interactive elevation profile", exact: true })
    .boundingBox();
  expect(dock!.height).toBe(148);
  expect(focusedSlider!.y).toBeGreaterThanOrEqual(dock!.y);
  expect(focusedSlider!.y + focusedSlider!.height).toBeLessThanOrEqual(
    dock!.y + dock!.height,
  );
  await lockedViewport(page);
  await scrubTo(page, 0);
  const cursor = page.locator('.navigation-leaflet path[fill="#C96E0C"]');
  const before = await cursor.getAttribute("d");
  await scrubTo(page, 40);
  await expect(page.locator(".map-moment-card h2")).toHaveText(
    "A little lookout with friends",
  );
  await expect(cursor).not.toHaveAttribute("d", before!);
  await page
    .getByRole("button", { name: "Collapse elevation scrubber" })
    .click();
  expect(
    (await page.locator(".map-collapsed-dock").boundingBox())!.height,
  ).toBe(48);
  await page.getByRole("button", { name: "Expand elevation scrubber" }).click();
  await expect(page.locator(".elevation-dock")).toBeVisible();
  await page
    .getByRole("slider", { name: "Interactive elevation profile", exact: true })
    .focus();
  await scrubTo(page, 40);
  await page.getByRole("button", { name: "Ghost Pace", exact: true }).click();
  await page
    .getByRole("button", { name: "Simulate Ghost Race", exact: true })
    .click();
  await expect(page.locator(".ghost-comparison")).toContainText(
    "Simulated preview",
  );
  await page.screenshot({ path: ".artifacts/overhaul/commercial-map.png" });
  await lockedViewport(page);
});

test("storyboard PNGs export both ratios and route codes respect privacy and reopen in Latse", async ({
  page,
  context,
}) => {
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Photos", exact: true }).click();
  await page
    .locator('input[aria-label="Choose trail photos"]')
    .setInputFiles([
      "public/images/valley.jpg",
      "public/images/alpine.jpg",
      "public/images/woodland.jpg",
    ]);
  await page.getByRole("button", { name: "Save moments", exact: true }).click();
  await page.getByRole("button", { name: "Photo map", exact: false }).click();
  await page.getByRole("button", { name: "Photo crop", exact: true }).click();
  const lead = page.getByRole("button", {
    name: "Lead photo: alpine",
    exact: true,
  });
  await lead.click();
  await expect(lead).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  for (const ratio of ["9:16", "4:5"]) {
    await chooseDesign(page, undefined, ratio);
    const save = page.getByRole("button", {
      name: "Save storyboard PNG",
      exact: true,
    });
    await expect(save).toBeEnabled();
    await canvasFits(page);
    await lockedViewport(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      save.click(),
    ]);
    expect(fs.readFileSync((await download.path())!).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    await download.saveAs(
      `.artifacts/overhaul/storyboard-${ratio.replace(":", "-")}.png`,
    );
  }
  await page.getByRole("button", { name: "Studio options" }).click();
  await page
    .getByRole("checkbox", { name: "Hide First/Last", exact: false })
    .check();
  await closePanel(page);
  await openStudioFiles(page);
  await page
    .getByRole("button", { name: "Copy / Share Trail Code", exact: true })
    .click();
  const code = await page
    .getByRole("textbox", { name: "Latse route code", exact: true })
    .inputValue();
  expect(code).toMatch(/^LATSE1:/);
  const decoded = JSON.parse(
    Buffer.from(
      code.slice(7).replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8"),
  );
  expect(decoded.points.length).toBeLessThan(113);
  expect(decoded.points.length).toBeGreaterThan(1);
  expect(
    decoded.points.every(
      (p: any) => p.time === undefined && p.wallTime === undefined,
    ),
  ).toBe(true);
  expect(JSON.stringify(decoded)).not.toContain("data:image");
  await page.screenshot({
    path: ".artifacts/overhaul/commercial-route-code.png",
  });
  const recipient = await context.newPage();
  recipient.on("pageerror", (error) => failures.get(page)!.push(error.message));
  await recipient.goto(`/?data=${encodeURIComponent(code)}`);
  await expect(
    recipient.getByRole("button", { name: /^Route details: Tuxachanie Trail/ }),
  ).toBeVisible();
  await expect(recipient.locator(".elevation-dock")).toBeVisible();
  await recipient.close();
});

test("photo vault survives reload even while the localStorage index rejects writes", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page
    .getByRole("button", { name: "Add trail moments", exact: true })
    .click();
  await page.locator('input[aria-label="Choose trail photos"]').setInputFiles({
    name: "Vault proof.png",
    mimeType: "image/png",
    buffer: await testPhoto(page),
  });
  await page
    .getByPlaceholder("What will you remember?")
    .fill("Safely saved in the photo vault");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "latse_saved_tracks_v1")
        throw new DOMException("Quota full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Save moments", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".trail-photo-pin img")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".trail-photo-pin img")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Collapse elevation scrubber" })
    .click();
  await page.getByRole("button", { name: /Open moment 4/ }).click();
  await expect(page.locator(".map-moment-card h2")).toHaveText(
    "Safely saved in the photo vault",
  );
  const saved = await page.evaluate(() =>
    localStorage.getItem("latse_saved_tracks_v1"),
  );
  expect(saved).not.toContain("data:image");
});

test("visible typography respects the minimum size on the core screens", async ({
  page,
}) => {
  for (const tab of ["Trails", "Map", "Record", "Studio"]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: tab, exact: true })
      .click();
    if (tab === "Studio")
      await expect(
        page.getByRole("button", { name: "Save PNG" }),
      ).toBeEnabled();
    const tiny = await page.locator(".latse-app").evaluate((root) =>
      Array.from(root.querySelectorAll<HTMLElement>("*"))
        .filter(
          (e) =>
            e.getBoundingClientRect().height &&
            Array.from(e.childNodes).some(
              (n) => n.nodeType === 3 && n.textContent?.trim(),
            ) &&
            parseFloat(getComputedStyle(e).fontSize) < 10,
        )
        .map((e) => [e.className, getComputedStyle(e).fontSize]),
    );
    expect(tiny).toEqual([]);
  }
});

test("photos persist in the localStorage fallback when IndexedDB is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.reload();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page
    .getByRole("button", { name: "Add trail moments", exact: true })
    .click();
  await page.locator('input[aria-label="Choose trail photos"]').setInputFiles({
    name: "Fallback photo.png",
    mimeType: "image/png",
    buffer: await testPhoto(page),
  });
  await page
    .getByPlaceholder("What will you remember?")
    .fill("Saved without IndexedDB");
  await page.getByRole("button", { name: "Save moments", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".trail-photo-pin img")).toHaveCount(1);
  const saved = await page.evaluate(() =>
    localStorage.getItem("latse_saved_tracks_v1"),
  );
  expect(
    JSON.parse(saved!)[0].pins.find((pin: any) => pin.photoDataUrl)
      .photoDataUrl,
  ).toMatch(/^data:image\/(?:jpeg|png|webp);base64,/);
});

test("a full fallback photo store keeps the editor and unsaved draft open", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined,
    });
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (value.includes('"photoDataUrl"'))
        throw new DOMException("Photo storage full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByRole("button", { name: "Pin Photo", exact: true }).click();
  await page.locator('input[aria-label="Choose trail photos"]').setInputFiles({
    name: "Keep me.png",
    mimeType: "image/png",
    buffer: await testPhoto(page),
  });
  await page.getByRole("button", { name: "Save moments", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Your trail moments", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("keep this draft open");
  await expect(page.locator(".unplaced-photos img")).toBeVisible();
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("latse_recording_draft_v1")!),
  );
  expect(draft.unplacedPhotos[0].photoRef).toBeTruthy();
});

test("a batch of camera originals becomes a persistent, selectable interactive storyboard", async ({
  page,
  context,
}) => {
  const latitude = 27 + 59 / 60 + 17 / 3600;
  const origin = Date.UTC(2024, 0, 2, 3);
  const route = {
    version: 1,
    name: "High pass story",
    points: Array.from({ length: 7 }, (_, i) => ({
      lat: latitude,
      lng: 86.9 + i * 0.01,
      ele: 1000 + i * 25,
      time: origin + i * 60000,
      wallTime: origin + 7200000 + i * 60000,
    })),
  };
  await page.goto(
    "/?data=LATSE1:" + Buffer.from(JSON.stringify(route)).toString("base64url"),
  );
  await expect(
    page.getByRole("button", { name: /Route details: High pass story/ }),
  ).toBeVisible();
  const openStoryboard = async () => {
    await page.getByRole("button", { name: "Studio", exact: true }).click();
    await page.getByRole("button", { name: "Photo map", exact: true }).click();
  };
  await openStoryboard();
  await page.getByRole("button", { name: "Photos" }).click();
  const jpeg = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 32;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#806540";
      ctx.fillRect(0, 0, 32, 32);
      return c.toDataURL("image/jpeg").split(",")[1];
    }),
    "base64",
  );
  const original = (name: string, gps: boolean, date: string) => ({
    name,
    mimeType: "image/jpeg",
    buffer: Buffer.concat([
      Buffer.from(jpegExif({ gps, date, offset: "+00:00" })),
      jpeg.subarray(2),
    ]),
  });
  await page
    .getByLabel("Choose trail photos")
    .setInputFiles([
      original("Ridge light.jpg", true, "2024:01:02 05:00:10"),
      original("Return crossing.jpg", false, "2024:01:02 05:04:30"),
      { name: "Unsited.jpg", mimeType: "image/jpeg", buffer: jpeg },
    ]);
  await expect(page.locator(".photo-strip-thumbnails img")).toHaveCount(3);
  await page.getByRole("button", { name: "Save moments", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await openStoryboard();
  const frame = page.frameLocator(
    'iframe[title="Interactive trail storyboard"]',
  );
  await expect(frame.locator(".photo-pin img")).toHaveCount(3);
  await frame
    .getByRole("button", { name: /Open moment .*Return crossing/ })
    .click();
  await expect(frame.locator("#pin-position")).toContainText("Time matched");
  await expect(frame.locator("#capture-time")).toContainText("Captured");
  const distance = await frame.locator("#point-distance").textContent();
  await frame
    .getByRole("button", { name: /Open moment .*Ridge light/ })
    .click();
  await expect(frame.locator("#pin-position")).toContainText("GPS matched");
  await expect(frame.locator("#point-distance")).not.toHaveText(distance!);
  await page.setViewportSize({ width: 390, height: 720 });
  await lockedViewport(page);
  expect((await frame.locator("#map").boundingBox())!.height).toBeGreaterThan(
    190,
  );
  await page.screenshot({
    path: ".artifacts/overhaul/interactive-storyboard.png",
  });
  const entry = await page.evaluate(
    () => JSON.parse(localStorage.getItem("latse_saved_tracks_v1")!)[0],
  );
  expect(entry.pins[0].captureLocation.lng).toBeCloseTo(86.925);
  expect(entry.pins[0].lng).toBeCloseTo(86.925);
  expect(entry.pins[1].lng).toBeCloseTo(86.945);
  expect(entry.pins[1].timestamp).toBe(Date.parse("2024-01-02T05:04:30Z"));
  expect(entry.pins[2].timeSource).toBe("file");
  await page.getByRole("button", { name: "Photos" }).click();
  await page.locator(".story-photo-picker summary").click();
  await page
    .getByRole("checkbox", { name: "Include Ridge light in storyboard" })
    .uncheck();
  await page
    .getByRole("checkbox", { name: "Include Unsited in storyboard" })
    .uncheck();
  await page.getByRole("button", { name: "Save moments", exact: true }).click();
  await expect(frame.locator(".photo-pin img")).toHaveCount(1);
  await openStudioFiles(page);
  await page.getByRole("checkbox", { name: /Hide First\/Last/ }).check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", {
        name: "Export Interactive Web File (.html)",
        exact: true,
      })
      .click(),
  ]);
  const html = fs.readFileSync((await download.path())!, "utf8");
  const recipient = await context.newPage();
  await recipient.route("**/*", (route) => route.abort());
  await recipient.setContent(html);
  await expect(recipient.locator(".photo-pin img")).toHaveCount(1);
  await recipient
    .getByRole("button", { name: /Open moment .*Return crossing/ })
    .click();
  await expect(recipient.locator("#capture-time")).toHaveText(
    "Capture time hidden",
  );
  const payload = await recipient.locator("#track-data").textContent();
  for (const privateValue of [
    "Ridge light",
    "Unsited",
    "captureLocation",
    String(entry.pins[1].timestamp),
  ])
    expect(payload).not.toContain(privateValue);
  await recipient.close();
});

test("unit choices persist and the interactive preview always shares a PNG", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "KM / M", exact: true }).click();
  await closePanel(page);
  await expect(page.locator(".journey-stats")).toContainText("19.3 km");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "MI / FT", exact: true }).click();
  await closePanel(page);
  await expect(page.locator(".journey-stats")).toContainText("12.0 mi");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "MI / FT", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await closePanel(page);
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: /Photo map/ }).click();
  await expect(
    page
      .frameLocator('iframe[title="Interactive trail storyboard"]')
      .locator("#map"),
  ).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Share photo map", exact: true }).click(),
  ]);
  expect(fs.readFileSync((await download.path())!).subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  await lockedViewport(page);
});

test("free roam tap traces, map photo positioning, layers and save-to-Studio work together", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page
    .getByRole("button", { name: "🧭 Free Roam / Trace", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Exit Roam", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tap trace", exact: true }).click();
  const map = page.getByLabel("Interactive trail map", { exact: true }),
    box = (await map.boundingBox())!;
  for (const [x, y] of [
    [0.2, 0.4],
    [0.45, 0.5],
    [0.65, 0.35],
  ])
    await map.click({ position: { x: box.width * x, y: box.height * y } });
  await page.getByRole("button", { name: "Tap trace", exact: true }).click();
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page.getByLabel("Choose trail photos").setInputFiles({
    name: "A park corner.png",
    mimeType: "image/png",
    buffer: await testPhoto(page),
  });
  const picker = page.getByRole("application", {
      name: "Tap map to position photo",
    }),
    area = (await picker.boundingBox())!;
  await picker.click({
    position: { x: area.width * 0.75, y: area.height * 0.6 },
  });
  await page.getByRole("button", { name: "Save moments", exact: true }).click();
  await expect(page.locator(".trail-photo-pin img")).toHaveCount(1);
  await page.getByRole("button", { name: "Map layers", exact: true }).click();
  await page.route(/server\.arcgisonline\.com/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#384d39"/></svg>',
    }),
  );
  await page.getByRole("button", { name: "Satellite", exact: true }).click();
  await expect(page.locator(".leaflet-control-attribution")).toContainText(
    "Esri",
  );
  await page.getByRole("button", { name: "Finish roam", exact: true }).click();
  await page
    .getByRole("button", { name: "Save & customize", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Hike Studio", exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("latse_saved_tracks_v1")!)[0],
  );
  expect(saved.freeRoam).toBe(true);
  expect(saved.points.length).toBeGreaterThanOrEqual(3);
  expect(saved.pins[0].offTrail).toBe(true);
  expect(saved.stats.totalDistKm).toBeGreaterThan(0);
});

test("Pocket Lock holds to unlock and paused SOS retains the latest GPS altitude and coordinates", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).wakeRequests = 0;
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async () => {
          (window as any).wakeRequests++;
          return {
            released: false,
            release: async () => {},
            addEventListener: () => {},
          };
        },
      },
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: (success: PositionCallback) => {
          queueMicrotask(() =>
            success({
              coords: {
                latitude: 37.77,
                longitude: -122.42,
                altitude: 900,
                accuracy: 5,
              },
              timestamp: Date.now(),
            } as GeolocationPosition),
          );
          return 1;
        },
        clearWatch: () => {},
      },
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByRole("button", { name: "Start Hike", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).wakeRequests))
    .toBeGreaterThan(0);
  await expect(page.locator(".recorder-profile")).toContainText("GPS fixes");
  await page
    .getByRole("button", { name: "Pocket Lock / Battery Saver", exact: true })
    .click();
  const pocket = page.getByRole("dialog", { name: "Pocket Lock", exact: true });
  await expect(pocket).toBeVisible();
  const unlock = pocket.getByRole("button", {
      name: "Slide right or hold 1.5s to Unlock",
    }),
    box = (await unlock.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1600);
  await page.mouse.up();
  await expect(pocket).toHaveCount(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "SOS", exact: true }).click();
  await expect(page.locator(".safety-coordinate")).toContainText("37.7700");
  await expect(page.locator(".safety-readout")).toContainText("2,953 ft");
});

test("finger drawing survives reload and is saved before a live walking trace starts", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: (success: PositionCallback) => {
          queueMicrotask(() =>
            success({
              coords: {
                latitude: 37.75,
                longitude: -119.58,
                altitude: 1200,
                accuracy: 5,
              },
              timestamp: Date.now(),
            } as GeolocationPosition),
          );
          return 1;
        },
        clearWatch: () => {},
      },
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page
    .getByRole("button", { name: "🧭 Free Roam / Trace", exact: true })
    .click();
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  const map = page.getByLabel("Interactive trail map", { exact: true });
  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.4);
  await page.mouse.down();
  for (let step = 0; step < 5; step++) {
    await page.mouse.move(
      box.x + box.width * (0.2 + step * 0.1),
      box.y + box.height * (0.4 + (step % 2) * 0.1),
    );
    await page.waitForTimeout(140);
  }
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("latse_roam_draft_v1") ?? "null")
            ?.points?.length ?? 0,
      ),
    )
    .toBeGreaterThanOrEqual(3);
  await page.reload();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page
    .getByRole("button", { name: "🧭 Free Roam / Trace", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Undo point", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Walk trace", exact: true }).click();
  await page
    .getByRole("button", { name: "Save drawing & walk", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause walk", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("latse_recording_draft_v1") ?? "null")
            ?.points?.length ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("latse_saved_tracks_v1")!),
  );
  expect(saved).toHaveLength(1);
  expect(saved[0].source).toBe("planned");
  expect(saved[0].points.length).toBeGreaterThanOrEqual(3);
  await expect(
    page.getByRole("button", { name: "Draw", exact: true }),
  ).toBeDisabled();
  await lockedViewport(page);
});

test("blank free-roam notes are safe and map markers select and drag moments", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page
    .getByRole("button", { name: "🧭 Free Roam / Trace", exact: true })
    .click();
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page
    .getByRole("button", { name: "Add field note", exact: true })
    .click();
  const picker = page.getByRole("application", {
    name: "Tap map to position photo",
  });
  expect((await picker.boundingBox())!.height).toBe(240);
  await page
    .getByPlaceholder("What will you remember?")
    .fill("A quiet park corner");
  let box = (await picker.boundingBox())!;
  await picker.click({
    position: { x: box.width * 0.7, y: box.height * 0.55 },
  });
  const before = await page.locator(".placement-readout").innerText();
  const active = picker.locator(".placement-pin"),
    at = (await active.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2 - 50, at.y + at.height / 2 - 25, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.locator(".placement-readout")).not.toHaveText(before);
  await page
    .getByRole("button", { name: "Add field note", exact: true })
    .click();
  await page
    .getByPlaceholder("What will you remember?")
    .fill("A second corner");
  await picker
    .locator('[title="Select moment 1: A quiet park corner"]')
    .click();
  await expect(page.getByPlaceholder("What will you remember?")).toHaveValue(
    "A quiet park corner",
  );
  await page.getByRole("button", { name: "Save moments", exact: true }).click();
  await expect(page.locator(".trail-photo-pin")).toHaveCount(2);
  await page.getByRole("button", { name: "Finish roam", exact: true }).click();
  await page
    .getByRole("button", { name: "Save & customize", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Hike Studio", exact: true }),
  ).toBeVisible();
  await lockedViewport(page);
});

test("Studio editions survive tab changes and reload with editable words and unit-aware privacy", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await chooseDesign(page, "Atlas", "4:5");
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByText("Print details", { exact: true }).click();
  await page.getByRole("button", { name: "Modern", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Our first ridgeline");
  await page
    .getByLabel("Personal note", { exact: true })
    .fill("We made it together");
  await page.getByLabel("Date line", { exact: true }).fill("A day to remember");
  await page.getByText("Small labels & signature", { exact: true }).click();
  await page.getByLabel("Signature", { exact: true }).fill("THE RIVERS FAMILY");
  await page
    .getByLabel("Footer note", { exact: true })
    .fill("More days like this.");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Studio options", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /Hide First\/Last/ }).check();
  await expect(
    page.getByRole("checkbox", { name: /Hide First\/Last/ }),
  ).toHaveAccessibleName(/0.3 mi/);
  await closePanel(page);
  await openStudioCover(page);
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await closePanel(page);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play Story", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByText("Print details", { exact: true }).click();
  for (const name of ["Atlas", "Post · 4:5", "Modern"])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Our first ridgeline",
  );
  await expect(page.getByLabel("Personal note", { exact: true })).toHaveValue(
    "We made it together",
  );
  await expect(page.getByLabel("Date line", { exact: true })).toHaveValue(
    "A day to remember",
  );
  await page.getByText("Small labels & signature", { exact: true }).click();
  await expect(page.getByLabel("Signature", { exact: true })).toHaveValue(
    "THE RIVERS FAMILY",
  );
  await expect(page.getByLabel("Footer note", { exact: true })).toHaveValue(
    "More days like this.",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await openStudioCover(page);
  await expect(
    page.getByRole("button", { name: "Top", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await closePanel(page);
  await lockedViewport(page);
  const save = page.getByRole("button", { name: "Save PNG", exact: true });
  await expect(save).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    save.click(),
  ]);
  await download.saveAs(".artifacts/overhaul/personalized-keepsake-4-5.png");
});

test("Pocket Lock traps focus and supports a 120px slide", async ({ page }) => {
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByRole("button", { name: "Start Hike", exact: true }).click();
  await page
    .getByRole("button", { name: "Pocket Lock / Battery Saver", exact: true })
    .click();
  const pocket = page.getByRole("dialog", { name: "Pocket Lock", exact: true });
  const unlock = pocket.getByRole("button", {
    name: "Slide right or hold 1.5s to Unlock",
    exact: true,
  });
  await expect(unlock).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(unlock).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(unlock).toBeFocused();
  const box = (await unlock.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 145, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(pocket).toHaveCount(0);
});

test("intentional resume suppresses gap warnings and paused SOS rejects stale telemetry", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const callbacks = new Map<number, PositionCallback>();
    let next = 0;
    const old = {
      coords: { latitude: 37, longitude: -122, altitude: 100, accuracy: 5 },
      timestamp: Date.now(),
    } as GeolocationPosition;
    let current = old;
    (window as any).__staleOnWatch = false;
    (window as any).__emitGPS = (latitude: number, altitude: number) => {
      current = {
        coords: { latitude, longitude: -122, altitude, accuracy: 5 },
        timestamp: Date.now(),
      } as GeolocationPosition;
      callbacks.forEach((success) => success(current));
    };
    localStorage.setItem("latse_location_asked", "1");
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: (success: PositionCallback) => {
          const id = ++next;
          callbacks.set(id, success);
          queueMicrotask(() =>
            success((window as any).__staleOnWatch ? old : current),
          );
          return id;
        },
        clearWatch: (id: number) => callbacks.delete(id),
      },
    });
  });
  await page.clock.install();
  await page.reload();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByRole("button", { name: "Start Hike", exact: true }).click();
  await expect(page.locator(".recorder-profile")).toContainText("GPS fixes");
  await page.clock.fastForward(1000);
  await page.evaluate(() => (window as any).__emitGPS(37.003, 900));
  await expect(page.locator(".recorder-profile")).toContainText("2,953 ft");
  await page.evaluate(() => ((window as any).__staleOnWatch = true));
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "SOS", exact: true }).click();
  await expect(page.locator(".safety-coordinate")).toContainText("37.0030");
  await expect(page.locator(".safety-readout")).toContainText("2,953 ft");
  await closePanel(page);
  await page.clock.fastForward(300001);
  await page.evaluate(() => ((window as any).__staleOnWatch = false));
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.evaluate(() => (window as any).__emitGPS(37.006, 910));
  await expect(page.locator(".gps-gap-notice")).toHaveCount(0);
  await page.clock.fastForward(300001);
  await page.evaluate(() => (window as any).__emitGPS(37.009, 920));
  await expect(page.locator(".gps-gap-notice")).toContainText("battery saver");
  await page.getByRole("button", { name: "Restart hike", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset recording", exact: true })
    .click();
  await expect(page.locator(".gps-gap-notice")).toHaveCount(0);
});

test("finishing offers simple save choices and opens the requested destination", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: (_: unknown, fail: PositionErrorCallback) => {
          queueMicrotask(() =>
            fail({ code: 1, message: "Denied" } as GeolocationPositionError),
          );
          return 1;
        },
        clearWatch: () => {},
      },
    });
  });
  await page.reload();
  await page.clock.install();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page
    .getByLabel("Hike title", { exact: true })
    .fill("A quiet afternoon");
  await page.getByRole("button", { name: "Start Hike", exact: true }).click();
  await page.clock.fastForward(2000);
  await page.getByRole("button", { name: "Finish hike", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "How would you like to keep it?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to my hike", exact: true })
    .click();
  await expect(page.getByLabel("Active hike time")).not.toHaveText("00:00:00");
  await page.getByRole("button", { name: "Finish hike", exact: true }).click();
  await page
    .getByRole("button", { name: "Just save my hike", exact: false })
    .click();
  await page
    .getByLabel("Hike name", { exact: true })
    .fill("A quiet afternoon, kept");
  await page.screenshot({
    path: ".artifacts/overhaul/finish-save-choices.png",
  });
  await page
    .getByRole("button", { name: "Save to My Hikes", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Trails", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".journey-title h2")).toHaveText(
    "A quiet afternoon, kept",
  );
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByLabel("Active hike time")).toHaveText("00:00:00");
  await page
    .getByLabel("Hike title", { exact: true })
    .fill("The photo way home");
  await page.getByRole("button", { name: "Start Hike", exact: true }).click();
  await page.clock.fastForward(3000);
  await page.getByRole("button", { name: "Finish hike", exact: true }).click();
  await page
    .getByRole("button", { name: "Create a photo map", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Save & customize", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Photo map", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Place photos on map", exact: true }),
  ).toBeEnabled();
  const hikes = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("latse_saved_tracks_v1")!),
  );
  expect(hikes).toHaveLength(2);
  expect(
    hikes.find((h: any) => h.name === "The photo way home")
      .preferredPresentation,
  ).toBe("map");
  await lockedViewport(page);
});

test("edits and deletions of sample trail notes survive reopening the library", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Photos", exact: true }).click();
  await page
    .getByLabel("Field note", { exact: true })
    .fill("Our own words, without a stock caption.");
  await page.getByRole("button", { name: /Edit moment 1:/ }).click();
  await page
    .getByRole("button", { name: "Remove this moment", exact: true })
    .click();
  await page.getByRole("button", { name: "Save moments", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Photos", exact: true }).click();
  await expect(page.getByLabel("Field note", { exact: true })).toHaveValue(
    "Our own words, without a stock caption.",
  );
  await expect(page.locator(".photo-strip-thumbnails button")).toHaveCount(2);
});

test("photo maps load geography immediately and retain a useful offline state", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Photo map", exact: true }).click();
  const frame = page.frameLocator(
    'iframe[title="Interactive trail storyboard"]',
  );
  await expect(frame.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await expect(
    frame.getByRole("button", { name: "Map style: Outdoor", exact: true }),
  ).toBeVisible();
  await expect(frame.locator("#map-load-state")).toBeHidden();
  await page.screenshot({
    path: ".artifacts/overhaul/map-background-on-arrival.png",
  });
  await page.route(/tile\.openstreetmap\.org/, (route) => route.abort());
  await page.getByRole("button", { name: "Keepsake", exact: true }).click();
  await page.getByRole("button", { name: "Photo map", exact: true }).click();
  await expect(frame.locator("#map-load-state")).toContainText(
    "route & photos remain available",
  );
  await expect(frame.locator("#map-load-state")).toBeVisible();
  await expect(
    frame.locator(".leaflet-overlay-pane path").first(),
  ).toBeVisible();
});

test("a chosen cover really reaches the artwork, responds live to crop, and survives reopening", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await chooseDesign(page, "Atlas", "4:5");
  await page
    .getByRole("button", { name: "Cover photo & crop", exact: true })
    .click();
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 380;
    canvas.height = 1600;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ed231b";
    ctx.fillRect(0, 0, 380, 800);
    ctx.fillStyle = "#1959e5";
    ctx.fillRect(0, 800, 380, 800);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[aria-label="Choose trail photos"]').setInputFiles({
    name: "Our-cover.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await expect(page.locator(".studio-cover-proof")).toHaveAttribute(
    "src",
    /^data:image/,
  );
  const rgb = () =>
    page
      .locator(".studio-canvas-stage canvas")
      .evaluate((canvas: HTMLCanvasElement) =>
        [...canvas.getContext("2d")!.getImageData(246, 475, 1, 1).data].slice(
          0,
          3,
        ),
      );
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await expect
    .poll(async () => {
      const p = await rgb();
      return p[0] > 200 && p[2] < 60;
    })
    .toBe(true);
  await page.getByRole("button", { name: "Bottom", exact: true }).click();
  await expect
    .poll(async () => {
      const p = await rgb();
      return p[2] > 180 && p[0] < 60;
    })
    .toBe(true);
  await expect(page.locator(".studio-canvas-stage")).toBeVisible();
  await expect(page.locator(".studio-editor")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: ".artifacts/overhaul/cover-live-crop.png" });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const value = JSON.parse(
          localStorage.getItem("latse_studio_cfg_demo-tuxachanie")!,
        );
        return !!value.coverPhotoId && value.backgroundPhotoUrl === null;
      }),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect
    .poll(async () => {
      const p = await rgb();
      return p[2] > 180 && p[0] < 60;
    })
    .toBe(true);
});

test("design and text changes repaint the visible print before the editor is closed", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save PNG", exact: true }),
  ).toBeEnabled();
  const pixels = () =>
    page
      .locator(".studio-canvas-stage canvas")
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.getByRole("button", { name: "Design", exact: true }).click();
  const first = await pixels();
  await expect(
    page.locator('.studio-style-proof canvas[data-ready="true"]'),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  await expect.poll(pixels).not.toBe(first);
  await expect(
    page.getByRole("region", { name: "Design your keepsake", exact: true }),
  ).toBeVisible();
  const bounds = await page.locator(".studio-canvas-stage").boundingBox(),
    editor = await page.locator(".studio-editor").boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(editor!.y + 1);
  const second = await pixels();
  await page.getByRole("button", { name: "Story · 9:16", exact: true }).click();
  await expect.poll(pixels).not.toBe(second);
  await page.screenshot({
    path: ".artifacts/overhaul/design-live-preview.png",
  });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  const third = await pixels();
  await page.getByLabel("Title", { exact: true }).fill("The quiet way home");
  await expect.poll(pixels).not.toBe(third);
  await expect(
    page.getByRole("region", { name: "Make the words yours", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await lockedViewport(page);
  await page.getByRole("button", { name: "Full preview", exact: true }).click();
  const full = page.getByRole("dialog", { name: "Keepsake preview" });
  await expect(
    full.getByRole("img", { name: "Print of The quiet way home" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(full).toHaveCount(0);
});

test("a sparse quick route with legacy hidden charts still produces a finished print and a photo-led journal", async ({
  page,
}) => {
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await button("Add route").click();
  await page
    .getByRole("button", { name: /Draw \/ Tap Quick Route on Map/ })
    .click();
  for (const position of [
    { x: 69, y: 178 },
    { x: 168, y: 103 },
    { x: 236, y: 160 },
  ])
    await page.locator(".quick-route-map").click({ position });
  await button("Use this quick route").click();
  await page.getByRole("button", { name: /Use this trail/ }).click();
  await button("Studio").click();
  await button("Design").click();
  await button("Story · 9:16").click();
  await page.getByText("Print details", { exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Hike statistics", exact: true })
    .uncheck();
  await page
    .getByRole("checkbox", { name: "Elevation profile", exact: true })
    .uncheck();
  await button("Done").click();
  const save = button("Save PNG");
  await expect(save).toBeEnabled();
  const stage = page.locator(".studio-canvas-stage canvas");
  const pixels = await stage.evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")!;
    return [24, 261].map((x) => [...ctx.getImageData(x, 1280, 1, 1).data]);
  });
  expect(pixels[0]).not.toEqual(pixels[1]);
  const [routePrint] = await Promise.all([
    page.waitForEvent("download"),
    save.click(),
  ]);
  await routePrint.saveAs(".artifacts/overhaul/quick-route-only.png");

  await button("Photos").click();
  await page
    .getByLabel("Choose trail photos", { exact: true })
    .setInputFiles("public/images/woodland.jpg");
  await button("Save moments").click();
  await button("Photo map").click();
  await button("Picture preview").click();
  const saveMap = button("Save storyboard PNG");
  await expect(saveMap).toBeEnabled();
  const lower = await stage.evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")!;
    return [24, 261].map((x) => [...ctx.getImageData(x, 1550, 1, 1).data]);
  });
  expect(lower[0]).not.toEqual(lower[1]);
  const [journalPrint] = await Promise.all([
    page.waitForEvent("download"),
    saveMap.click(),
  ]);
  await journalPrint.saveAs(".artifacts/overhaul/quick-route-one-photo.png");
  await page.screenshot({
    path: ".artifacts/overhaul/quick-route-journal-studio.png",
  });
  await lockedViewport(page);
});

test("a missing saved cover can be replaced without leaving a stale warning", async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "latse_studio_cfg_demo-tuxachanie",
      JSON.stringify({
        template: "topo-card",
        coverPhotoId: "latse_studio_cover_v1:demo-tuxachanie",
        backgroundPhotoUrl: null,
      }),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(page.locator(".studio-stage-notice")).toContainText(
    "Your cover photo is unavailable",
  );
  await page
    .getByRole("button", { name: "Cover photo & crop", exact: true })
    .click();
  await page.getByText("Landscape covers", { exact: true }).click();
  await page
    .getByRole("button", { name: "Alpenglow cover", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save PNG", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".studio-stage-notice")).toHaveCount(0);
});
