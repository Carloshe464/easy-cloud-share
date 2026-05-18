const fastify = require("fastify")({ logger: false });
const { chromium } = require("playwright");

fastify.get("/extract", async (request, reply) => {
  const { url } = request.query;
  if (!url) return reply.code(400).send({ error: "Missing url param" });

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    let streamUrl = null;

    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("google") || u.includes("analytics") || u.includes("doubleclick") || u.includes("thumbnail"))
        return;

      if (u.includes("freeterabox.com/video") || (u.includes("share/streaming") && u.includes("M3U8_FLV"))) {
        console.log("intercepted stream:", u);
        if (!streamUrl) streamUrl = u;
      }
    });

    page.on("response", async (res) => {
      const u = res.url();
      if (u.includes("share/streaming") && u.includes("M3U8_FLV")) {
        try {
          const json = await res.json();
          console.log("streaming response:", JSON.stringify(json).slice(0, 500));
        } catch {}
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    const playSelectors = [
      "video",
      ".play-btn",
      ".play-button",
      '[class*="play"]',
      'button[aria-label*="play"]',
      ".nd-player-play-btn",
    ];
    for (const sel of playSelectors) {
      try {
        await page.click(sel, { timeout: 2000 });
        console.log("clicked:", sel);
        break;
      } catch {}
    }

    await page.waitForTimeout(8000);

    if (!streamUrl) {
      streamUrl = await page.evaluate(() => {
        const v = document.querySelector("video");
        return v ? v.src || v.currentSrc : null;
      });
    }

    const title = await page.title();
    return { url: streamUrl, title };
  } catch (err) {
    return reply.code(500).send({ error: "Failed", detail: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

fastify.get("/health", async () => ({ status: "ok" }));
fastify.listen({ port: process.env.PORT || 8080, host: "0.0.0.0" });
