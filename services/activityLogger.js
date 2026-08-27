const { db } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Log user/admin activity for security and audit trail
 * @param {Object} params
 * @param {string} params.userId - Target user ID or owner of the resource
 * @param {string} [params.performedBy] - Username or ID of the person performing the action
 * @param {string} params.actionType - Action constant (e.g. AUTH_LOGIN, USER_CREATE, MEDIA_UPLOAD, STREAM_START)
 * @param {string} [params.category] - 'auth' | 'admin' | 'media' | 'stream' | 'playlist' | 'rotation' | 'general'
 * @param {string} params.description - Human-readable description
 * @param {Object|string} [params.details] - Additional JSON metadata
 * @param {string} [params.ipAddress] - Client IP address
 */
function logActivity({ userId, performedBy, actionType, category = 'general', description, details = null, ipAddress = null }) {
  return new Promise((resolve) => {
    if (!userId) {
      return resolve();
    }
    const id = uuidv4();
    const detailsStr = typeof details === 'object' && details !== null ? JSON.stringify(details) : (details || null);
    
    db.run(
      `INSERT INTO user_activity_logs (id, user_id, performed_by, action_type, category, description, details, ip_address) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        performedBy || userId || 'system',
        actionType || 'UNKNOWN',
        category || 'general',
        description || '',
        detailsStr,
        ipAddress || null
      ],
      (err) => {
        if (err) {
          console.error('Error writing activity log:', err.message);
        }
        resolve();
      }
    );
  });
}

/**
 * Get recent activity logs for a user (limit default 50)
 * @param {string} userId
 * @param {number} limit
 */
function getUserLogs(userId, limit = 50) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM user_activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit],
      (err, rows) => {
        if (err) {
          console.error('Error fetching user logs:', err.message);
          return resolve([]);
        }
        resolve(rows || []);
      }
    );
  });
}

/**
 * Get all activity logs across all users (Admin view)
 * @param {Object} options
 * @param {number} [options.limit=50]
 * @param {number} [options.offset=0]
 * @param {string} [options.category='all']
 * @param {string} [options.userId='all']
 * @param {string} [options.search='']
 */
function getAllLogs({ limit = 50, offset = 0, category = 'all', userId = 'all', search = '' } = {}) {
  return new Promise((resolve) => {
    let query = `
      SELECT l.*, u.username as user_name, u.avatar_path, u.user_role
      FROM user_activity_logs l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (category && category !== 'all') {
      query += ` AND l.category = ?`;
      params.push(category);
    }
    if (userId && userId !== 'all') {
      query += ` AND l.user_id = ?`;
      params.push(userId);
    }
    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      query += ` AND (l.description LIKE ? OR l.performed_by LIKE ? OR l.action_type LIKE ? OR u.username LIKE ?)`;
      params.push(s, s, s, s);
    }

    query += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10) || 50, parseInt(offset, 10) || 0);

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('Error fetching all activity logs:', err.message);
        return resolve([]);
      }
      resolve(rows || []);
    });
  });
}

module.exports = {
  logActivity,
  getUserLogs,
  getAllLogs
};
