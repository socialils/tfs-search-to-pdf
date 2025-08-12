const puppeteer = require('puppeteer');
const fetch = require('node-fetch'); // npm i node-fetch@2
const fs = require('fs');
const path = require('path');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Upload PDF to SharePoint folder using Basic Auth
async function uploadToSharePoint(filePath, fileName, sharepointSite, folderPath, username, password) {
  const fileContent = fs.readFileSync(filePath);

  // Basic Auth header
  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  // REST API endpoint to upload file
  // folderPath must be server relative, e.g. "/sites/yoursite/Shared Documents/YourFolder"
  const uploadUrl = `${sharepointSite}/_api/web/GetFolderByServerRelativeUrl('${folderPath}')/Files/add(overwrite=true, url='${fileName}')`;

  console.log(`Uploading file to SharePoint at: ${uploadUrl}`);

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json;odata=verbose',
      'Content-Type': 'application/pdf',
      'Content-Length': fileContent.length.toString(),
    },
    body: fileContent,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${res.statusText} - ${text}`);
  }

  console.log('✅ Upload to SharePoint successful!');
}

(async () => {
  const searchName = process.env.SEARCH_NAME || '';
  const searchID = process.env.SEARCH_ID || '';

  // SharePoint config from environment (set in GitHub secrets)
  const sharepointSite = process.env.SHAREPOINT_SITE;
  const sharepointFolder = process.env.SHAREPOINT_FOLDER;
  const sharepointUsername = process.env.SHAREPOINT_USERNAME;
  const sharepointPassword = process.env.SHAREPOINT_PASSWORD;

  if (!sharepointSite || !sharepointFolder || !sharepointUsername || !sharepointPassword) {
    console.error('❌ Missing SharePoint environment variables.');
    process.exit(1);
  }

  console.log(`🔍 Searching for Name: "${searchName}", ID: "${searchID}"`);

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let page;  // declare for catch block
  try {
    page = await browser.newPage();

    // Set timezone to Africa/Johannesburg (UTC+2)
    await page.emulateTimezone('Africa/Johannesburg');

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

    await sleep(2000);  // wait to ensure full rendering

    console.log('✅ Search results loaded.');

    // Clean filename safe string for searchName
    const safeSearchName = searchName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const pdfFileName = `TFS Results - ${safeSearchName}.pdf`;
    const pdfFilePath = path.join(process.cwd(), pdfFileName);

    await page.pdf({
      path: pdfFilePath,
      format: 'A4',
      printBackground: true,
      landscape: false,
    });

    console.log(`📄 PDF saved as ${pdfFileName}`);

    // Upload to SharePoint
    await uploadToSharePoint(pdfFilePath, pdfFileName, sharepointSite, sharepointFolder, sharepointUsername, sharepointPassword);

  } catch (error) {
    console.error('❌ Error in Puppeteer script:', error);

    try {
      if (page) {
        await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
        const html = await page.content();
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
