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
        userId,
        performedBy || userId || 'system',
        actionType || 'UNKNOWN',
        category,
        description || '',
        detailsStr,
        ipAddress
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

module.exports = {
  logActivity,
  getUserLogs
};
