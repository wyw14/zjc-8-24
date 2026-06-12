const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3001;
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

app.listen(PORT, () => {
  console.log(`梦境收集系统后端运行在 http://localhost:${PORT}`);
  console.log('默认账号: dreamer / 123456');
});
