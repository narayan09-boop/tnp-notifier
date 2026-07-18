const { getDatabase, JobRepository, NotificationRepository } = require("./database");
const Bot = require("./bot");
const SyncService = require("./sync");
const TnpScraper = require("./scraper");
const dotenv = require("dotenv");
const express = require("express");

dotenv.config();

// Dummy Express server to satisfy Render Web Service health checks
const app = express();
app.get('/', (req, res) => res.send('TNP Notifier Bot is running!'));
const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log(`Web server listening on port ${port}`));

async function runSyncCycle(jobRepo, notifRepo, bot) {
  console.log(`\n--- STARTING SYNC CYCLE AT ${new Date().toLocaleString()} ---`);
  
  const scraper = new TnpScraper();
  try {
    await scraper.initialize();
    await scraper.login(process.env.TNP_USERNAME, process.env.TNP_PASSWORD);
    
    const liveJobs = await scraper.getLatestJobs();
    const notifications = await scraper.getLatestNotifications();
    
    await scraper.close();

    const syncService = new SyncService(jobRepo, notifRepo, bot);
    
    console.log(`\n--- EXECUTING SYNC RUN FOR ${liveJobs.length} JOBS ---`);
    for (const job of liveJobs) {
      await syncService.run(job);
    }
    
    console.log(`\n--- EXECUTING SYNC RUN FOR ${notifications.length} NOTIFICATIONS ---`);
    for (const notif of notifications) {
      await syncService.runNotificationSync(notif);
    }
    
    console.log("\nCycle completed successfully. Waiting for next interval...");
  } catch (error) {
    console.error("Error during sync cycle:", error);
    if (scraper && scraper.browser) {
       await scraper.close();
    }
  }
}

async function main() {
  console.log("Starting Unified TNP Whatsapp Notifier...");

  try {
    // 1. Connect to MongoDB
    const db = await getDatabase();
    const jobRepo = new JobRepository(db);
    const notifRepo = new NotificationRepository(db);

    // 2. Initialize WhatsApp Bot
    const bot = new Bot();
    await bot.initialize();

    // 3. Check if the Group ID has been configured
    const groupId = process.env.WHATSAPP_GROUP_JID;
    
    if (!groupId || groupId.includes("120363xxxxxxxx")) {
      console.log("\n=========================================================================");
      console.log("ACTION REQUIRED: You have not configured a real WHATSAPP_GROUP_JID yet.");
      console.log("To find your Group ID, please open WhatsApp on your phone and send any");
      console.log("message (e.g. 'test') inside the group you want to use.");
      console.log("The bot will intercept it and print the Group ID below.");
      console.log("Once you have the ID, update your .env file and restart this script!");
      console.log("=========================================================================\n");
      
      console.log("Listening for messages... (Waiting for you to send a message in the group)");
      return; // Stop here and keep the process alive to listen for messages
    }

    // Run first cycle immediately
    await runSyncCycle(jobRepo, notifRepo, bot);
    
    // Schedule to run every 5 hours (5 * 60 * 60 * 1000 = 18000000 ms)
    const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
    setInterval(() => {
      runSyncCycle(jobRepo, notifRepo, bot);
    }, FIVE_HOURS_MS);

    console.log(`\nScheduler active. Will check for updates every 5 hours.`);

  } catch (error) {
    console.error("Application Error:", error);
    process.exit(1);
  }
}

main();
