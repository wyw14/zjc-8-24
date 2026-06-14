const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3124;
const JWT_SECRET = 'dream-secret-key-2024';

const DATA_DIR = path.join(__dirname, 'data');
const DREAMS_FILE = path.join(DATA_DIR, 'dreams.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

app.use(cors());
app.use(express.json());

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function initUsers() {
  const users = readJSON(USERS_FILE);
  if (users.length === 0) {
    const defaultUser = {
      id: 1,
      username: 'dreamer',
      password: bcrypt.hashSync('123456', 10)
    };
    writeJSON(USERS_FILE, [defaultUser]);
  }
}

function initDreams() {
  const dreams = readJSON(DREAMS_FILE);
  if (dreams.length === 0) {
    const sampleDreams = [
      {
        id: 1,
        userId: 1,
        content: '在一片紫色的云海中漂浮，远处有一座发光的水晶城堡，城堡的塔尖直插云霄。',
        lucidity: 5,
        date: '2026-06-01'
      },
      {
        id: 2,
        userId: 1,
        content: '梦见自己变成了一只鸟，在城市上空飞翔，下面的人群像蚂蚁一样小。',
        lucidity: 3,
        date: '2026-06-05'
      },
      {
        id: 3,
        userId: 1,
        content: '在海底漫步，周围是五颜六色的珊瑚和会发光的鱼，我可以在水中呼吸。',
        lucidity: 4,
        date: '2026-06-10'
      },
      {
        id: 4,
        userId: 1,
        content: '梦见了很久没见的老朋友，我们在一片向日葵花田里聊天。',
        lucidity: 2,
        date: '2026-05-20'
      },
      {
        id: 5,
        userId: 1,
        content: '在太空里行走，地球就在脚下，星星近得伸手就能摸到。',
        lucidity: 5,
        date: '2026-05-15'
      },
      {
        id: 6,
        userId: 1,
        content: '梦见自己在图书馆里，每本书打开都会飞出不同颜色的蝴蝶。',
        lucidity: 4,
        date: '2026-06-12'
      }
    ];
    writeJSON(DREAMS_FILE, sampleDreams);
  }
}

initUsers();
initDreams();

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'token无效' });
    }
    req.user = user;
    next();
  });
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.username === username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, username: user.username } });
});

app.get('/api/dreams', authenticateToken, (req, res) => {
  const dreams = readJSON(DREAMS_FILE).filter(d => d.userId === req.user.id);
  res.json(dreams.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/dreams', authenticateToken, (req, res) => {
  const { content, lucidity, date } = req.body;
  if (!content || !lucidity || !date) {
    return res.status(400).json({ error: '内容、清醒度和日期必填' });
  }

  const dreams = readJSON(DREAMS_FILE);
  const newDream = {
    id: dreams.length > 0 ? Math.max(...dreams.map(d => d.id)) + 1 : 1,
    userId: req.user.id,
    content,
    lucidity: parseInt(lucidity),
    date
  };

  dreams.push(newDream);
  writeJSON(DREAMS_FILE, dreams);
  res.status(201).json(newDream);
});

app.get('/api/dreams/random', authenticateToken, (req, res) => {
  const userDreams = readJSON(DREAMS_FILE).filter(d => d.userId === req.user.id);
  if (userDreams.length === 0) {
    return res.status(404).json({ error: '还没有梦境记录' });
  }
  const randomDream = userDreams[Math.floor(Math.random() * userDreams.length)];
  res.json(randomDream);
});

app.get('/api/stats/monthly', authenticateToken, (req, res) => {
  const { month, year } = req.query;
  const now = new Date();
  const targetYear = year ? parseInt(year) : now.getFullYear();
  const targetMonth = month ? parseInt(month) : now.getMonth() + 1;

  const userDreams = readJSON(DREAMS_FILE).filter(d => {
    if (d.userId !== req.user.id) return false;
    const dDate = new Date(d.date);
    return dDate.getFullYear() === targetYear && (dDate.getMonth() + 1) === targetMonth;
  });

  const count = userDreams.length;
  const avgLucidity = count > 0
    ? (userDreams.reduce((sum, d) => sum + d.lucidity, 0) / count).toFixed(1)
    : 0;

  res.json({
    year: targetYear,
    month: targetMonth,
    count,
    avgLucidity: parseFloat(avgLucidity)
  });
});

function isValidDream(d) {
  if (typeof d !== 'object' || d === null) return { valid: false, reason: 'data' };
  if (typeof d.content !== 'string' || !d.content.trim()) return { valid: false, reason: 'content' };
  if (typeof d.lucidity !== 'number' && typeof d.lucidity !== 'string') {
    return { valid: false, reason: 'lucidity_type' };
  }
  if (typeof d.lucidity === 'string' && !/^\d+$/.test(d.lucidity.trim())) {
    return { valid: false, reason: 'lucidity_format' };
  }
  if (typeof d.lucidity === 'number' && !Number.isInteger(d.lucidity)) {
    return { valid: false, reason: 'lucidity_decimal' };
  }
  const lucidity = parseInt(d.lucidity);
  if (isNaN(lucidity) || lucidity < 1 || lucidity > 5) return { valid: false, reason: 'lucidity_range' };
  if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
    return { valid: false, reason: 'date_format' };
  }
  const [y, m, day] = d.date.split('-').map(Number);
  const dt = new Date(y, m - 1, day);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== day ||
    isNaN(dt.getTime())
  ) {
    return { valid: false, reason: 'date_invalid' };
  }
  if (y < 1900 || y > 9999) {
    return { valid: false, reason: 'date_range' };
  }
  return { valid: true, lucidity };
}

function isSameDream(a, b) {
  return a.content.trim() === b.content.trim() && a.date === b.date;
}

app.post('/api/dreams/preview', authenticateToken, (req, res) => {
  const uploadData = req.body.dreams;
  if (!Array.isArray(uploadData)) {
    return res.status(400).json({ error: 'JSON格式错误，需为数组格式' });
  }

  const existingDreams = readJSON(DREAMS_FILE).filter(d => d.userId === req.user.id);
  const validDreams = [];
  const invalidDreams = [];
  const duplicateDreams = [];

  for (const item of uploadData) {
    const check = isValidDream(item);
    if (!check.valid) {
      invalidDreams.push({ ...item, __reason: check.reason });
      continue;
    }
    const normalized = {
      content: item.content,
      lucidity: check.lucidity,
      date: item.date
    };
    const isDuplicate = existingDreams.some(d => isSameDream(d, normalized))
      || validDreams.some(d => isSameDream(d, normalized));
    if (isDuplicate) {
      duplicateDreams.push(normalized);
    } else {
      validDreams.push(normalized);
    }
  }

  res.json({
    total: uploadData.length,
    validCount: validDreams.length,
    invalidCount: invalidDreams.length,
    duplicateCount: duplicateDreams.length,
    validDreams,
    invalidDreams,
    duplicateDreams
  });
});

app.post('/api/dreams/confirm', authenticateToken, (req, res) => {
  const validDreams = req.body.validDreams;
  if (!Array.isArray(validDreams)) {
    return res.status(400).json({ error: '数据格式错误' });
  }

  const allDreams = readJSON(DREAMS_FILE);
  let nextId = allDreams.length > 0 ? Math.max(...allDreams.map(d => d.id)) + 1 : 1;

  const confirmed = [];
  const existingDreams = allDreams.filter(d => d.userId === req.user.id);

  for (const d of validDreams) {
    const check = isValidDream(d);
    if (!check.valid) continue;
    const normalized = {
      content: d.content,
      lucidity: check.lucidity,
      date: d.date
    };
    const isDuplicate = existingDreams.some(ed => isSameDream(ed, normalized))
      || confirmed.some(cd => isSameDream(cd, normalized));
    if (isDuplicate) continue;
    const newDream = {
      id: nextId++,
      userId: req.user.id,
      ...normalized
    };
    allDreams.push(newDream);
    confirmed.push(newDream);
  }

  writeJSON(DREAMS_FILE, allDreams);
  res.json({ imported: confirmed.length, dreams: confirmed });
});

app.listen(PORT, () => {
  console.log(`梦境收集系统后端运行在 http://localhost:${PORT}`);
  console.log('默认账号: dreamer / 123456');
});
