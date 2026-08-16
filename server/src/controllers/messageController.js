const pool = require('../config/db');

const DEFAULT_MESSAGE_PAGE_SIZE = 50;
const MAX_MESSAGE_PAGE_SIZE = 100;

function normalizeReactions(reactions) {
  if (!reactions) {
    return {};
  }

  if (typeof reactions === 'string') {
    try {
      return JSON.parse(reactions);
    } catch (error) {
      return {};
    }
  }

  return reactions;
}

// GET CHAT HISTORY BETWEEN TWO USERS
exports.getMessages = async (req, res) => {
  const currentUserId = req.user.userId;
  const { otherUserId } = req.params;
  const parsedOtherUserId = Number(otherUserId);
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const pageSize = Number.isNaN(requestedLimit)
    ? DEFAULT_MESSAGE_PAGE_SIZE
    : Math.min(Math.max(requestedLimit, 1), MAX_MESSAGE_PAGE_SIZE);
  const beforeId = req.query.before
    ? Number.parseInt(req.query.before, 10)
    : null;

  if (!Number.isInteger(parsedOtherUserId) || parsedOtherUserId <= 0) {
    return res.status(400).json({ error: 'Invalid conversation user' });
  }

  if (req.query.before && (!Number.isInteger(beforeId) || beforeId <= 0)) {
    return res.status(400).json({ error: 'Invalid message cursor' });
  }

  try {
    const messages = await pool.query(
      `SELECT m.id, m.sender_id, m.receiver_id, m.content, m.created_at,
              m.reply_to_message_id, m.reactions,
              u.username AS sender_username,
              reply_message.content AS reply_to_content,
              reply_sender.username AS reply_to_sender_username
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       LEFT JOIN messages reply_message ON m.reply_to_message_id = reply_message.id
       LEFT JOIN users reply_sender ON reply_message.sender_id = reply_sender.id
       WHERE (
         (m.sender_id = $1 AND m.receiver_id = $2)
         OR (m.sender_id = $2 AND m.receiver_id = $1)
       )
       AND ($3::integer IS NULL OR m.id < $3)
       ORDER BY m.id DESC
       LIMIT $4`,
      [currentUserId, parsedOtherUserId, beforeId, pageSize + 1]
    );

    const hasMore = messages.rows.length > pageSize;
    const page = messages.rows
      .slice(0, pageSize)
      .reverse()
      .map((message) => ({
        ...message,
        reactions: normalizeReactions(message.reactions),
      }));

    return res.json({
      messages: page,
      hasMore,
      nextCursor: hasMore ? page[0]?.id ?? null : null,
    });
  } catch (err) {
    console.error('Fetch messages error:', err);
    return res.status(500).json({ error: 'Failed to retrieve message history' });
  }
};

// GET ALL OTHER USERS TO CHAT WITH
exports.getUsers = async (req, res) => {
  const currentUserId = req.user.userId;

  try {
    const users = await pool.query(
      'SELECT id, username FROM users WHERE id != $1 ORDER BY created_at ASC LIMIT 1',
      [currentUserId]
    );

    res.json(users.rows);
  } catch (err) {
    console.error('Fetch users error:', err);
    res.status(500).json({ error: 'Failed to fetch user contacts' });
  }
};
