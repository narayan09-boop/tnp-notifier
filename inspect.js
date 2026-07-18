require('dotenv').config();
const puppeteer = require('puppeteer-core');
const fs = require('fs');

async function inspect() {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", 
    headless: "new",
    args: ["--no-sandbox"]
  });
  
  const page = await browser.newPage();
  await page.goto('https://tp.bitmesra.co.in/', { waitUntil: 'networkidle2' });
  
  console.log("Logging in...");
  await page.type('#identity', process.env.TNP_USERNAME);
  await page.type('#password', process.env.TNP_PASSWORD);
  
  await Promise.all([
    page.click('input[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
  ]);
  
  console.log("Navigating to job info...");
  await page.goto('https://tp.bitmesra.co.in/job/info/fa914d1d7c812e942cb75bf4e3fdbffb', { waitUntil: 'networkidle2' });
  
  const html = await page.content();
  fs.writeFileSync('job_details.html', html);
  
  await browser.close();
  console.log("Job details dumped successfully");
}

inspect().catch(e => {
  console.log("Failed to inspect:", e);
});
