const puppeteer = require('puppeteer');
const fetch = require('node-fetch'); // npm i node-fetch@2
const fs = require('fs');
const path = require('path');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAccessToken(tenantId, clientId, clientSecret, sharepointDomain) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('scope', `${sharepointDomain}/.default`);
  params.append('client_secret', clientSecret);
  params.append('grant_type', 'client_credentials');

  const res = await fetch(url, {
    method: 'POST',
    body: params,
  });

  if (!res.ok) {
    throw new Error(`Failed to get access token: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function uploadToSharePoint(filePath, fileName, sharepointSiteUrl, folderServerRelativeUrl, accessToken) {
  const fileContent = fs.readFileSync(filePath);

  const uploadUrl = `${sharepointSiteUrl}/_api/web/GetFolderByServerRelativeUrl('${encodeURIComponent(folderServerRelativeUrl)}')/Files/add(overwrite=true, url='${encodeURIComponent(fileName)}')`;

  console.log(`Uploading file to SharePoint at: ${uploadUrl}`);

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
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

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const sharepointSiteUrl = process.env.SHAREPOINT_SITE;
  const folderServerRelativeUrl = process.env.SHAREPOINT_FOLDER;

  if (!tenantId || !clientId || !clientSecret || !sharepointSiteUrl || !folderServerRelativeUrl) {
    console.error('❌ Missing environment variables.');
    process.exit(1);
  }

  const sharepointDomain = sharepointSiteUrl.match(/^https:\/\/[^\/]+/)[0];

  console.log(`🔍 Searching for Name: "${searchName}", ID: "${searchID}"`);

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let page;
  try {
    page = await browser.newPage();

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

    const accessToken = await getAccessToken(tenantId, clientId, clientSecret, sharepointDomain);

    await uploadToSharePoint(pdfFilePath, pdfFileName, sharepointSiteUrl, folderServerRelativeUrl, accessToken);

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
