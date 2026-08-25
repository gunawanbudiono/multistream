const { db } = require('../db/database');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

async function runSeed() {
  const hash = await bcrypt.hash('Jeruksunrise123', 10);
  const userId = uuidv4();
  db.run(`INSERT OR REPLACE INTO users (id, username, password, user_role, status) VALUES (?, ?, ?, ?, ?)`,
    [userId, 'ngadimin', hash, 'admin', 'active'],
    (err) => {
      if (err) console.error('Seed error:', err.message);
      else console.log('ADMIN USER NGADIMIN SEEDED SUCCESSFULLY!');
    }
  );
}

runSeed();
