const puppeteer = require('puppeteer');

(async () => {
  const name = "Ilse de Lange";
  const idNumber = "9401051460088";

  console.log(`Searching TFS for Name: ${name}, ID: ${idNumber}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  });

  const page = await browser.newPage();

  // Spoof user-agent to avoid bot blocking
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36'
  );

  await page.goto('https://[YOUR-TFS-URL-HERE]', { waitUntil: 'networkidle2', timeout: 60000 });

  // Save initial page HTML + screenshot for debugging
  const fs = require('fs');
  const htmlContent = await page.content();
  fs.writeFileSync('page.html', htmlContent);
  await page.screenshot({ path: 'page.png', fullPage: true });

  console.log(`Page content length: ${htmlContent.length}`);

  // If the field is inside an iframe, find it
  const frames = page.frames();
  let nameInputFrame = null;
  for (const frame of frames) {
    if (await frame.$('input[name="txtName"]')) {
      nameInputFrame = frame;
      break;
    }
  }

  if (!nameInputFrame) {
    console.error("Name input field not found on page.");
    await browser.close();
    process.exit(1);
  }

  console.log("Name input exists? true");

  // Fill in fields
  await nameInputFrame.type('input[name="txtName"]', name);
  await nameInputFrame.type('input[name="txtIDNumber"]', idNumber);

  // Click search button
  await Promise.all([
    nameInputFrame.click('input[name="btnSearch"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2' })
  ]);

  // Save results
  const resultsHTML = await page.content();
  fs.writeFileSync('results.html', resultsHTML);
  await page.screenshot({ path: 'results.png', fullPage: true });

  await browser.close();
})();
