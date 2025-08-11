const puppeteer = require("puppeteer");
const fs = require("fs");

(async () => {
  let browser;
  try {
    const name = process.env.SEARCH_NAME || "";
    const idNumber = process.env.SEARCH_ID || "";

    console.log(`Searching TFS for Name: ${name}, ID: ${idNumber}`);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });
    const page = await browser.newPage();

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto("https://tfs.fic.gov.za/Pages/Search", { waitUntil: "networkidle2" });

    await page.screenshot({ path: "page.png", fullPage: true });
    const html = await page.content();
    fs.writeFileSync("page.html", html);
    console.log("Saved page screenshot and HTML for debugging");

    await page.waitForSelector("body", { timeout: 10000 });

    const nameInputExists = await page.$('input[name="txtName"]') !== null;
    console.log("Name input exists?", nameInputExists);

    if (nameInputExists) {
      if (name) {
        await page.type('input[name="txtName"]', name);
      }
      if (idNumber) {
        await page.type('input[name="txtIDNumber"]', idNumber);
      }

      await Promise.all([
        page.click("#btnSearchPerson"),
        page.waitForNavigation({ waitUntil: "networkidle2" }),
      ]);

      const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
      fs.writeFileSync("tfs-results.pdf", pdfBuffer);
      console.log("PDF saved as tfs-results.pdf");
    } else {
      throw new Error("Name input field not found on page.");
    }

    await browser.close();
  } catch (error) {
    console.error("Error occurred:", error);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
