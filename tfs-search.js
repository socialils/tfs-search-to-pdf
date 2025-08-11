const puppeteer = require('puppeteer');

(async () => {
  // Get input from env (set in GitHub Actions)
  const searchName = process.env.SEARCH_NAME || '';
  const searchID = process.env.SEARCH_ID || '';

  console.log(`🔍 Searching for Name: "${searchName}", ID: "${searchID}"`);

  // Puppeteer launch options for GitHub Actions compatibility
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://tfs.fic.gov.za/Pages/Search', { waitUntil: 'networkidle2' });

    // Wait for the Name input to be present
    await page.waitForSelector('#PersonNameTextBox', { timeout: 15000 });

    // Type the Name and ID values
    if (searchName) {
      await page.focus('#PersonNameTextBox');
      await page.keyboard.type(searchName);
    }

    if (searchID) {
      await page.focus('#IdentificationNumberTextBox');
      await page.keyboard.type(searchID);
    }

    // Click the Search Person button
    await page.click('#SearchPersonButton');

    // Wait for results to load - check if results table or results div appears
    // Adjust this selector if results container changes
    await page.waitForFunction(() => {
      const resultsDiv = document.querySelector('#PersonResultsDiv');
      return resultsDiv && resultsDiv.innerText.trim().length > 0;
    }, { timeout: 20000 });

    console.log('✅ Search results loaded.');

    // Save a PDF of the full page (with background)
    await page.pdf({
      path: 'tfs-results.pdf',
      format: 'A4',
      printBackground: true,
      landscape: false,
    });

    console.log('📄 PDF saved as tfs-results.pdf');

  } catch (error) {
    console.error('❌ Error in Puppeteer script:', error);

    // Save screenshot and HTML for debugging
    try {
      await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
      const html = await page.content();
      const fs = require('fs');
      fs.writeFileSync('error-page.html', html);
      console.log('🔍 Saved screenshot and HTML for debugging.');
    } catch (e) {
      console.error('Failed to save debugging files:', e);
    }

    process.exit(1);  // Fail the job
  } finally {
    await browser.close();
  }
})();
