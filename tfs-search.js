const puppeteer = require("puppeteer");

(async () => {
  try {
    // Pull inputs from environment variables
    const searchName = process.env.SEARCH_NAME || "";
    const searchId = process.env.SEARCH_ID || "";

    if (!searchName && !searchId) {
      console.error("❌ No search name or ID provided.");
      process.exit(1);
    }

    console.log(`🔍 Searching for Name: "${searchName}", ID: "${searchId}"`);

    // Detect GitHub Actions environment
    const isCI = !!process.env.GITHUB_ACTIONS;

    const browser = await puppeteer.launch({
      headless: true,
      args: isCI ? ["--no-sandbox", "--disable-setuid-sandbox"] : []
    });

    const page = await browser.newPage();

    // Go to target site
    await page.goto("https://www.example.com/search", {
      waitUntil: "networkidle2"
    });

    // Fill search form if fields are provided
    if (searchName) {
      await page.type("#nameInput", searchName);
    }
    if (searchId) {
      await page.type("#idInput", searchId);
    }

    // Submit form
    await page.click("#submitButton");
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // Save results page to PDF
    await page.pdf({
      path: "tfs-results.pdf",
      format: "A4"
    });

    console.log("✅ Search complete. PDF saved as tfs-results.pdf");

    await browser.close();
  } catch (err) {
    console.error("❌ Error running Puppeteer script:", err);
    process.exit(1);
  }
})();
