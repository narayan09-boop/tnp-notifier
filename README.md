# TNP WhatsApp Notifier

A Node.js automation script that monitors a Training and Placement (TNP) portal for new job postings and notifications. It uses Puppeteer to scrape the portal, MongoDB to track the state of job postings to prevent duplicate alerts, and whatsapp-web.js to dispatch formatted updates directly to a WhatsApp group.

## Features
* Automated scraping of the TNP portal for job listings and notifications.
* Uses MongoDB to maintain state and detect new or updated postings.
* Parses and structures job details (Role, Eligibility, Dates, Link, etc.).
* Automatically sends WhatsApp messages to a configured group when changes are detected.
* Runs on a scheduled interval to check for updates.

## Prerequisites
* Node.js (v18 or higher recommended)
* Google Chrome installed locally
* A MongoDB cluster (e.g., MongoDB Atlas)
* A WhatsApp account (to scan the QR code and act as the bot)

## Setup and Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/narayan09-boop/tnp-notifier.git
   cd tnp-notifier
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Environment Variables:
   Create a `.env` file in the root directory and copy the contents of `.env.example`. Fill in the values:
   
   ```env
   # TNP Portal Credentials
   TNP_USERNAME=your_tnp_username_here
   TNP_PASSWORD=your_tnp_password_here
   
   # MongoDB Configuration
   MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/?appName=Cluster0
   MONGO_DB_NAME=tnp_notifier
   
   # WhatsApp Group Target
   WHATSAPP_GROUP_JID=123456789@g.us
   ```

## Usage

Start the notifier script:
```bash
node index.js
```

On the first run, the terminal will display a QR code. Scan this QR code using the "Linked Devices" feature on your WhatsApp app to authenticate the bot. Once authenticated, the session is saved locally in the `auth/` directory, so you will not need to scan the code on subsequent runs.

The script will begin scraping the TNP portal immediately and then continue to run on its scheduled interval.

## Deployment Notes
If deploying this to a cloud environment (e.g., Render, Railway, AWS):
* Ensure that the `auth` folder can persist, or be prepared to scan the QR code via terminal logs whenever the server restarts.
* Alternatively, authenticate locally and upload the generated `auth` folder securely to your server if persistence is an issue.
* Modify the `CHROME_PATH` or puppeteer launch arguments in `scraper.js` if your hosting environment requires a specific executable path for Puppeteer.
