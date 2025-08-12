const puppeteer = require('puppeteer');
const fetch = require('node-fetch'); // npm i node-fetch@2
const fs = require('fs');
const path = require('path');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function decodeBase64(str) {
  return Buffer.from(str, 'base64').toString('utf-8');
}

async function sharepointLogin(page, siteUrl, username, password) {
  await page.goto(siteUrl, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.type('input[type="email"]', username, { delay: 50 });
  await page.click('input[type="submit"]');

  await page.waitForSelector('input[type="password"]', { timeout: 30000 });
  await page.type('input[type="password"]', password, { delay: 50 });
  await page.click('input[type="submit"]');

  // handle stay signed in prompt if appears
  try {
    await page.waitForSelector('#idBtn_Back', { timeout: 10000 });
    await page.click('#idBtn_Back');
  } catch {}

  // Wait for a reliable logged-in selector
  await page.waitForSelector('#mectrl_currentAccount_picture > div', { timeout: 30000 });
  console.log('✅ Logged in to SharePoint');
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
  console.log('✅ File uploaded successfully');
}

(async () => {
  const username = process.env.SHAREPOINT_USERNAME;
  const passwordBase64 = process.env.SHAREPOINT_PASSWORD_B64;
  const password = decodeBase64(passwordBase64);

  const siteUrl = process.env.SHAREPOINT_SITE;
  const folderUrl = process.env.SHAREPOINT_FOLDER;
  const searchName = process.env.SEARCH_NAME || '';
  const searchID = process.env.SEARCH_ID || '';

  if (!username || !password || !siteUrl || !folderUrl) {
    console.error('❌ Missing required environment variables for SharePoint.');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  try {
    // 1. Navigate to TFS search page
    await page.goto('https://tfs.fic.gov.za/Pages/Search', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#PersonNameTextBox', { timeout: 15000 });

    // 2. Enter search criteria
    if (searchName) {
      await page.focus('#PersonNameTextBox');
      await page.keyboard.type(searchName);
    }
    if (searchID) {
      await page.focus('#IdentificationNumberTextBox');
      await page.keyboard.type(searchID);
    }
    await page.click('#SearchPersonButton');

    // 3. Wait for search results
    await page.waitForFunction(() => {
      const resultsDiv = document.querySelector('#PersonResultsDiv');
      return resultsDiv && resultsDiv.innerText.trim().length > 0;
    }, { timeout: 20000 });

    await sleep(2000);
    console.log('✅ Search results loaded.');

    // 4. Save PDF
    const pdfFileName = `TFS Results - ${searchName}.pdf`;
    const pdfFilePath = path.join(process.cwd(), pdfFileName);

    await page.pdf({
      path: pdfFilePath,
      format: 'A4',
      printBackground: true,
      landscape: false,
    });
    console.log(`📄 PDF saved as ${pdfFileName}`);

    // 5. Log in to SharePoint
    await sharepointLogin(page, siteUrl, username, password);

    // 6. Upload PDF
    await uploadFile(page, siteUrl, folderUrl, pdfFilePath, pdfFileName);

  } catch (error) {
    console.error('❌ Error:', error);
    try {
      await page.screenshot({ path: 'login-failed.png', fullPage: true });
      const html = await page.content();
      fs.writeFileSync('login-failed.html', html);
      console.log('🔍 Saved login-failed.png and login-failed.html for debugging.');
    } catch (saveError) {
      console.error('❌ Failed to save debug files:', saveError);
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
