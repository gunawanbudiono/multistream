const { db } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Universal IP Resolver (Cloudflare, Nginx, X-Forwarded-For, Express)
 */
function getClientIp(req) {
  if (!req) return null;
  // 1. Cloudflare
  const cfIp = req.headers && req.headers['cf-connecting-ip'];
  if (cfIp && typeof cfIp === 'string') return cfIp.trim();

  // 2. Standard X-Forwarded-For (First item in comma-separated list)
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (forwarded) {
    const list = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const clientIp = list.split(',')[0].trim();
    if (clientIp) return clientIp.replace(/^::ffff:/, '');
  }

  // 3. X-Real-IP
  const realIp = req.headers && req.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') return realIp.trim().replace(/^::ffff:/, '');

  // 4. Express req.ip
  if (req.ip) return req.ip.replace(/^::ffff:/, '');

  // 5. Socket remoteAddress
  if (req.socket && req.socket.remoteAddress) {
    return req.socket.remoteAddress.replace(/^::ffff:/, '');
  }

  return '127.0.0.1';
}

/**
 * Lightweight Zero-Dependency User-Agent Parser
 */
function parseUserAgent(ua) {
  if (!ua || typeof ua !== 'string') return null;
  let browser = 'Browser';
  let os = 'Unknown OS';
  let device = 'Desktop';
  let icon = 'ti-device-desktop';

  if (/mobile|iphone|ipod|android.*mobile/i.test(ua)) {
    device = 'Mobile';
    icon = 'ti-device-mobile';
  } else if (/ipad|tablet|android(?!.*mobile)/i.test(ua)) {
    device = 'Tablet';
    icon = 'ti-device-tablet';
  }

  if (/windows nt 10/i.test(ua)) os = 'Windows 10/11';
  else if (/windows nt 6\.3/i.test(ua)) os = 'Windows 8.1';
  else if (/windows nt 6\.1/i.test(ua)) os = 'Windows 7';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/linux/i.test(ua)) os = 'Linux';

  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua)) browser = 'Safari';

  return {
    browser,
    os,
    device,
    icon,
    label: `${browser} on ${os}`
  };
}

/**
 * Log user/admin activity for security and audit trail
 */
function logActivity({ userId, performedBy, actionType, category = 'general', description, details = null, ipAddress = null, userAgent = null, req = null }) {
  return new Promise((resolve) => {
    if (!userId) {
      return resolve();
    }
    const id = uuidv4();
    const rawIp = ipAddress || (req ? getClientIp(req) : null);
    const effectiveIp = rawIp ? String(rawIp).replace(/^::ffff:/, '').trim() : null;
    const effectiveUa = userAgent || (req && req.headers ? req.headers['user-agent'] : null);
    const detailsStr = typeof details === 'object' && details !== null ? JSON.stringify(details) : (details || null);
    
    db.run(
      `INSERT INTO user_activity_logs (id, user_id, performed_by, action_type, category, description, details, ip_address, user_agent) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        performedBy || userId || 'system',
        actionType || 'UNKNOWN',
        category || 'general',
        description || '',
        detailsStr,
        effectiveIp || null,
        effectiveUa || null
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
        const mapped = (rows || []).map(r => ({
          ...r,
          device_info: parseUserAgent(r.user_agent)
        }));
        resolve(mapped);
      }
    );
  });
}

/**
 * Get all activity logs across all users (Admin view)
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
      query += ` AND (l.description LIKE ? OR l.performed_by LIKE ? OR l.action_type LIKE ? OR u.username LIKE ? OR l.ip_address LIKE ?)`;
      params.push(s, s, s, s, s);
    }

    query += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10) || 50, parseInt(offset, 10) || 0);

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('Error fetching all activity logs:', err.message);
        return resolve([]);
      }
      const mapped = (rows || []).map(r => ({
        ...r,
        device_info: parseUserAgent(r.user_agent)
      }));
      resolve(mapped);
    });
  });
}

module.exports = {
  logActivity,
  getUserLogs,
  getAllLogs,
  getClientIp,
  parseUserAgent
};
