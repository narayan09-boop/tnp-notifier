const crypto = require("crypto");

class SyncService {
  constructor(jobRepository, notificationRepository, botInstance) {
    this.jobRepo = jobRepository;
    this.notifRepo = notificationRepository;
    this.bot = botInstance;
  }

  generateHash(payload) {
    const dataString = JSON.stringify({
      company: payload.company || "",
      role: payload.role || "",
      package: payload.package || "",
      deadline: payload.deadline || "",
      registrationStarts: payload.registrationStarts || "",
      registrationEnds: payload.registrationEnds || "",
    });
    return crypto.createHash("md5").update(dataString).digest("hex");
  }

  generateNotificationHash(payload) {
    const dataString = JSON.stringify({
      title: payload.title || "",
      type: payload.type || "",
      date: payload.date || "",
    });
    return crypto.createHash("md5").update(dataString).digest("hex");
  }

  async run(rawPayload) {
    console.log(`Starting sync for company: ${rawPayload.company}`);

    const currentHash = this.generateHash(rawPayload);
    
    // Episodic memory: Look up the job by its stable link to see its last known state
    const existingJob = await this.jobRepo.getByLink(rawPayload.link);

    let classification;
    if (!existingJob) {
      classification = "new";
    } else if (existingJob.job_hash !== currentHash) {
      classification = "updated";
    } else {
      classification = "unchanged";
    }

    console.log(`Job classified as: ${classification}`);

    if (classification === "unchanged") {
      console.log("No changes detected. Skipping notification.");
      return { status: "skipped", reason: "unchanged" };
    }

    rawPayload.isUpdate = classification === "updated";
    rawPayload.job_hash = currentHash;

    // Send WhatsApp Message
    const targetGroup = process.env.WHATSAPP_GROUP_JID;
    try {
      await this.bot.sendMessage(targetGroup, rawPayload);
    } catch (err) {
      console.error(`Error sending message: ${err.message}`);
      throw err; // Fail sync if message fails
    }

    // Save to Database
    await this.jobRepo.save(rawPayload);

    console.log("Sync completed successfully!");
    return { status: "success", classification };
  }

  async runNotificationSync(rawPayload) {
    console.log(`Starting sync for notification: ${rawPayload.title}`);

    const currentHash = this.generateNotificationHash(rawPayload);
    // Use the title as the unique identifier because links are often just the dashboard URL
    rawPayload.identifier = rawPayload.title;
    
    // Episodic memory: Look up the notification by its stable identifier
    const existingNotif = await this.notifRepo.getByIdentifier(rawPayload.identifier);

    if (existingNotif && existingNotif.hash === currentHash) {
      console.log("Notification unchanged/already sent. Skipping.");
      return { status: "skipped", reason: "unchanged" };
    }

    rawPayload.hash = currentHash;

    const targetGroup = process.env.WHATSAPP_GROUP_JID;
    try {
      await this.bot.sendNotificationMessage(targetGroup, rawPayload);
    } catch (err) {
      console.error(`Error sending notification message: ${err.message}`);
      throw err;
    }

    await this.notifRepo.save(rawPayload);

    console.log("Notification sync completed successfully!");
    return { status: "success" };
  }
}

module.exports = SyncService;
