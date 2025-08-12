const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

async function sharepointLogin(page, siteUrl, username, password) {
  await page.goto(siteUrl, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', username);
  await page.click('input[type="submit"]');
  await page.waitForSelector('input[type="password"]');
  await page.type('input[type="password"]', password);
  await page.click('input[type="submit"]');
  // handle stay signed in prompt if appears
  try {
    await page.waitForSelector('#idBtn_Back', { timeout: 5000 });
    await page.click('#idBtn_Back');
  } catch {}
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
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

  const uploadUrl = `${siteUrl}/_api/web/GetFolderByServerRelativeUrl('${encodeURIComponent(folderUrl)}')/Files/add(overwrite=true, url='${encodeURIComponent(fileName)}')`;

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
  const siteUrl = process.env.SHAREPOINT_SITE;  // e.g. https://contoso.sharepoint.com/sites/yoursite
  const folderUrl = process.env.SHAREPOINT_FOLDER; // e.g. /sites/yoursite/Shared Documents/FolderName
  const searchName = process.env.SEARCH_NAME || '';
  const searchID = process.env.SEARCH_ID || '';

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  try {
    // Do your TFS search here and generate PDF as before...

    await sharepointLogin(page, siteUrl, username, password);

    // Upload your PDF file
    const safeName = searchName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const pdfFileName = `TFS Results - ${safeName}.pdf`;
    const pdfFilePath = path.join(process.cwd(), pdfFileName);

    await uploadFile(page, siteUrl, folderUrl, pdfFilePath, pdfFileName);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
})();
