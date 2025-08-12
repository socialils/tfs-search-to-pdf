const puppeteer = require('puppeteer');
const fetch = require('node-fetch'); // npm i node-fetch@2
const fs = require('fs');
const path = require('path');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Improved Login to SharePoint with username and password to get session cookies
async function sharepointLogin(page, sharepointSiteUrl, username, password) {
  await page.goto(sharepointSiteUrl, { waitUntil: 'networkidle2' });

  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.type('input[type="email"]', username, { delay: 50 });
  await page.click('input[type="submit"]');

  await page.waitForSelector('input[type="password"]', { timeout: 30000 });
  await page.type('input[type="password"]', password, { delay: 50 });
  await page.click('input[type="submit"]');

  try {
    await page.waitForSelector('input[id="idBtn_Back"]', { timeout: 10000 });
    await page.click('input[id="idBtn_Back"]'); // Say No to stay signed in
  } catch {
    // No prompt; continue
  }

  // Wait for URL to change away from login.microsoftonline.com (means logged in)
  await page.waitForFunction(
    () => !window.location.href.includes('login.microsoftonline.com'),
    { timeout: 60000 }
  );

  // Optional: wait for a SharePoint element that appears only after login
  // e.g. await page.waitForSelector('#O365_MainLink_NavMenu', { timeout: 60000 });

  console.log('✅ Logged into SharePoint successfully');
}

// Upload file to SharePoint using authenticated cookies from Puppeteer
async function uploadToSharePointWithCookies(filePath, fileName, sharepointSiteUrl, folderServerRelativeUrl, page) {
  const fileContent = fs.readFileSync(filePath);

  const uploadUrl = `${sharepointSiteUrl}/_api/web/GetFolderByServerRelativeUrl('${folderServerRelativeUrl}')/Files/add(overwrite=true, url='${fileName}')`;

  console.log(`Uploading file to SharePoint at: ${uploadUrl}`);

  // Get cookies from Puppeteer page and format as header
  const cookies = await page.cookies();
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  // Get X-RequestDigest token (required by SharePoint POST calls)
  const requestDigest = await getRequestDigest(page, sharepointSiteUrl);

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=verbose',
      'Content-Type': 'application/pdf',
      'Content-Length': fileContent.length.toString(),
      'Cookie': cookieHeader,
      'X-RequestDigest': requestDigest,
    },
    body: fileContent,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${res.statusText} - ${text}`);
  }

  console.log('✅ Upload to SharePoint successful!');
}

// Get X-RequestDigest token from SharePoint site
async function getRequestDigest(page, sharepointSiteUrl) {
  const contextInfoUrl = `${sharepointSiteUrl}/_api/contextinfo`;

  const cookies = await page.cookies();
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  const res = await fetch(contextInfoUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=verbose',
      'Cookie': cookieHeader,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to get request digest: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.d.GetContextWebInformation.FormDigestValue;
}

(async () => {
  const searchName = process.env.SEARCH_NAME || '';
  const searchID = process.env.SEARCH_ID || '';

  const sharepointSiteUrl = process.env.SHAREPOINT_SITE; // e.g. https://yourtenant.sharepoint.com/sites/yoursite
  const sharepointFolderServerRelativeUrl = process.env.SHAREPOINT_FOLDER; // e.g. /sites/yoursite/Shared Documents/YourFolder
  const sharepointUsername = process.env.SHAREPOINT_USERNAME; // your username/email
  const sharepointPassword = process.env.SHAREPOINT_PASSWORD; // your password

  if (!sharepointSiteUrl || !sharepointFolderServerRelativeUrl || !sharepointUsername || !sharepointPassword) {
    console.error('❌ Missing SharePoint environment variables.');
    process.exit(1);
  }

  console.log(`🔍 Searching for Name: "${searchName}", ID: "${searchID}"`);

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  });

  let page;
  try {
    page = await browser.newPage();

    await page.emulateTimezone('Africa/Johannesburg');

    // Perform TFS search as usual
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

    // Login to SharePoint to get authenticated session cookies for upload
    await sharepointLogin(page, sharepointSiteUrl, sharepointUsername, sharepointPassword);

    // Upload the PDF with authenticated cookies
    await uploadToSharePointWithCookies(pdfFilePath, pdfFileName, sharepointSiteUrl, sharepointFolderServerRelativeUrl, page);

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
