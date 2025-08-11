const puppeteer = require("puppeteer");
const fs = require("fs");

(async () => {
  const searchName = process.env.SEARCH_NAME || "";
  const searchId = process.env.SEARCH_ID || "";

  console.log(`Searching TFS for Name: ${searchName}, ID: ${searchId}`);

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  await page.goto("https://tfs.dev/yoursearchpage", { waitUntil: "networkidle2" });

  // Try multiple possible selectors for the name field
  const nameSelectors = ['input[name="Name"]', '#Name', 'input[placeholder*="Name"]'];
  let nameSelector = null;
  for (const sel of nameSelectors) {
    if (await page.$(sel)) {
      nameSelector = sel;
      break;
    }
  }

  if (!nameSelector) {
    console.error("Name input field not found on page.");
    await fs.promises.writeFile("page.html", await page.content());
    await page.screenshot({ path: "page.png", fullPage: true });
    console.log("Saved page screenshot and HTML for debugging.");
    await browser.close();
    process.exit(1);
  }

  // Same approach for ID field
  const idSelectors = ['input[name="ID"]', '#ID', 'input[placeholder*="ID"]'];
  let idSelector = null;
  for (const sel of idSelectors) {
    if (await page.$(sel)) {
      idSelector = sel;
      break;
    }
  }

  // Fill the form
  await page.type(nameSelector, searchName);
  if (idSelector) {
    await page.type(idSelector, searchId);
  }

  // Click search button
  const searchButton = await page.$('button[type="submit"], input[type="submit"]');
  if (searchButton) {
    await searchButton.click();
    await page.waitForNavigation({ waitUntil: "networkidle2" });
  }

  // Save PDF of results
  await page.pdf({ path: "tfs-results.pdf", format: "A4" });

  await browser.close();
})();
