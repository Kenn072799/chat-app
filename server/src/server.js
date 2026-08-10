const dotenv = require('dotenv');
const http = require('http');
const createApp = require('./app');
const initializeSocket = require('./socket');

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL in server .env');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error('Missing JWT_SECRET in server .env');
  process.exit(1);
}

const app = createApp();
const server = http.createServer(app);
initializeSocket(server);

const PORT = process.env.PORT || 5000;
server.on('error', (error) => {
  console.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});