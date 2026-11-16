import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";

test.use({ serviceWorkers: "allow" });
test("an installed PWA activates a changed production worker and refreshes its stale cached page", async ({
  page,
}) => {
  const root = path.resolve("dist");
  let version = 1;
  const mime: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".webmanifest": "application/manifest+json",
  };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const file = path.resolve(
      root,
      "." +
        decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (
      !file.startsWith(root + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      response.writeHead(404);
      response.end();
      return;
    }
    const extension = path.extname(file);
    let content: Buffer | string = fs.readFileSync(file);
    if (url.pathname === "/sw.js") {
      content = content
        .toString()
        .replace(
          /(url:"index.html",revision:")[^"]+(")/,
          (_, a, b) => a + "release-fixture-" + version + b,
        );
      content +=
        '\nself.addEventListener("message",event=>{if(event.data==="LATSE_TEST_VERSION")event.ports[0].postMessage(' +
        version +
        ");});";
    } else if (file === path.join(root, "index.html")) {
      content = content
        .toString()
        .replace("<html", '<html data-release-fixture="' + version + '"');
    }
    response.writeHead(200, {
      "Content-Type": mime[extension] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number },
    origin = "http://127.0.0.1:" + address.port;
  try {
    await page.goto(origin);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    await expect(page.locator("html")).toHaveAttribute(
      "data-release-fixture",
      "1",
    );
    version = 2;
    await Promise.all([
      page.waitForEvent("domcontentloaded"),
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration!.update();
      }),
    ]);
    await expect(page.locator("html")).toHaveAttribute(
      "data-release-fixture",
      "2",
    );
    const activeVersion = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = (event) => resolve(event.data);
          navigator.serviceWorker.controller!.postMessage(
            "LATSE_TEST_VERSION",
            [channel.port2],
          );
        }),
    );
    expect(activeVersion).toBe(2);
    expect(
      await page.evaluate(
        async () =>
          !!(await navigator.serviceWorker.getRegistration())?.waiting,
      ),
    ).toBe(false);
    await expect(
      page.getByRole("region", { name: "Trails", exact: true }),
    ).toBeVisible();
  } finally {
    await page
      .evaluate(async () => {
        for (const reg of await navigator.serviceWorker.getRegistrations())
          await reg.unregister();
      })
      .catch(() => undefined);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
