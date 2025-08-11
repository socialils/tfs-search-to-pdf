const puppeteer = require("puppeteer");
const fs = require("fs");

(async () => {
    const name = process.env.SEARCH_NAME || "";
    const idNumber = process.env.SEARCH_ID || "";

    console.log(`Searching TFS for Name: ${name}, ID: ${idNumber}`);

    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();

    // Go to TFS search page
    await page.goto("https://tfs.fic.gov.za/Pages/Search", { waitUntil: "networkidle2" });

    // Select "Person" tab
    await page.click("#tabPerson");

    // Fill form fields
    if (name) {
        await page.type("#txtName", name);
    }
    if (idNumber) {
        await page.type("#txtIDNumber", idNumber);
    }

    // Click Search button
    await Promise.all([
        page.click("#btnSearchPerson"),
        page.waitForNavigation({ waitUntil: "networkidle2" })
    ]);

    // Export to PDF
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });

    fs.writeFileSync("tfs-results.pdf", pdfBuffer);

    console.log("PDF saved as tfs-results.pdf");

    await browser.close();
})();
