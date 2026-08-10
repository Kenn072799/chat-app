const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// REGISTER USER
exports.register = async (req, res) => {
  const { username, password } = req.body;
  const normalizedUsername = username?.toLowerCase().trim();

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (!/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) {
    return res.status(400).json({
      error: 'Username must be 3-24 characters using letters, numbers, or underscores',
    });
  }

  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be 8-128 characters' });
  }

  try {
    // This is intentionally a private, two-person app.
    const userCount = await pool.query(
      'SELECT COUNT(*)::int AS count FROM users'
    );
    if (userCount.rows[0].count >= 2) {
      return res.status(403).json({
        error: 'This private chat already has its two accounts',
      });
    }

    // 1. Check if username exists
    const userCheck = await pool.query('SELECT id FROM users WHERE username = $1', [normalizedUsername]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // 2. Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 3. Save to Neon PostgreSQL
    const newUser = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, created_at',
      [normalizedUsername, hashedPassword]
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: newUser.rows[0]
    });
  } catch (err) {
    console.error('Registration error:', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    res.status(500).json({ error: 'Server error during registration' });
  }
};

// LOGIN USER
exports.login = async (req, res) => {
  const { username, password } = req.body;
  const normalizedUsername = username?.toLowerCase().trim();

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    // 1. Find user
    const result = await pool.query(
      'SELECT id, username, password_hash FROM users WHERE username = $1',
      [normalizedUsername]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];

    // Guard against legacy/broken rows that do not contain password_hash.
    if (!user.password_hash) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // 2. Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is missing. Set it in server/.env');
      return res.status(500).json({ error: 'Server auth configuration error' });
    }

    // 3. Create JWT Token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      jwtSecret,
      { expiresIn: '30d' }
    );

    // 4. Send HTTP-Only Cookie
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json({
      message: 'Logged in successfully',
      user: { id: user.id, username: user.username }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
};

// LOGOUT USER
exports.logout = (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('token', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  });
  res.json({ message: 'Logged out successfully' });
};

// GET CURRENT LOGGED IN USER
exports.getMe = async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, created_at FROM users WHERE id = $1', [req.user.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
