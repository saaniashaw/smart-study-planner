/* ===================== Configuration ===================== */
const STORAGE_KEY = 'smartStudy.tasks.v1';
const THEME_KEY = 'smartStudy.theme';
const REMINDER_THRESHOLD_MIN = 60; // minutes before due to notify (can change)
const SOUND_PATH = 'assets/sounds/reminder.mp3'; // optional sound (place reminder.mp3 here)

/* ===================== App State ===================== */
let tasks = [];        // array of task objects
let editingId = null;  // when editing, holds task.id

/* ===================== DOM Refs ===================== */
const form = document.getElementById('task-form');
const titleInput = document.getElementById('title');
const subjectInput = document.getElementById('subject');
const dueInput = document.getElementById('dueDate');
const priorityInput = document.getElementById('priority');
const submitBtn = document.getElementById('submit-btn');
const cancelEditBtn = document.getElementById('cancel-edit');

const searchInput = document.getElementById('search');
const filterPriority = document.getElementById('filter-priority');
const toggleDarkBtn = document.getElementById('toggle-dark');

const taskList = document.getElementById('task-list');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const timelineContent = document.getElementById('timeline-content');

/* optional audio for reminders (if file present) */
let reminderAudio = null;
try {
  reminderAudio = new Audio(SOUND_PATH);
} catch (e) {
  reminderAudio = null;
}

/* ===================== Init ===================== */
document.addEventListener('DOMContentLoaded', init);

function init() {
  loadTheme();
  loadTasks();
  renderTasks();

  // event listeners
  form.addEventListener('submit', onSubmit);
  cancelEditBtn.addEventListener('click', cancelEdit);
  searchInput.addEventListener('input', onControlsChange);
  filterPriority.addEventListener('change', onControlsChange);
  toggleDarkBtn.addEventListener('click', toggleDarkMode);

  // periodic reminder check
  checkReminders();
  setInterval(checkReminders, 60 * 1000); // every minute
}

/* ===================== Storage Helpers ===================== */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    tasks = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to load tasks, resetting.', e);
    tasks = [];
    saveTasks();
  }
}
function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

/* ===================== Theme ===================== */
function loadTheme() {
  const t = localStorage.getItem(THEME_KEY);
  if (t === 'dark') document.body.classList.add('dark');
}
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
}

/* ===================== Task Model ===================== */
/* Task structure:
{
  id: string,
  title: string,
  subject: string,
  dueDate: ISOstring,
  priority: 'low'|'medium'|'high',
  completed: boolean,
  reminded: boolean,      // whether reminder was already shown
  createdAt: ISOstring
}
*/

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
}

/* ===================== Form / CRUD ===================== */
function onSubmit(e) {
  e.preventDefault();

  const title = titleInput.value.trim();
  if (!title) return alert('Please enter a task title');

  const dueRaw = dueInput.value;
  if (!dueRaw) return alert('Please pick a due date & time');

  const dueISO = toISODateTimeLocal(dueRaw);
  if (!dueISO) return alert('Invalid date/time');

  const subject = subjectInput.value.trim();
  const priority = priorityInput.value || 'medium';

  if (editingId) {
    const t = tasks.find(x => x.id === editingId);
    if (!t) {
      editingId = null;
      form.reset();
      return;
    }
    t.title = title;
    t.subject = subject;
    t.dueDate = dueISO;
    t.priority = priority;
    // when editing, reset reminded flag so reminder can fire again if due soon
    t.reminded = false;
    editingId = null;
    submitBtn.textContent = 'Add Task';
    cancelEditBtn.style.display = 'none';
  } else {
    const task = {
      id: generateId(),
      title,
      subject,
      dueDate: dueISO,
      priority,
      completed: false,
      reminded: false,
      createdAt: new Date().toISOString()
    };
    tasks.push(task);
  }

  saveTasks();
  form.reset();
  renderTasks();
}

/* Start editing a task */
function startEdit(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  editingId = id;
  titleInput.value = t.title;
  subjectInput.value = t.subject || '';
  dueInput.value = toDateTimeLocalValue(t.dueDate);
  priorityInput.value = t.priority;
  submitBtn.textContent = 'Save';
  cancelEditBtn.style.display = 'inline-block';
}

/* Cancel editing */
function cancelEdit() {
  editingId = null;
  form.reset();
  submitBtn.textContent = 'Add Task';
  cancelEditBtn.style.display = 'none';
}

/* Delete task */
function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  tasks = tasks.filter(x => x.id !== id);
  saveTasks();
  renderTasks();
}

/* Toggle complete */
function toggleComplete(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  t.completed = !t.completed;
  saveTasks();
  renderTasks();
}

/* When search/filter controls change */
function onControlsChange() {
  renderTasks();
}

/* ===================== Rendering ===================== */
function renderTasks() {
  // apply search and filter
  const q = (searchInput.value || '').trim().toLowerCase();
  const priorityFilter = filterPriority.value || 'all';

  const list = tasks.slice().sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate))
    .filter(t => (priorityFilter === 'all' || t.priority === priorityFilter))
    .filter(t => {
      if (!q) return true;
      return (t.title || '').toLowerCase().includes(q) || (t.subject || '').toLowerCase().includes(q);
    });

  // clear UI
  taskList.innerHTML = '';

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'task-card';
    empty.style.justifyContent = 'center';
    empty.textContent = 'No tasks found — add your first study task!';
    taskList.appendChild(empty);
  } else {
    list.forEach(t => {
      const card = document.createElement('div');
      card.className = `task-card priority-${t.priority}`;

      // left meta
      const meta = document.createElement('div');
      meta.className = 'task-meta';
      const titleEl = document.createElement('div');
      titleEl.className = 'task-title';
      titleEl.innerHTML = escapeHtml(t.title) + (t.completed ? ' <span class="task-completed">Done</span>' : '');

      const subEl = document.createElement('div');
      subEl.className = 'task-sub';
      subEl.textContent = (t.subject ? t.subject + ' • ' : '') + formatDateTimeFriendly(t.dueDate);

      meta.appendChild(titleEl);
      meta.appendChild(subEl);

      // buttons
      const btns = document.createElement('div');
      btns.className = 'btns';

      const completeBtn = document.createElement('button');
      completeBtn.textContent = t.completed ? 'Unmark' : 'Complete';
      completeBtn.onclick = () => toggleComplete(t.id);

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => startEdit(t.id);

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.onclick = () => deleteTask(t.id);

      btns.appendChild(completeBtn);
      btns.appendChild(editBtn);
      btns.appendChild(delBtn);

      card.appendChild(meta);
      card.appendChild(btns);

      taskList.appendChild(card);
    });
  }

  updateProgress();
  renderTimeline();
}

/* Progress bar update */
function updateProgress() {
  const total = tasks.length;
  const done = tasks.filter(t => t.completed).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  if (progressFill) progressFill.style.width = pct + '%';
  if (progressText) progressText.textContent = `${done} / ${total} tasks completed (${pct}%)`;
}

/* Timeline: group by date (YYYY-MM-DD) */
function renderTimeline() {
  const groups = {};
  tasks.forEach(t => {
    const key = (new Date(t.dueDate)).toISOString().slice(0,10);
    groups[key] = groups[key] || [];
    groups[key].push(t);
  });

  timelineContent.innerHTML = '';
  const dates = Object.keys(groups).sort();
  if (dates.length === 0) {
    timelineContent.innerHTML = '<div class="small">No timeline items yet</div>';
    return;
  }
  dates.forEach(dateKey => {
    const dayWrap = document.createElement('div');
    dayWrap.className = 'timeline-day';
    const header = document.createElement('div');
    header.style.fontWeight = '700';
    header.textContent = formatDateReadable(dateKey);
    dayWrap.appendChild(header);

    groups[dateKey].sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate)).forEach(t => {
      const p = document.createElement('div');
      p.className = 'small';
      p.style.marginTop = '6px';
      p.textContent = `${formatTimeShort(t.dueDate)} — ${t.title} ${t.completed ? '✅' : ''}`;
      dayWrap.appendChild(p);
    });

    timelineContent.appendChild(dayWrap);
  });
}

/* ===================== Reminders ===================== */
/* Remind when due within REMINDER_THRESHOLD_MIN and not yet reminded.
   Once reminded, set t.reminded = true so we don't spam.
   If user edits the due date we reset reminded flag in onSubmit (above).
*/
function checkReminders() {
  if (!('Notification' in window) && !reminderAudio) return; // nothing we can do

  const now = Date.now();
  const thresholdMs = REMINDER_THRESHOLD_MIN * 60 * 1000;

  tasks.forEach(t => {
    if (t.completed || t.reminded) return;
    const dueMs = new Date(t.dueDate).getTime();
    const diff = dueMs - now;

    // If due is within next threshold or slightly past (5 min grace), notify
    if (diff <= thresholdMs && diff > -5 * 60 * 1000) {
      // Try Notification API first
      if (Notification.permission === 'granted') {
        showNotification(t);
        t.reminded = true;
        saveTasks();
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            showNotification(t);
            t.reminded = true;
            saveTasks();
          } else {
            // fallback: play sound + in-app alert
            fallbackNotify(t);
            t.reminded = true;
            saveTasks();
          }
        });
      } else {
        // denied
        fallbackNotify(t);
        t.reminded = true;
        saveTasks();
      }
    }
  });
}

function showNotification(task) {
  try {
    const title = 'Task due soon';
    const options = {
      body: `${task.title} — due ${formatDateTimeFriendly(task.dueDate)}`,
      silent: true // we handle sound separately
    };
    new Notification(title, options);
    // play sound optionally
    tryPlaySound();
  } catch (e) {
    console.warn('Notification failed; using fallback', e);
    fallbackNotify(task);
  }
}

function fallbackNotify(task) {
  // minimal fallback - in-app alert and sound
  tryPlaySound();
  alert(`Reminder: "${task.title}" is due at ${formatDateTimeFriendly(task.dueDate)}`);
}

function tryPlaySound() {
  if (!reminderAudio) return;
  try {
    reminderAudio.currentTime = 0;
    reminderAudio.play().catch(() => {/* autoplay might be blocked; ignore */});
  } catch (e) {
    // ignore
  }
}

/* ===================== Utilities ===================== */

/* Convert datetime-local value ("YYYY-MM-DDTHH:mm") to ISO string */
function toISODateTimeLocal(value) {
  // If the input already looks like an ISO string, try to parse:
  // But commonly browsers give "YYYY-MM-DDTHH:MM"
  if (!value) return null;
  try {
    // If value contains 'T' and length >= 16, treat as local datetime
    if (value.indexOf('T') !== -1 && value.length >= 16) {
      // Create a Date using local parts to preserve local timezone
      const [datePart, timePart] = value.split('T');
      // If seconds missing, add ":00"
      const time = timePart.length === 5 ? timePart + ':00' : timePart;
      const isoLocal = datePart + 'T' + time;
      const d = new Date(isoLocal);
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    } else {
      const d = new Date(value);
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    }
  } catch {
    return null;
  }
}

/* Convert ISO date/time to value for datetime-local input ("YYYY-MM-DDTHH:mm") */
function toDateTimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // Get local components
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

/* Formatters */
function formatDateTimeFriendly(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
function formatDateReadable(yyyyMmDd) {
  try {
    const d = new Date(yyyyMmDd + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return yyyyMmDd;
  }
}
function formatTimeShort(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/* Simple HTML escape */
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[s]);
}