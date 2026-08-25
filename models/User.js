const { db, checkIfUsersExist } = require('../db/database');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

class User {
  static findByEmail(email) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) {
          return reject(err);
        }
        resolve(row);
      });
    });
  }

  static findByUsername(username) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username], (err, row) => {
        if (err) {
          return reject(err);
        }
        resolve(row);
      });
    });
  }

  static findById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
        if (err) {
          console.error('Database error in findById:', err);
          return reject(err);
        }
        resolve(row);
      });
    });
  }

  static async create(userData) {
    try {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const userId = uuidv4();
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO users (id, username, password, avatar_path, user_role, status, disk_limit, disk_quota_gb) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            userId, 
            userData.username, 
            hashedPassword, 
            userData.avatar_path || null, 
            userData.user_role || 'member', 
            userData.status || 'active', 
            userData.disk_limit || 0,
            userData.disk_quota_gb || 0
          ],
          function (err) {
            if (err) {
              console.error("DB error during user creation:", err);
              return reject(err);
            }
            console.log("User created successfully with ID:", userId);
            resolve({ 
              id: userId, 
              username: userData.username, 
              user_role: userData.user_role || 'member', 
              status: userData.status || 'active', 
              disk_limit: userData.disk_limit || 0,
              disk_quota_gb: userData.disk_quota_gb || 0
            });
          }
        );
      });
    } catch (error) {
      console.error("Error in User.create:", error);
      throw error;
    }
  }

  static update(userId, userData) {
    const fields = [];
    const values = [];
    Object.entries(userData).forEach(([key, value]) => {
      fields.push(`${key} = ?`);
      values.push(value);
    });
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);
    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    return new Promise((resolve, reject) => {
      db.run(query, values, function (err) {
        if (err) {
          return reject(err);
        }
        resolve({ id: userId, ...userData });
      });
    });
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static findAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM users ORDER BY rowid DESC', [], (err, rows) => {
        if (err) {
          console.error('Database error in findAll:', err);
          return reject(err);
        }
        resolve(rows);
      });
    });
  }

  static updateStatus(userId, status) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, userId],
        function (err) {
          if (err) {
            console.error('Database error in updateStatus:', err);
            return reject(err);
          }
          resolve({ id: userId, status });
        }
      );
    });
  }

  static updateRole(userId, role) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET user_role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [role, userId],
        function (err) {
          if (err) {
            console.error('Database error in updateRole:', err);
            return reject(err);
          }
          resolve({ id: userId, user_role: role });
        }
      );
    });
  }

  static delete(userId) {
    return new Promise(async (resolve, reject) => {
      try {
        const Video = require('./Video');
        const Stream = require('./Stream');
        const Rotation = require('./Rotation');
        const Playlist = require('./Playlist');
        const streamingService = require('../services/streamingService');
        const rotationService = require('../services/rotationService');
        
        // 1. Stop and delete user live streams
        const userStreams = await Stream.findAll(userId);
        for (const stream of userStreams) {
          try {
            if (stream.status === 'live') {
              await streamingService.stopStream(stream.id);
            }
            await Stream.delete(stream.id, userId);
          } catch (streamDeleteError) {
            console.error(`Error deleting stream ${stream.id}:`, streamDeleteError);
          }
        }

        // 2. Stop and delete user rotations
        try {
          const userRotations = await Rotation.findAll(userId);
          for (const rotation of userRotations) {
            if (rotation.status === 'active') {
              await rotationService.stopRotation(rotation.id);
            }
            await Rotation.delete(rotation.id, userId);
          }
        } catch (rotError) {
          console.error('Error cleaning up rotations:', rotError);
        }

        // 3. Delete user playlists
        try {
          const userPlaylists = await Playlist.findAll(userId);
          for (const playlist of userPlaylists) {
            await Playlist.delete(playlist.id, userId);
          }
        } catch (plError) {
          console.error('Error cleaning up playlists:', plError);
        }

        // 4. Delete user media video files & physical assets
        const userVideos = await Video.findAll(userId);
        for (const video of userVideos) {
          try {
            await Video.delete(video.id);
          } catch (videoDeleteError) {
            console.error(`Error deleting video ${video.id}:`, videoDeleteError);
          }
        }

        // 5. Delete user activity logs
        db.run('DELETE FROM user_activity_logs WHERE user_id = ?', [userId], (err) => {
          if (err) console.error('Error deleting user activity logs:', err);
        });
        
        // 6. Delete the user row
        db.run('DELETE FROM users WHERE id = ?', [userId], function (err) {
          if (err) {
            console.error('Database error in delete:', err);
            return reject(err);
          }
          resolve({ 
            id: userId, 
            deleted: true, 
            videosDeleted: userVideos.length,
            streamsDeleted: userStreams.length 
          });
        });
      } catch (error) {
        console.error('Error in user deletion process:', error);
        reject(error);
      }
    });
  }

  static updateProfile(userId, updateData) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];
      
      if (updateData.username) {
        fields.push('username = ?');
        values.push(updateData.username);
      }
      
      if (updateData.user_role) {
        fields.push('user_role = ?');
        values.push(updateData.user_role);
      }
      
      if (updateData.status) {
        fields.push('status = ?');
        values.push(updateData.status);
      }
      
      if (updateData.avatar_path) {
        fields.push('avatar_path = ?');
        values.push(updateData.avatar_path);
      }
      
      if (updateData.password) {
        fields.push('password = ?');
        values.push(updateData.password);
      }

      if (updateData.disk_limit !== undefined) {
        fields.push('disk_limit = ?');
        values.push(updateData.disk_limit);
      }

      if (updateData.disk_quota_gb !== undefined) {
        fields.push('disk_quota_gb = ?');
        values.push(updateData.disk_quota_gb);
      }
      
      if (fields.length === 0) {
        return resolve({ id: userId, message: 'No fields to update' });
      }
      
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(userId);
      
      const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
      
      db.run(sql, values, function (err) {
        if (err) {
          console.error('Database error in updateProfile:', err);
          return reject(err);
        }
        resolve({ id: userId, changes: this.changes });
      });
    });
  }

  static getDiskUsage(userId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT COALESCE(SUM(file_size), 0) as total_size FROM videos WHERE user_id = ?',
        [userId],
        (err, row) => {
          if (err) {
            console.error('Database error in getDiskUsage:', err);
            return reject(err);
          }
          resolve(row ? row.total_size : 0);
        }
      );
    });
  }
}

module.exports = User;