import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { AppError } from './ai.mjs';
import { cleanRecords, isTime } from './domain.mjs';
import { cleanTargets } from './reports.mjs';
import { normaliseEconomy } from './public/progress.js';

const derive = promisify(scrypt);
const HASH_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const SESSION_MS = 7 * 86400000;
const tokenHash = token => createHash('sha256').update(token).digest('hex');
const validObject = value => value && typeof value === 'object' && !Array.isArray(value);
function inputError(message) { throw new AppError(400, 'ACCOUNT_INPUT', message); }
function credentials(data) {
  const username = typeof data.username === 'string' ? data.username.trim().toLowerCase() : '';
  if (!/^[a-z0-9_]{3,24}$/.test(username)) inputError('帳號請使用 3 到 24 個英文字母、數字或底線。');
  if (typeof data.password !== 'string' || data.password.length < 8 || data.password.length > 128) inputError('密碼請使用 8 到 128 個字元。');
  return { username, password: data.password };
}
export function cleanProfile(value) {
  if (!validObject(value)) throw new AppError(400, 'PROFILE_INPUT', '帳號資料格式有誤。');
  const s = validObject(value.settings) ? value.settings : {};
  const settings = {};
  for (const [key, fallback] of Object.entries({ currentBedtime: '', targetBedtime: '00:30', wakeTime: '08:30' })) {
    const time = s[key] ?? fallback;
    if (!(key === 'currentBedtime' && time === '') && !isTime(time)) throw new AppError(400, 'PROFILE_INPUT', '偏好設定的時間格式有誤。');
    settings[key] = time;
  }
  for (const [key, fallback] of Object.entries({ reminders: false, saveClosures: true })) {
    if (s[key] !== undefined && typeof s[key] !== 'boolean') throw new AppError(400, 'PROFILE_INPUT', '偏好設定格式有誤。');
    settings[key] = s[key] ?? fallback;
  }
  const closures = value.closures ?? [];
  if (!Array.isArray(closures) || closures.length > 60) throw new AppError(400, 'PROFILE_INPUT', '最多保存 60 筆收尾紀錄。');
  const cleanClosures = closures.map(c => {
    if (!validObject(c) || typeof c.id !== 'string' || c.id.length > 100 || !Number.isFinite(Date.parse(c.at)) || !['phone', 'light', 'note'].includes(c.action)) throw new AppError(400, 'PROFILE_INPUT', '收尾紀錄格式有誤。');
    return { id: c.id, at: c.at, action: c.action, note: typeof c.note === 'string' ? c.note.slice(0, 140) : '' };
  });
  if (value.economy?.credits?.length > 1000 || value.economy?.transactions?.length > 2000) throw new AppError(400, 'PROFILE_INPUT', '寵物交易紀錄過多，請先匯出備份。');
  const aiPlan = validObject(value.aiPlan) ? value.aiPlan : null;
  if (aiPlan && JSON.stringify(aiPlan).length > 64000) throw new AppError(400, 'PROFILE_INPUT', '作息分析資料過大。');
  return { settings, records: cleanRecords(value.records ?? []), closures: cleanClosures, economy: normaliseEconomy(value.economy), targets: cleanTargets(value.targets ?? {}), aiPlan };
}

export function createAccountStore({ filename, now = Date.now } = {}) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      payload TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS session_expiry ON account_sessions(expires_at);`);
  let hashing = 0;
  async function hash(password, salt) {
    if (hashing >= 2) throw new AppError(503, 'AUTH_BUSY', '目前登入人數較多，請稍後再試。');
    hashing++;
    try { return await derive(password, salt, 32, HASH_OPTIONS); }
    finally { hashing--; }
  }
  const publicUser = row => ({ id: row.id, username: row.username, displayName: row.display_name });
  function session(user) {
    const token = randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').run(now());
    db.prepare('INSERT INTO account_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(tokenHash(token), user.id, now() + SESSION_MS);
    return { user, token };
  }
  async function register(data) {
    const { username, password } = credentials(data);
    const name = typeof data.displayName === 'string' ? data.displayName.trim() : username;
    if (!name || name.length > 24) inputError('暱稱請填 1 到 24 個字。');
    if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) throw new AppError(409, 'ACCOUNT_EXISTS', '這個帳號已被使用，請換一個帳號。');
    const salt = randomBytes(16).toString('hex');
    const passwordHash = `scrypt$32768$8$3$${salt}$${(await hash(password, salt)).toString('hex')}`;
    const id = randomUUID();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)').run(id, username, name, passwordHash, now());
      db.prepare('INSERT INTO profiles(user_id,updated_at) VALUES(?,?)').run(id, now());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) throw new AppError(409, 'ACCOUNT_EXISTS', '這個帳號已被使用，請換一個帳號。');
      throw error;
    }
    return session({ id, username, displayName: name });
  }
  async function login(data) {
    const { username, password } = credentials(data);
    const row = db.prepare('SELECT * FROM users WHERE username=?').get(username);
    const parts = row?.password_hash.split('$');
    const salt = parts?.[4] || '00000000000000000000000000000000';
    const actual = await hash(password, salt);
    const expected = parts ? Buffer.from(parts[5], 'hex') : Buffer.alloc(32);
    if (!row || expected.length !== actual.length || !timingSafeEqual(actual, expected)) throw new AppError(401, 'INVALID_CREDENTIALS', '帳號或密碼不正確。');
    return session(publicUser(row));
  }
  function tokenFrom(req) {
    const raw = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('night_harbor_session='))?.split('=')[1];
    return typeof raw === 'string' && /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : null;
  }
  function currentUser(req) {
    const token = tokenFrom(req);
    if (!token) return null;
    const row = db.prepare('SELECT u.id,u.username,u.display_name FROM account_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(tokenHash(token), now());
    return row ? publicUser(row) : null;
  }
  function requireUser(req) {
    const user = currentUser(req);
    if (!user) throw new AppError(401, 'LOGIN_REQUIRED', '請先登入夜泊。');
    return user;
  }
  function cookie(req, token = '') {
    const secure = req.socket.encrypted || process.env.SECURE_COOKIES === '1';
    return `night_harbor_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? SESSION_MS / 1000 : 0}${secure ? '; Secure' : ''}`;
  }
  function logout(req) {
    const token = tokenFrom(req);
    if (token) db.prepare('DELETE FROM account_sessions WHERE token_hash=?').run(tokenHash(token));
  }
  function profile(userId) {
    const row = db.prepare('SELECT payload,revision,updated_at FROM profiles WHERE user_id=?').get(userId);
    return { profile: JSON.parse(row.payload), revision: row.revision, updatedAt: row.updated_at };
  }
  function saveProfile(userId, data) {
    if (!Number.isSafeInteger(data.revision) || data.revision < 0) throw new AppError(400, 'PROFILE_INPUT', '資料版本格式有誤。');
    const payload = JSON.stringify(cleanProfile(data.profile));
    const result = db.prepare('UPDATE profiles SET payload=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?').run(payload, now(), userId, data.revision);
    if (!result.changes) throw new AppError(409, 'PROFILE_CONFLICT', '另一個裝置已更新資料。請先備份目前變更，再讀取帳號最新資料。');
    return profile(userId);
  }
  return { register, login, currentUser, requireUser, cookie, logout, profile, saveProfile, close: () => db.close() };
}
