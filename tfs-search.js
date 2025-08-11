const puppeteer = require("puppeteer");

(async () => {
  try {
    const searchName = process.env.SEARCH_NAME || "";
    const searchId = process.env.SEARCH_ID || "";

    if (!searchName && !searchId) {
      console.error("❌ No search name or ID provided.");
      process.exit(1);
    }

    console.log(`🔍 Searching for Name: "${searchName}", ID: "${searchId}"`);

    const isCI = !!process.env.GITHUB_ACTIONS;

    const browser = await puppeteer.launch({
      headless: true,
      args: isCI ? ["--no-sandbox", "--disable-setuid-sandbox"] : []
    });

    const page = await browser.newPage();

    // Replace with the real TFS search URL
    await page.goto("https://tfs.fic.gov.za/Pages/Search", {
      waitUntil: "networkidle2"
    });

    // Adjust these selectors to match the actual page input fields
    if (searchName) {
      await page.type('input[name="txtName"]', searchName);
    }
    if (searchId) {
      await page.type('input[name="txtIDNumber"]', searchId);
    }

    // Submit the form — adjust selector if needed
    await Promise.all([
      page.click('input[type="submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle2" }),
    ]);

    // Save results to PDF
    await page.pdf({
      path: "tfs-results.pdf",
      format: "A4"
    });

    console.log("✅ PDF saved as tfs-results.pdf");

    await browser.close();
  } catch (error) {
    console.error("❌ Error in Puppeteer script:", error);
    process.exit(1);
  }
})();
