const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, '..', 'db', 'streamflow.db');
const db = new sqlite3.Database(dbPath);

async function seedAdmin() {
  const hash = await bcrypt.hash('Jeruksunrise123', 10);
  const userId = uuidv4();

  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar_path TEXT,
      gdrive_api_key TEXT,
      user_role TEXT DEFAULT 'admin',
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      disk_quota_gb INTEGER DEFAULT 0
    )`);

    db.run(`INSERT OR REPLACE INTO users (id, username, password, user_role, status) VALUES (?, ?, ?, ?, ?)`,
      [userId, 'ngadimin', hash, 'admin', 'active'],
      (err) => {
        if (err) console.error('Error seeding admin:', err.message);
        else console.log('Admin user ngadimin seeded successfully!');
      }
    );
  });
}

seedAdmin();
