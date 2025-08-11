const puppeteer = require('puppeteer');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  const searchName = process.env.SEARCH_NAME || '';
  const searchID = process.env.SEARCH_ID || '';

  console.log(`🔍 Searching for Name: "${searchName}", ID: "${searchID}"`);

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let page;  // declare page here to use in catch
  try {
    page = await browser.newPage();
    await page.goto('https://tfs.fic.gov.za/Pages/Search', { waitUntil: 'networkidle2' });

    await page.waitForSelector('#PersonNameTextBox', { timeout: 15000 });

    if (searchName) {
      await page.focus('#PersonNameTextBox');
      await page.keyboard.type(searchName);
    }

    if (searchID) {
      await page.focus('#IdentificationNumberTextBox');
      await page.keyboard.type(searchID);
    }

    await page.click('#SearchPersonButton');

    await page.waitForFunction(() => {
      const resultsDiv = document.querySelector('#PersonResultsDiv');
      return resultsDiv && resultsDiv.innerText.trim().length > 0;
    }, { timeout: 20000 });

    await sleep(2000);  // <-- replaced waitForTimeout with sleep

    console.log('✅ Search results loaded.');

    await page.pdf({
      path: 'tfs-results.pdf',
      format: 'A4',
      printBackground: true,
      landscape: false,
    });

    console.log('📄 PDF saved as tfs-results.pdf');

  } catch (error) {
    console.error('❌ Error in Puppeteer script:', error);

    try {
      if (page) {
        await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
        const html = await page.content();
        const fs = require('fs');
        fs.writeFileSync('error-page.html', html);
        console.log('🔍 Saved screenshot and HTML for debugging.');
      }
    } catch (e) {
      console.error('Failed to save debugging files:', e);
    }

    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
