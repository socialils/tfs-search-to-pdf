const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sharepointLogin(page, siteUrl, username, password) {
  await page.goto(siteUrl, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', username);
  await page.click('input[type="submit"]');
  await page.waitForSelector('input[type="password"]');
  await page.type('input[type="password"]', password);
  await page.click('input[type="submit"]');
  try {
    await page.waitForSelector('#idBtn_Back', { timeout: 5000 });
    await page.click('#idBtn_Back');
  } catch {}
  // Wait for a reliable selector that confirms successful login:
  await page.waitForSelector('#mectrl_currentAccount_picture > div', { timeout: 60000 });
  console.log('Logged in to SharePoint');
}

async function getRequestDigest(page, siteUrl) {
  const cookies = await page.cookies();
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const res = await fetch(`${siteUrl}/_api/contextinfo`, {
    method: 'POST',
    headers: {
      Accept: 'application/json;odata=verbose',
      Cookie: cookieHeader,
    },
  });
  if (!res.ok) throw new Error(`Failed to get request digest: ${res.statusText}`);
  const json = await res.json();
  return json.d.GetContextWebInformation.FormDigestValue;
}

async function uploadFile(page, siteUrl, folderUrl, filePath, fileName) {
  const cookies = await page.cookies();
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const fileContent = fs.readFileSync(filePath);

  const requestDigest = await getRequestDigest(page, siteUrl);

  const uploadUrl = `${siteUrl}/_api/web/GetFolderByServerRelativeUrl('${folderUrl}')/Files/add(overwrite=true, url='${fileName}')`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json;odata=verbose',
      'Content-Type': 'application/pdf',
      Cookie: cookieHeader,
      'X-RequestDigest': requestDigest,
    },
    body: fileContent,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${res.statusText} - ${text}`);
  }
  console.log('File uploaded successfully');
}

(async () => {
  const username = process.env.SHAREPOINT_USERNAME;
  const password = process.env.SHAREPOINT_PASSWORD;
  const siteUrl = process.env.SHAREPOINT_SITE;  // e.g. https://yourtenant.sharepoint.com/sites/yoursite
  const folderUrl = process.env.SHAREPOINT_FOLDER; // e.g. /sites/yoursite/Shared Documents/FolderName
  const searchName = process.env.SEARCH_NAME || '';
  const searchID = process.env.SEARCH_ID || '';

  if (!username || !password || !siteUrl || !folderUrl) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  try {
    // --- TFS Search & PDF Generation ---

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

    await sleep(2000); // extra wait for rendering

    console.log('✅ Search results loaded.');

    const safeName = searchName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const pdfFileName = `TFS Results - ${searchName}.pdf`;
    const pdfFilePath = path.join(process.cwd(), pdfFileName);

    await page.pdf({
      path: pdfFilePath,
      format: 'A4',
      printBackground: true,
    });

    console.log(`📄 PDF saved as ${pdfFileName}`);

    // --- Login to SharePoint ---

    await sharepointLogin(page, siteUrl, username, password);

    // --- Upload PDF to SharePoint ---

    await uploadFile(page, siteUrl, folderUrl, pdfFilePath, pdfFileName);

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
})();
