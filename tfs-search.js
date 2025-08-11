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

    await browser.close();
  } catch (error) {
    console.error("Error occurred:", error);
    process.exit(1);
  }
})();
