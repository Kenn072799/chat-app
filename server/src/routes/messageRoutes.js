const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/users', authMiddleware, messageController.getUsers);
router.get('/:otherUserId', authMiddleware, messageController.getMessages);

module.exports = router;