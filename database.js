const { MongoClient, ServerApiVersion } = require("mongodb");
const dotenv = require("dotenv");

dotenv.config();

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || "tnp_notifier";

let client = null;
let db = null;

async function getDatabase() {
  if (db) return db;
  
  if (!uri) {
    throw new Error("MONGO_URI is missing in environment variables!");
  }

  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });
  let connected = false;
  let retries = 5;
  while (retries > 0 && !connected) {
    try {
      await client.connect();
      connected = true;
    } catch (err) {
      console.log(`MongoDB connection failed (${err.message}). Retrying in 2 seconds...`);
      retries -= 1;
      await new Promise(res => setTimeout(res, 2000));
    }
  }

  if (!connected) {
    throw new Error("Failed to connect to MongoDB after multiple retries.");
  }

  db = client.db(dbName);
  console.log("Connected successfully to MongoDB.");
  
  return db;
}

class JobRepository {
  constructor(db) {
    this.collection = db.collection("jobs");
  }

  async getByLink(jobLink) {
    return await this.collection.findOne({ link: jobLink });
  }

  async save(job) {
    job.updated_at = new Date();
    if (!job.created_at) {
      job.created_at = new Date();
    }
    
    await this.collection.replaceOne(
      { link: job.link },
      job,
      { upsert: true }
    );
  }
}

class NotificationRepository {
  constructor(db) {
    this.collection = db.collection("notifications");
  }

  async getByIdentifier(identifier) {
    return await this.collection.findOne({ identifier: identifier });
  }

  async save(notification) {
    notification.updated_at = new Date();
    if (!notification.created_at) {
      notification.created_at = new Date();
    }
    
    await this.collection.replaceOne(
      { identifier: notification.identifier },
      notification,
      { upsert: true }
    );
  }
}

module.exports = { getDatabase, JobRepository, NotificationRepository };
