const puppeteer = require('puppeteer');
const fetch = require('node-fetch'); // npm i node-fetch@2
const fs = require('fs');
const path = require('path');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Upload file using SharePoint REST API with cookies
async function uploadToSharePointWithCookies(filePath, fileName, sharepointSiteUrl, folderServerRelativeUrl, cookies) {
  const fileContent = fs.readFileSync(filePath);

  // Build cookie header string from Puppeteer cookies
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  // Compose upload URL (make sure folderServerRelativeUrl is correct)
  const uploadUrl = `${sharepointSiteUrl}/_api/web/GetFolderByServerRelativeUrl('${folderServerRelativeUrl}')/Files/add(overwrite=true, url='${fileName}')`;

  console.log(`Uploading file to SharePoint at: ${uploadUrl}`);

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=verbose',
      'Content-Type': 'application/pdf',
      'Content-Length': fileContent.length.toString(),
      'Cookie': cookieHeader,
      'X-RequestDigest': await getRequestDigest(sharepointSiteUrl, cookieHeader),
    },
    body: fileContent,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${res.statusText} - ${text}`);
  }

  console.log('✅ Upload to SharePoint successful!');
}

// Get FormDigestValue (request digest) for POST auth
async function getRequestDigest(siteUrl, cookieHeader) {
  const res = await fetch(`${siteUrl}/_api/contextinfo`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=verbose',
      'Content-Type': 'application/json;odata=verbose',
      'Cookie': cookieHeader,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get request digest: ${res.status} ${res.statusText} - ${text}`);
  }

  const data = await res.json();
  return data.d.GetContextWebInformation.FormDigestValue;
}

(async () => {
  const searchName = process.env.SEARCH_NAME || '';
  const searchID = process.env.SEARCH_ID || '';

  const sharepointUsername = process.env.SHAREPOINT_USERNAME;
  const sharepointPassword = process.env.SHAREPOINT_PASSWORD;
  const sharepointSite = process.env.SHAREPOINT_SITE;
  const sharepointFolder = process.env.SHAREPOINT_FOLDER;

  if (!sharepointUsername || !sharepointPassword || !sharepointSite || !sharepointFolder) {
    console.error('❌ Missing SharePoint login environment variables.');
    process.exit(1);
  }

  console.log(`🔍 Searching for Name: "${searchName}", ID: "${searchID}"`);

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let page;
  try {
    page = await browser.newPage();

    // Emulate Johannesburg timezone
    await page.emulateTimezone('Africa/Johannesburg');

    // Step 1: Log into SharePoint
    await page.goto(`${sharepointSite}/_layouts/15/Authenticate.aspx`, { waitUntil: 'networkidle2' });

    // You may need to adjust selectors here depending on your login page
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.type('input[type="email"]', sharepointUsername);
    await page.click('input[type="submit"]');

    await page.waitForTimeout(2000);

    await page.waitForSelector('input[type="password"]', { timeout: 15000 });
    await page.type('input[type="password"]', sharepointPassword);
    await page.click('input[type="submit"]');

    // Handle 'Stay signed in?' prompt
    try {
      await page.waitForSelector('input[id="idBtn_Back"]', { timeout: 5000 });
      await page.click('input[id="idBtn_Back"]'); // Click "No"
    } catch {}

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    console.log('✅ Logged into SharePoint');

    // Now navigate to the TFS search page
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

    await sleep(2000);

    console.log('✅ Search results loaded.');

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

    // Get cookies after login
    const cookies = await page.cookies();

    // Upload PDF using SharePoint REST API with those cookies
    await uploadToSharePointWithCookies(pdfFilePath, pdfFileName, sharepointSite, sharepointFolder, cookies);

  } catch (error) {
    console.error('❌ Error:', error);

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
