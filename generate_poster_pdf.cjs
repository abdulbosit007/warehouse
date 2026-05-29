const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Match viewport exactly to poster pixel size (780 × 1103)
  await page.setViewport({ width: 780, height: 1103, deviceScaleFactor: 2 });

  const htmlPath = path.resolve(__dirname, 'WMS_Poster.html');
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), {
    waitUntil: 'networkidle0',
    timeout: 30000,
  });

  // Remove body padding so poster touches the edges
  await page.evaluate(() => {
    document.body.style.padding = '0';
    document.body.style.margin = '0';
    document.body.style.background = 'white';
    document.body.style.display = 'block';
  });

  // Wait for Google Fonts to load
  await new Promise(r => setTimeout(r, 3000));

  await page.pdf({
    path: 'WMS_Poster_v2.pdf',
    width: '420mm',
    height: '594mm',
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    scale: 1,
  });

  await browser.close();
  console.log('Done! WMS_Poster.pdf saved.');
})();
