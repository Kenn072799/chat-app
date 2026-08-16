const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const pool = require('./config/db');
const ALLOWED_REACTIONS = new Set(['👍', '❤️', '😂', '😮', '😢', '🥰']);
const MAX_MESSAGE_LENGTH = 2000;

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

function getConversationPartner(messageRow, userId) {
  return Number(messageRow.sender_id) === Number(userId)
    ? Number(messageRow.receiver_id)
    : Number(messageRow.sender_id);
}

async function ensureMessageFeaturesSchema() {
  try {
    await pool.query(
      `ALTER TABLE messages
         ADD COLUMN IF NOT EXISTS reply_to_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL`
    );

    await pool.query(
      `ALTER TABLE messages
         ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '{}'::jsonb`
    );

    await pool.query(
      `CREATE INDEX IF NOT EXISTS messages_conversation_id_idx
         ON messages (sender_id, receiver_id, id DESC)`
    );
  } catch (error) {
    console.error('Failed to ensure message feature columns:', error);
  }
}

function initializeSocket(server) {
  const clientOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
  const io = new Server(server, {
    cors: {
      origin: clientOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  const onlineUsers = new Map();

  function addUserSocket(userId, socketId) {
    const existingSockets = onlineUsers.get(userId) || new Set();
    existingSockets.add(socketId);
    onlineUsers.set(userId, existingSockets);
  }

  function removeUserSocket(userId, socketId) {
    const existingSockets = onlineUsers.get(userId);
    if (!existingSockets) {
      return;
    }

    existingSockets.delete(socketId);
    if (existingSockets.size === 0) {
      onlineUsers.delete(userId);
      return;
    }

    onlineUsers.set(userId, existingSockets);
  }

  function emitToUser(userId, eventName, payload) {
    const userSockets = onlineUsers.get(Number(userId));
    if (!userSockets || userSockets.size === 0) {
      return;
    }

    for (const socketId of userSockets) {
      io.to(socketId).emit(eventName, payload);
    }
  }

  ensureMessageFeaturesSchema();

  io.use((socket, next) => {
    const cookieHeader = socket.request.headers.cookie;

    if (!cookieHeader) {
      return next(new Error('Auth error: No cookies'));
    }

    const tokenCookie = cookieHeader.split('; ').find((row) => row.startsWith('token='));

    if (!tokenCookie) {
      return next(new Error('Auth error: Token missing'));
    }

    const token = tokenCookie.split('=')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (error) {
      next(new Error('Auth error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = Number(socket.user.userId);
    addUserSocket(userId, socket.id);
    io.emit('online_users', Array.from(onlineUsers.keys()));

    socket.on('send_message', async ({ receiverId, content, replyToMessageId }) => {
      const numericReceiverId = Number(receiverId);
      const normalizedContent = typeof content === 'string' ? content.trim() : '';

      if (
        !normalizedContent ||
        normalizedContent.length > MAX_MESSAGE_LENGTH ||
        !Number.isInteger(numericReceiverId) ||
        numericReceiverId <= 0 ||
        numericReceiverId === userId
      ) {
        return;
      }

      try {
        if (replyToMessageId) {
          const replyCheck = await pool.query(
            `SELECT id
               FROM messages
              WHERE id = $1
                AND ((sender_id = $2 AND receiver_id = $3)
                  OR (sender_id = $3 AND receiver_id = $2))`,
            [replyToMessageId, userId, numericReceiverId]
          );

          if (replyCheck.rowCount === 0) {
            return;
          }
        }

        const result = await pool.query(
          `INSERT INTO messages (sender_id, receiver_id, content, reply_to_message_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, sender_id, receiver_id, content, created_at, reply_to_message_id, reactions`,
          [userId, numericReceiverId, normalizedContent, replyToMessageId || null]
        );

        let savedMessage = {
          ...result.rows[0],
          sender_username: socket.user.username,
          reactions: normalizeReactions(result.rows[0].reactions),
        };

        if (savedMessage.reply_to_message_id) {
          const replyMessage = await pool.query(
            `SELECT m.content, u.username AS sender_username
               FROM messages m
               JOIN users u ON m.sender_id = u.id
              WHERE m.id = $1`,
            [savedMessage.reply_to_message_id]
          );

          if (replyMessage.rowCount > 0) {
            savedMessage = {
              ...savedMessage,
              reply_to_content: replyMessage.rows[0].content,
              reply_to_sender_username: replyMessage.rows[0].sender_username,
            };
          }
        }

        socket.emit('receive_message', savedMessage);
        emitToUser(numericReceiverId, 'receive_message', savedMessage);
      } catch (error) {
        console.error('Socket message error:', error);
      }
    });

    socket.on('react_message', async ({ messageId, emoji }) => {
      if (!messageId || !ALLOWED_REACTIONS.has(emoji)) {
        return;
      }

      try {
        const messageResult = await pool.query(
          `SELECT id, sender_id, receiver_id, reactions
             FROM messages
            WHERE id = $1
              AND (sender_id = $2 OR receiver_id = $2)`,
          [messageId, userId]
        );

        if (messageResult.rowCount === 0) {
          return;
        }

        const messageRow = messageResult.rows[0];
        const reactions = normalizeReactions(messageRow.reactions);
        const reactionKey = String(userId);

        if (reactions[reactionKey] === emoji) {
          delete reactions[reactionKey];
        } else {
          reactions[reactionKey] = emoji;
        }

        await pool.query('UPDATE messages SET reactions = $1 WHERE id = $2', [
          JSON.stringify(reactions),
          messageId,
        ]);

        const payload = {
          messageId: Number(messageId),
          reactions,
        };

        const partnerId = getConversationPartner(messageRow, userId);
        socket.emit('message_reaction_updated', payload);
        emitToUser(partnerId, 'message_reaction_updated', payload);
      } catch (error) {
        console.error('Message reaction error:', error);
      }
    });

    socket.on('typing', ({ receiverId, isTyping }) => {
      emitToUser(receiverId, 'user_typing', {
        fromUserId: userId,
        isTyping: Boolean(isTyping),
      });
    });

    socket.on('mark_seen', ({ contactId, messageId }) => {
      if (!messageId) {
        return;
      }

      emitToUser(contactId, 'messages_seen', {
        fromUserId: userId,
        messageId: Number(messageId),
      });
    });

    socket.on('disconnect', () => {
      removeUserSocket(userId, socket.id);
      io.emit('online_users', Array.from(onlineUsers.keys()));
    });
  });

  return io;
}

module.exports = initializeSocket;
