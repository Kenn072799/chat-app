const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  // Parse cookies manually or check standard headers
  const cookies = req.headers.cookie;
  let token = null;

  if (cookies) {
    const match = cookies.split('; ').find(row => row.startsWith('token='));
    if (match) token = match.split('=')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};