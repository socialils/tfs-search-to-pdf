const puppeteer = require("puppeteer");
const fs = require("fs");

(async () => {
  try {
    const name = process.env.SEARCH_NAME || "";
    const idNumber = process.env.SEARCH_ID || "";

    console.log(`Searching TFS for Name: ${name}, ID: ${idNumber}`);

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
    const page = await browser.newPage();

    await page.goto("https://tfs.fic.gov.za/Pages/Search", { waitUntil: "networkidle2" });

    // Wait for iframe and get frame context
    const frameHandle = await page.waitForSelector('iframe');
    const frame = await frameHandle.contentFrame();

    // Wait for inputs and fill them
    if (name) {
      await frame.waitForSelector('input[name="txtName"]', { timeout: 5000 });
      await frame.type('input[name="txtName"]', name);
    }
    if (idNumber) {
      await frame.waitForSelector('input[name="txtIDNumber"]', { timeout: 5000 });
      await frame.type('input[name="txtIDNumber"]', idNumber);
    }

    // Click search and wait for navigation
    await Promise.all([
      frame.click('#btnSearchPerson'),
      frame.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);

    // Export PDF of full page
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });

    fs.writeFileSync("tfs-results.pdf", pdfBuffer);

    console.log("PDF saved as tfs-results.pdf");

    await browser.close();
  } catch (error) {
    console.error("Error occurred:", error);
    process.exit(1);
  }
})();
