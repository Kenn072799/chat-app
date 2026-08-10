const pool = require('../config/db');

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
       WHERE (m.sender_id = $1 AND m.receiver_id = $2)
          OR (m.sender_id = $2 AND m.receiver_id = $1)
       ORDER BY m.created_at ASC`,
      [currentUserId, otherUserId]
    );

    res.json(
      messages.rows.map((message) => ({
        ...message,
        reactions: normalizeReactions(message.reactions),
      }))
    );
  } catch (err) {
    console.error('Fetch messages error:', err);
    res.status(500).json({ error: 'Failed to retrieve message history' });
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
