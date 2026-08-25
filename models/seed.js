const { db } = require('../db/database');
const bcrypt = require('bcrypt');

const usersToSeed = [
  { id: 'bdb0aa84-e0ce-4c04-a0d0-7e44bc6eef35', username: 'ngadimin', role: 'admin', pass: 'Jeruksunrise123' },
  { id: 'b5e49207-e96c-4450-9d0d-32cf4b2d35c5', username: 'music', role: 'member', pass: 'apayapasswordnya' },
  { id: '5582814f-1ed3-4304-a88a-211516e872c3', username: 'test', role: 'member', pass: 'apayapasswordnya' },
  { id: '16425157-7975-4cbd-9368-2df8cb73a100', username: 'entertainment', role: 'member', pass: 'apayapasswordnya' }
];

async function seedAllUsers() {
  const adminHash = await bcrypt.hash('Jeruksunrise123', 10);
  const memberHash = await bcrypt.hash('apayapasswordnya', 10);
  
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar_path TEXT,
      gdrive_api_key TEXT,
      user_role TEXT DEFAULT 'member',
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      disk_quota_gb INTEGER DEFAULT 0
    )`);

    for (const u of usersToSeed) {
      const hashToUse = u.username === 'ngadimin' ? adminHash : memberHash;
      db.run(
        `INSERT OR REPLACE INTO users (id, username, password, user_role, status, disk_quota_gb) VALUES (?, ?, ?, ?, ?, ?)`,
        [u.id, u.username, hashToUse, u.role, 'active', 0],
        (err) => {
          if (err) console.error(`Error seeding ${u.username}:`, err.message);
          else console.log(`User ${u.username} seeded as ${u.role}.`);
        }
      );
    }
  });
}

seedAllUsers();
