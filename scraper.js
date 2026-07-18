const puppeteer = require('puppeteer-core');
const fs = require('fs');

class TnpScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      // whatsapp-web.js installs puppeteer internally, but since we are using puppeteer-core 
      // we need the executablePath. In a unified project, we could just use 'puppeteer' 
      // but let's stick to the Chrome path for stability.
      executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", 
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu"
      ]
    });
    this.page = await this.browser.newPage();
    
    // Block unnecessary resources to save massive amounts of RAM
    await this.page.setRequestInterception(true);
    this.page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });
  }

  async login(username, password) {
    console.log("Navigating to TNP Portal...");
    await this.page.goto('https://tp.bitmesra.co.in/', { waitUntil: 'networkidle2' });
    
    console.log("Logging in as", username);
    await this.page.waitForSelector('#identity', { visible: true, timeout: 10000 });
    await this.page.type('#identity', username);
    await this.page.type('#password', password);
    
    await Promise.all([
      this.page.click('input[type="submit"]'),
      this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);
    
    console.log("Login successful!");
  }

  async getLatestJobs() {
    console.log("Navigating to placements page...");
    await this.page.goto('https://tp.bitmesra.co.in/applyjobs.html', { waitUntil: 'networkidle2' });
    
    // Extract base job info from the table
    const jobs = await this.page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#job-listings tbody tr'));
      return rows.map(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length < 4) return null;
        
        const company = cols[0].innerText.trim();
        const deadline = cols[1].innerText.trim();
        const postedOn = cols[2].innerText.trim();
        
        // Find the "View & Apply" link
        const links = cols[3].querySelectorAll('a');
        let infoLink = null;
        for (const a of links) {
          if (a.href && a.href.includes('job/info/')) {
            infoLink = a.href;
            break;
          }
        }
        
        return {
          company,
          deadline,
          postedOn,
          link: infoLink
        };
      }).filter(j => j && j.link);
    });

    console.log(`Found ${jobs.length} jobs on the dashboard.`);
    
    // Visit each job to get detailed info (CTC, Eligibility, Role)
    // To save time, we will only fetch details for the top 3 most recent jobs
    const recentJobs = jobs.slice(0, 3);
    const enrichedJobs = [];

    for (const job of recentJobs) {
      console.log(`Fetching details for ${job.company}...`);
      await this.page.goto(job.link, { waitUntil: 'networkidle2' });
      
      const details = await this.page.evaluate(() => {
        const data = {
          package: "Not specified",
          role: "Not specified",
          eligibility: "Not specified",
          location: "Not specified",
          registrationStarts: "Not specified",
          registrationEnds: "Not specified"
        };
        
        const getTableByHeader = (headerText) => {
          const headers = Array.from(document.querySelectorAll('td, th')).filter(el => 
            el.innerText.trim().toUpperCase().includes(headerText)
          );
          if (headers.length > 0) {
            return headers[0].closest('table');
          }
          return null;
        };

        // 1. Role
        const roleTable = getTableByHeader('JOB PROFILE DETAILS');
        if (roleTable) {
          const trs = roleTable.querySelectorAll('tr');
          if (trs.length > 1) {
            const roleText = trs[1].innerText.trim();
            if (roleText && roleText.toLowerCase() !== 'blank') {
              data.role = roleText;
            }
          }
        }
        if (data.role === "Not specified") {
          const h3s = Array.from(document.querySelectorAll('h3'));
          if (h3s.length > 0) {
            const container = h3s[0].closest('td');
            if (container) {
              const ul = container.querySelector('ul');
              if (ul) data.role = ul.innerText.trim();
            }
          }
        }

        // 2. Package
        const salaryTable = getTableByHeader('SALARY DETAILS');
        if (salaryTable) {
          const thead = salaryTable.querySelector('thead');
          const tbody = salaryTable.querySelector('tbody');
          if (thead && tbody) {
            const lastTr = Array.from(thead.querySelectorAll('tr')).pop();
            if (lastTr) {
              const headers = Array.from(lastTr.querySelectorAll('td, th')).map(h => h.innerText.trim().toUpperCase());
              const ctcIndex = headers.indexOf('CTC');
              if (ctcIndex !== -1) {
                const firstRow = tbody.querySelector('tr');
                if (firstRow) {
                  const cells = firstRow.querySelectorAll('td');
                  if (cells[ctcIndex]) {
                    data.package = cells[ctcIndex].innerText.trim();
                  }
                }
              } else {
                 data.package = tbody.innerText.trim().replace(/\s+/g, ' ');
              }
            }
          }
        }

        // 3. Eligibility
        const elTable = getTableByHeader('ELIGIBILITY');
        if (elTable) {
          const tbody = elTable.querySelector('tbody');
          if (tbody) {
            const elText = tbody.innerText.trim().replace(/\s+/g, ' ');
            if (elText) data.eligibility = elText;
          }
        }

        // 4. Location / Campuses
        const locTable = getTableByHeader('CAMPUSES CONSIDERED');
        if (locTable) {
          const trs = locTable.querySelectorAll('tbody tr');
          if (trs.length > 1) {
            const locText = trs[1].innerText.trim();
            if (locText) data.location = locText;
          }
        }
        
        // 5. Registration
        const regTable = getTableByHeader('REGISTRATION');
        if (regTable) {
          const trs = regTable.querySelectorAll('tr');
          if (trs.length > 1) {
            const tds = trs[1].querySelectorAll('td');
            if (tds.length >= 2) {
              const startText = tds[0].innerText.replace('Starts From:', '').trim();
              const endText = tds[1].innerText.replace('Ends On:', '').trim();
              if (startText) data.registrationStarts = startText;
              if (endText) data.registrationEnds = endText;
            }
          }
        }
        
        return data;
      });
      
      enrichedJobs.push({
        ...job,
        ...details,
        description: `Posted on: ${job.postedOn}`
      });
    }

    return enrichedJobs;
  }

  async getLatestNotifications() {
    console.log("Fetching latest notifications...");
    await this.page.goto('https://tp.bitmesra.co.in/', { waitUntil: 'networkidle2' });
    
    const notifications = await this.page.evaluate(() => {
      const results = [];
      const table = document.querySelector('#newseventsx1');
      if (table) {
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        // Get up to 5 recent notifications
        const recentRows = rows.slice(0, 5);
        for (const row of recentRows) {
          const titleEl = row.querySelector('h6 a');
          const detailEl = row.querySelector('small b');
          const dateEl = row.querySelector('small i');
          
          if (titleEl) {
            let link = titleEl.href;
            let text = titleEl.innerText.trim();
            let type = detailEl ? detailEl.innerText.trim() : "Update";
            let date = dateEl ? dateEl.innerText.trim().replace('Date', '').trim() : "";
            
            results.push({
              title: text,
              link: link,
              type: type,
              date: date
            });
          }
        }
      }
      return results;
    });
    
    console.log(`Found ${notifications.length} notifications.`);
    return notifications;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

module.exports = TnpScraper;
