const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { db } = require('../db/database');
class Video {
  static removeOwnedAsset(relativePath) {
    if (!relativePath || typeof relativePath !== 'string' || !relativePath.startsWith('/uploads/')) {
      return;
    }

    const fullPath = path.join(__dirname, '..', 'public', relativePath);
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (error) {
      console.error('Error deleting media asset:', error);
    }
  }

  static async create(data) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO videos (
          id, title, filepath, thumbnail_path, file_size, 
          duration, format, resolution, bitrate, fps, user_id, folder_id,
          codec, audio_codec,
          upload_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, data.title, data.filepath, data.thumbnail_path, data.file_size,
          data.duration, data.format, data.resolution, data.bitrate, data.fps, data.user_id, data.folder_id || null,
          data.codec || null, data.audio_codec || null,
          data.upload_date || now, now, now
        ],
        function (err) {
          if (err) {
            console.error('Error creating video:', err.message);
            return reject(err);
          }
          resolve({ id, ...data, created_at: now, updated_at: now });
        }
      );
    });
  }
  static findById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM videos WHERE id = ?', [id], (err, row) => {
        if (err) {
          console.error('Error finding video:', err.message);
          return reject(err);
        }
        resolve(row);
      });
    });
  }
  static findAll(userId = null) {
    return new Promise((resolve, reject) => {
      const query = userId ?
        'SELECT * FROM videos WHERE user_id = ? ORDER BY upload_date DESC' :
        'SELECT * FROM videos ORDER BY upload_date DESC';
      const params = userId ? [userId] : [];
      db.all(query, params, (err, rows) => {
        if (err) {
          console.error('Error finding videos:', err.message);
          return reject(err);
        }
        resolve(rows || []);
      });
    });
  }
  static findByUserAndFolder(userId, folderId = null) {
    return new Promise((resolve, reject) => {
      const isRoot = folderId === null || folderId === undefined || folderId === '';
      const query = isRoot
        ? 'SELECT * FROM videos WHERE user_id = ? AND folder_id IS NULL ORDER BY upload_date DESC'
        : 'SELECT * FROM videos WHERE user_id = ? AND folder_id = ? ORDER BY upload_date DESC';
      const params = isRoot ? [userId] : [userId, folderId];
      db.all(query, params, (err, rows) => {
        if (err) {
          console.error('Error finding videos by folder:', err.message);
          return reject(err);
        }
        resolve(rows || []);
      });
    });
  }
  static update(id, videoData) {
    const fields = [];
    const values = [];
    Object.entries(videoData).forEach(([key, value]) => {
      fields.push(`${key} = ?`);
      values.push(value);
    });
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    const query = `UPDATE videos SET ${fields.join(', ')} WHERE id = ?`;
    return new Promise((resolve, reject) => {
      db.run(query, values, function (err) {
        if (err) {
          console.error('Error updating video:', err.message);
          return reject(err);
        }
        resolve({ id, ...videoData });
      });
    });
  }
  static delete(id) {
    return new Promise((resolve, reject) => {
      Video.findById(id)
        .then(video => {
          if (!video) {
            return reject(new Error('Video not found'));
          }
          db.serialize(() => {
            db.run('UPDATE stream_history SET video_id = NULL WHERE video_id = ?', [id], (err) => {
              if (err) console.error('Error unlinking stream_history before video delete:', err.message);
            });
            db.run('UPDATE streams SET video_id = NULL WHERE video_id = ?', [id], (err) => {
              if (err) console.error('Error unlinking streams before video delete:', err.message);
            });
            db.run('DELETE FROM stream_rotation_items WHERE video_id = ?', [id], (err) => {
              if (err) console.error('Error removing rotation items before video delete:', err.message);
            });
            db.run('DELETE FROM playlist_videos WHERE video_id = ?', [id], (err) => {
              if (err) console.error('Error removing playlist videos before video delete:', err.message);
            });
            db.run('DELETE FROM playlist_audios WHERE audio_id = ?', [id], (err) => {
              if (err) console.error('Error removing playlist audios before video delete:', err.message);
            });
            db.run('DELETE FROM videos WHERE id = ?', [id], function (deleteErr) {
              if (deleteErr) {
                console.error('Error deleting video from database:', deleteErr.message);
                return reject(deleteErr);
              }
              Video.removeOwnedAsset(video.filepath);
              Video.removeOwnedAsset(video.thumbnail_path);
              resolve({ success: true, id });
            });
          });
        })
        .catch(err => reject(err));
    });
  }
}
module.exports = Video;
