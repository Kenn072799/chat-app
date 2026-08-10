const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const messageRoutes = require('./routes/messageRoutes');

function createApp() {
	const app = express();
	const clientOrigin = process.env.CLIENT_URL || 'http://localhost:5173';

	app.use(express.json());
	app.use(
		cors({
			origin: clientOrigin,
			credentials: true,
		})
	);

	app.use('/api/auth', authRoutes);
	app.use('/api/messages', messageRoutes);

	return app;
}

module.exports = createApp;
