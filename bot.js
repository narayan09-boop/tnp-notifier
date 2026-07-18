const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

class Bot {
  constructor() {
    this.sock = null;
    this.ready = false;
  }

  async initialize() {
    return new Promise(async (resolve, reject) => {
      try {
        const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth');

        const connectToWhatsApp = async () => {
          this.sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }), // Suppress verbose logs
            browser: ["TNP Notifier", "Chrome", "1.0.0"]
          });

          this.sock.ev.on('creds.update', saveCreds);

          this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
              console.log("\n=======================================================");
              console.log("QR CODE RECEIVED. PLEASE SCAN IT WITH YOUR WHATSAPP APP");
              console.log("=======================================================\n");
              qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
              const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
              console.log('WhatsApp connection closed due to', lastDisconnect?.error, 'reconnecting:', shouldReconnect);
              
              this.ready = false;
              if (shouldReconnect) {
                connectToWhatsApp();
              } else {
                console.error("You have been logged out. Please delete the 'baileys_auth' folder and restart to scan the QR code again.");
              }
            } else if (connection === 'open') {
              console.log('WhatsApp bot is ready and fully authenticated!');
              this.ready = true;
              resolve(this);
            }
          });

          this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            const msg = messages[0];
            
            if (!msg.key.fromMe && msg.key.remoteJid) {
              const remoteJid = msg.key.remoteJid;
              console.log(`\n[MESSAGE INTERCEPTED] From: ${remoteJid}`);
              if (remoteJid.endsWith('@g.us')) {
                console.log(`-> This is a Group ID! You can use this in your .env file: ${remoteJid}`);
              }
            }
          });
        };

        console.log("Initializing WhatsApp Client via Baileys...");
        connectToWhatsApp();
      } catch (err) {
        reject(err);
      }
    });
  }

  async sendMessage(targetGroup, payload) {
    if (!this.sock || !this.ready) {
      throw new Error("Bot is not ready yet");
    }
    
    if (!targetGroup) {
      throw new Error("Target group ID is not defined");
    }

    const title = payload.isUpdate ? "🔄 COMPANY UPDATED" : "🚨 NEW PLACEMENT UPDATE";
    const link = payload.link || "";
    
    // Clean company name
    const companyName = payload.company ? payload.company.split('\n')[0].trim() : "N/A";
    
    // Extract Type (FTE/Internship)
    let type = "Not specified";
    const allTextContext = `${payload.role || ''} ${payload.package || ''} ${payload.company || ''}`;
    if (allTextContext.toLowerCase().includes("internship")) type = "Internship";
    else if (allTextContext.toLowerCase().includes("fte") || allTextContext.toLowerCase().includes("full time")) type = "FTE";
    else if (allTextContext.toLowerCase().includes("six months")) type = "6 Months Internship";

    // Clean up role
    let role = payload.role || "N/A";
    if (role.length > 80) {
      const lines = role.split('\n').map(l => l.trim()).filter(Boolean);
      const possibleRoles = lines.filter(l => !l.includes("Posted By") && !l.includes("Dated:") && !l.includes("Months") && !l.includes(companyName) && !l.includes("Student Co-ordinator"));
      if (possibleRoles.length > 0) role = possibleRoles[0];
      else role = "Check Portal for details";
    }

    // Extract branches and criteria
    let branches = "Not specified";
    let eligibility = payload.eligibility || "N/A";
    
    if (eligibility.length > 80) {
      const branchMatch = eligibility.match(/(?:BTech|IMSc).*?(?=Criteria|CAMPUSES|URL|$)/is);
      if (branchMatch) {
        branches = branchMatch[0]
          .replace(/BTech - /g, '')
          .replace(/BTech/g, '')
          .replace(/IMSc - /g, '')
          .replace(/IMSc/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (branches.length > 200) branches = branches.substring(0, 197) + "...";
      }
      
      const criteriaMatch = eligibility.match(/Criteria(.*?)(?=CAMPUSES|URL|$)/is);
      if (criteriaMatch) {
        eligibility = criteriaMatch[1].trim();
      } else {
        eligibility = "Check Portal for criteria details";
      }
    } else {
       branches = eligibility;
       eligibility = "Check Portal for details";
    }

    const message = [
      `${title}`,
      "",
      `⏳ Starts: ${payload.registrationStarts || "N/A"}`,
      `⌛ Ends: ${payload.registrationEnds || "N/A"}`,
      `📅 Date Posted: ${payload.postedOn || "N/A"}`,
      `🏢 Company: ${companyName}`,
      `💼 Role: ${role}`,
      `📌 Type: ${type}`,
      `🎓 Eligible Branches: ${branches}`,
      `📜 Eligibility: ${eligibility}`,
      "",
      "━━━━━━━━━━━━━━━━━━",
      link ? `🔗 Link: ${link}` : "",
    ].filter(Boolean).join("\n");

    console.log(`Sending message to ${targetGroup}...`);
    await this.sock.sendMessage(targetGroup, { text: message });
    console.log("Message sent successfully!");
  }

  async sendNotificationMessage(targetGroup, payload) {
    if (!this.sock || !this.ready) {
      throw new Error("Bot is not ready yet");
    }
    
    if (!targetGroup) {
      throw new Error("Target group ID is not defined");
    }

    const title = "🔔 NEW TNP NOTIFICATION";
    
    const message = [
      `${title}`,
      "",
      `📌 ${payload.title}`,
      `🏷 Type: ${payload.type}`,
      `🕒 Date: ${payload.date}`,
      "",
      "━━━━━━━━━━━━━━━━━━",
      "",
      payload.link ? `Link: ${payload.link}` : "",
    ].filter(Boolean).join("\n");

    console.log(`Sending notification to ${targetGroup}...`);
    await this.sock.sendMessage(targetGroup, { text: message });
    console.log("Notification message sent successfully!");
  }

  async printGroupList() {
    if (!this.sock || !this.ready) {
      console.error("Bot is not ready. Cannot fetch groups.");
      return;
    }
    
    console.log("\n--- DISCOVERED WHATSAPP GROUPS ---");
    try {
      const groups = await this.sock.groupFetchAllParticipating();
      
      const groupList = Object.values(groups).map(group => ({
        name: group.subject,
        id: group.id
      }));

      if (!groupList.length) {
        console.log("No group chats found.");
      } else {
        const header = "Group Name".padEnd(30) + "| Group ID";
        const divider = "-".repeat(60);
        console.log(`${divider}\n${header}\n${divider}`);
        for (const group of groupList) {
          console.log(`${group.name.padEnd(30)}| ${group.id}`);
        }
      }
    } catch (err) {
      console.error("Error fetching group list:", err);
    }
    console.log("----------------------------------\n");
  }
}

module.exports = Bot;
