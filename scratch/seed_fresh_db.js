const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, '..', 'db', 'streamflow.db');
const db = new sqlite3.Database(dbPath);

async function seedFresh() {
  const passwordHash = await bcrypt.hash('Jeruksunrise123', 10);
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

    db.run(`CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      filepath TEXT NOT NULL,
      thumbnail_path TEXT,
      file_size INTEGER,
      duration REAL,
      format TEXT,
      resolution TEXT,
      bitrate INTEGER,
      fps TEXT,
      user_id TEXT,
      folder_id TEXT,
      upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS media_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS streams (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      video_id TEXT,
      rtmp_url TEXT NOT NULL,
      stream_key TEXT NOT NULL,
      platform TEXT,
      platform_icon TEXT,
      bitrate INTEGER DEFAULT 2500,
      resolution TEXT,
      fps INTEGER DEFAULT 30,
      orientation TEXT DEFAULT 'horizontal',
      loop_video BOOLEAN DEFAULT 1,
      schedule_time TIMESTAMP,
      duration INTEGER,
      status TEXT DEFAULT 'offline',
      status_updated_at TIMESTAMP,
      start_time TIMESTAMP,
      end_time TIMESTAMP,
      use_advanced_settings BOOLEAN DEFAULT 0,
      youtube_monetization BOOLEAN DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      user_id TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (video_id) REFERENCES videos(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS stream_history (
      id TEXT PRIMARY KEY,
      stream_id TEXT,
      title TEXT NOT NULL,
      platform TEXT,
      start_time TIMESTAMP,
      end_time TIMESTAMP,
      duration INTEGER,
      status TEXT,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      user_id TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`INSERT INTO users (id, username, password, user_role, status) VALUES (?, ?, ?, ?, ?)`,
      [userId, 'ngadimin', passwordHash, 'admin', 'active'], (err) => {
        if (err) console.error('Error seeding user:', err);
        else console.log('Fresh admin user seeded successfully!');
      }
    );
  });
}

seedFresh();
