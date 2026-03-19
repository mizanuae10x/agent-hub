const API_BASE = 'https://mizan-hub-api.azurewebsites.net/api';

// Utility: API call with error handling
async function api(path, opt = {}) {
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...opt
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    console.warn(`API error ${path}:`, e.message);
    return {};
  }
}

// Utility: Format timestamp
function fmtTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'الآن';
    if (diff < 3600000) return `منذ ${Math.floor(diff / 60000)} دقيقة`;
    if (diff < 86400000) return `منذ ${Math.floor(diff / 3600000)} ساعة`;
    return d.toLocaleDateString('ar', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
}

// Utility: Status badge
function statusBadge(s) {
  const map = {
    online: ['badge-green', 'متصل'],
    offline: ['badge-gray', 'غير متصل'],
    done: ['badge-green', 'مكتمل'],
    completed: ['badge-green', 'مكتمل'],
    in_progress: ['badge-blue', 'جارٍ'],
    pending: ['badge-orange', 'معلّق'],
    failed: ['badge-red', 'فشل'],
    approved: ['badge-green', 'معتمد'],
  };
  const [cls, label] = map[s] || ['badge-gray', s || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

// =========== Dashboard ===========
async function loadDashboard() {
  const el = document.getElementById('agents');
  if (!el) return;
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>جارٍ التحميل...</span></div>`;
  const d = await api('/agents');
  const agents = d.agents || [];
  const online = agents.filter(a => a.status === 'online').length;

  // Update stats
  setTxt('stat-total', agents.length);
  setTxt('stat-online', online);

  if (agents.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">🤖</div><div>لا يوجد وكلاء</div></div>`;
    return;
  }
  el.innerHTML = agents.map(a => {
    const isOnline = a.status === 'online';
    return `<div class="card agent-card ${isOnline ? 'online' : 'offline'} fade-in">
      <h3>${a.emoji || '🤖'} ${a.name || a.agentId || 'Agent'}</h3>
      <div class="agent-status ${isOnline ? 'online' : 'offline'}">${isOnline ? 'متصل' : 'غير متصل'}</div>
      <div class="agent-org">${a.org || a.agentId || ''}</div>
      <div class="agent-last">${a.lastSeen || a.lastHeartbeat ? '🕐 ' + fmtTime(a.lastSeen || a.lastHeartbeat) : ''}</div>
    </div>`;
  }).join('');
}

function setTxt(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

// =========== Channels ===========
let activeChannel = 'general';
let pollTimer = null;
let allMessages = [];
const MY_AUTHOR = localStorage.getItem('hub-author') || 'معمار';
const KNOWN_CHANNELS = ['general', 'mizan', 'coder', 'designer', 'basira', 'ciso', 'alerts'];

function initChannels() {
  const list = document.getElementById('channelList');
  if (!list) return;

  // Set author input
  const authorEl = document.getElementById('author');
  if (authorEl) authorEl.value = MY_AUTHOR;

  list.innerHTML = KNOWN_CHANNELS.map(ch => `
    <div class="channel-item ${ch === activeChannel ? 'active' : ''}" onclick="switchChannel('${ch}')">
      <span class="channel-hash">#</span> ${ch}
    </div>
  `).join('');

  startPolling();
  document.getElementById('messageInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
}

function switchChannel(ch) {
  activeChannel = ch;
  allMessages = [];
  document.querySelectorAll('.channel-item').forEach(el => {
    el.classList.toggle('active', el.textContent.trim() === ch);
  });
  const hdr = document.getElementById('channelName');
  if (hdr) hdr.textContent = '#' + ch;
  startPolling();
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  loadMessages();
  pollTimer = setInterval(loadMessages, 5000);
}

async function loadMessages() {
  const el = document.getElementById('messages');
  if (!el) return;
  const d = await api(`/channels/${encodeURIComponent(activeChannel)}/messages`);
  const msgs = d.messages || [];

  // Only re-render if changed
  if (JSON.stringify(msgs) === JSON.stringify(allMessages)) return;
  allMessages = msgs;

  if (msgs.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">💬</div><div>لا رسائل بعد</div></div>`;
    return;
  }

  const authorEl = document.getElementById('author');
  const me = authorEl?.value || MY_AUTHOR;

  el.innerHTML = msgs.slice(-100).map(m => {
    const isMine = m.author === me;
    return `<div class="msg ${isMine ? 'mine' : ''} fade-in">
      <div class="msg-bubble">${escHtml(m.text || '')}</div>
      <div class="msg-meta">
        ${!isMine ? `<span class="msg-author">${m.author || '?'}</span>` : ''}
        <span>${fmtTime(m.ts)}</span>
      </div>
    </div>`;
  }).join('');

  // Auto-scroll to bottom
  el.scrollTop = el.scrollHeight;
}

async function sendMessage() {
  const authorEl = document.getElementById('author');
  const inputEl = document.getElementById('messageInput');
  if (!inputEl) return;
  const text = inputEl.value.trim();
  if (!text) return;
  const author = authorEl?.value || MY_AUTHOR;
  localStorage.setItem('hub-author', author);
  inputEl.disabled = true;
  await api(`/channels/${encodeURIComponent(activeChannel)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ author, text })
  });
  inputEl.value = '';
  inputEl.disabled = false;
  inputEl.focus();
  loadMessages();
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

// =========== Skills ===========
async function loadSkills() {
  const el = document.getElementById('skills');
  if (!el) return;
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>جارٍ التحميل...</span></div>`;
  const d = await api('/skills');
  const skills = d.skills || [];

  if (skills.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">🛠️</div><div>لا مهارات</div></div>`;
    return;
  }
  el.innerHTML = skills.map(s => `
    <div class="card fade-in">
      <h3>🛠️ ${s.name}</h3>
      <p style="font-size:13px;color:var(--text2);margin-top:6px">${s.description || s.desc || ''}</p>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px">
        <span class="${s.approved ? 'skill-approved' : 'skill-pending'}">${s.approved ? '✅ معتمد' : '⏳ انتظار'}</span>
        ${!s.approved ? `<button class="btn btn-sm" onclick="approveSkill('${s.id}')">اعتماد</button>` : ''}
      </div>
    </div>
  `).join('');
}

async function approveSkill(id) {
  await api(`/skills/${id}/approve`, { method: 'POST' });
  loadSkills();
}

// =========== Tasks ===========
async function loadTasks() {
  const el = document.getElementById('tasksBody');
  if (!el) return;
  el.innerHTML = `<tr><td colspan="5" class="loading"><div class="spinner"></div> جارٍ التحميل...</td></tr>`;
  const d = await api('/tasks');
  const tasks = d.tasks || [];

  const countEl = document.getElementById('taskCount');
  if (countEl) countEl.textContent = tasks.length;

  if (tasks.length === 0) {
    el.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text3)">لا مهام</td></tr>`;
    return;
  }
  el.innerHTML = tasks.map(t => `
    <tr class="fade-in">
      <td class="td-id" title="${t.id || ''}">${(t.id || '').substring(0, 8)}</td>
      <td style="font-weight:600">${t.title || t.task || '—'}</td>
      <td>${t.owner || t.assignee || '—'}</td>
      <td>${t.priority ? priorityBadge(t.priority) : '—'}</td>
      <td>${statusBadge(t.status)}</td>
    </tr>
  `).join('');
}

function priorityBadge(p) {
  const map = { urgent: 'badge-red', high: 'badge-orange', normal: 'badge-blue', low: 'badge-gray' };
  const labels = { urgent: '🚨 عاجل', high: '🔴 عالي', normal: '🔵 عادي', low: '⚪ منخفض' };
  return `<span class="badge ${map[p] || 'badge-gray'}">${labels[p] || p}</span>`;
}

// =========== Feed ===========
const FEED_ICONS = {
  video_created: { icon: '🎬', cls: 'badge-purple' },
  content_published: { icon: '📢', cls: 'badge-blue' },
  task_completed: { icon: '✅', cls: 'badge-green' },
  integration_built: { icon: '🔗', cls: 'badge-gold' },
  business_opportunity: { icon: '💼', cls: 'badge-orange' },
  alert: { icon: '🚨', cls: 'badge-red' },
  update: { icon: '🔄', cls: 'badge-gray' },
};

async function loadFeed() {
  const el = document.getElementById('feedList');
  if (!el) return;
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>جارٍ التحميل...</span></div>`;
  const d = await api('/feed');
  const items = (d.items || []).slice(0, 200);

  const countEl = document.getElementById('feedCount');
  if (countEl) countEl.textContent = items.length;

  if (items.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">📋</div><div>لا أنشطة</div></div>`;
    return;
  }
  el.innerHTML = items.map((item, i) => {
    const { icon, cls } = FEED_ICONS[item.type] || { icon: '📌', cls: 'badge-gray' };
    const text = item.text || item.summary || item.title || JSON.stringify(item);
    return `
      ${i > 0 ? '<div class="feed-divider"></div>' : ''}
      <div class="feed-item fade-in">
        <div class="feed-icon" style="background:var(--bg4)">${icon}</div>
        <div class="feed-content">
          <div class="feed-title">${text}</div>
          <div class="feed-meta">
            <span class="badge ${cls}" style="font-size:10px">${item.type || 'event'}</span>
            <span style="margin-right:8px">${fmtTime(item.ts)}</span>
            ${item.by ? `<span>بواسطة: ${item.by}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// =========== Init ===========
document.addEventListener('DOMContentLoaded', () => {
  // Highlight active nav
  const p = location.pathname;
  document.querySelectorAll('nav a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === p || (p === '/' && href === '/index.html') || p.endsWith(href.replace('/', ''))) {
      a.classList.add('active');
    }
  });

  // Page-specific init — retry to handle CORS preflight caching delay
  setTimeout(loadDashboard, 100);
  setTimeout(loadDashboard, 1500);
  setTimeout(loadSkills, 200);
  setTimeout(loadFeed, 300);
  setTimeout(loadTasks, 400);
  initChannels();
});
