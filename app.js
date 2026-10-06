/**
 * SANKALP — Core Application Script (app.js)
 * Fully tailored to the updated Sankalp DOM and design system.
 */
(() => {
  'use strict';

  /* ==========================================================================
     1. CONSTANTS & CONFIGURATION
     ========================================================================== */
  const STORAGE_KEY = 'sankalp.v1';
  const EXAM_KEY = 'sankalp_exam_desk_v1';
  const DB_NAME = 'sankalp-files-v1';
  const DB_VERSION = 1;
  const DB_STORE = 'documents';
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

  const QUOTES = [
    'Small progress is still progress.',
    'You are allowed to learn one step at a time.',
    'Show up for the goal you believe in.',
    'A little focus can change the shape of your day.',
    'Keep your संकल्प. Make it happen.',
    'Consistency beats intensity every single time.',
    'Focus on the process, and the results will take care of themselves.'
  ];

  /* ==========================================================================
     2. HELPER UTILITIES
     ========================================================================== */
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  const localDateStr = (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const isoToday = () => localDateStr();

  const esc = (text = '') =>
    String(text ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));

  const fmtMinutes = (mins) => {
    mins = Math.max(0, Math.round(mins));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  };

  const fmtLongTime = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatDisplayDate = (dStr) => {
    if (!dStr) return '';
    const date = new Date(`${dStr}T00:00:00`);
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
  };

  const formatFileSize = (bytes) => {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };

  const daysUntil = (targetDateStr) => {
    if (!targetDateStr) return 0;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(`${targetDateStr}T00:00:00`);
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  };

  /* ==========================================================================
     3. TOAST SYSTEM
     ========================================================================== */
  let toastTimeout = null;
  const showToast = (message) => {
    const toastEl = $('#toast');
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2800);
  };

  /* ==========================================================================
     4. APPLICATION STATE & PERSISTENCE
     ========================================================================== */
  const defaultState = () => ({
    version: 1,
    settings: {
      theme: 'system',
      dailyGoal: 120,
      reminders: false,
      reminderTime: '18:00'
    },
    goals: [],
    sessions: [],
    events: [],
    checkins: []
  });

  const defaultExamData = () => ({
    exams: [],
    subjects: [],
    notes: []
  });

  let state = loadAppState();
  let examData = loadExamData();

  function loadAppState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return {
        ...defaultState(),
        ...parsed,
        settings: { ...defaultState().settings, ...(parsed.settings || {}) },
        goals: Array.isArray(parsed.goals) ? parsed.goals : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        events: Array.isArray(parsed.events) ? parsed.events : [],
        checkins: Array.isArray(parsed.checkins) ? parsed.checkins : []
      };
    } catch (e) {
      console.error('Failed to load application state:', e);
      return defaultState();
    }
  }

  function saveAppState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('Storage full or unavailable:', e);
      showToast('Could not save changes. Local storage may be full.');
      return false;
    }
  }

  function loadExamData() {
    try {
      const raw = localStorage.getItem(EXAM_KEY);
      if (!raw) return defaultExamData();
      const parsed = JSON.parse(raw);
      return {
        exams: Array.isArray(parsed.exams) ? parsed.exams : [],
        subjects: Array.isArray(parsed.subjects) ? parsed.subjects : [],
        notes: Array.isArray(parsed.notes) ? parsed.notes : []
      };
    } catch (e) {
      console.error('Failed to load Exam Desk state:', e);
      return defaultExamData();
    }
  }

  function saveExamData() {
    try {
      localStorage.setItem(EXAM_KEY, JSON.stringify(examData));
      return true;
    } catch (e) {
      console.error('Storage full or unavailable:', e);
      showToast('Could not save Exam Desk data.');
      return false;
    }
  }

  /* ==========================================================================
     5. INDEXEDDB FILE STORAGE (DOCUMENTS)
     ========================================================================== */
  const dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  async function listDocuments() {
    try {
      const db = await dbPromise;
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const store = tx.objectStore(DB_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.error('Error fetching documents from IndexedDB:', e);
      return [];
    }
  }

  async function storeDocument(record) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      store.add(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted.'));
    });
  }

  async function removeDocument(id) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /* ==========================================================================
     6. THEME & NAVIGATION
     ========================================================================== */
  let activePage = 'home';
  let calendarCursor = new Date();

  function applyTheme() {
    const pref = state.settings.theme || 'system';
    const isLight = pref === 'light' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
    document.body.dataset.theme = isLight ? 'light' : 'dark';

    const themeToggleBtn = $('#themeToggle');
    if (themeToggleBtn) {
      themeToggleBtn.innerHTML = `${isLight ? '☀' : '☾'} <span>Appearance</span>`;
    }
    const appearanceSelect = $('#appearance');
    if (appearanceSelect) {
      appearanceSelect.value = pref;
    }
  }

  function syncMobileNavScroll() {
    const activeBtn = $('.mobile-nav .nav-item.active');
    if (activeBtn) {
      activeBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }

  function navigate(page) {
    if (!$(`#page-${page}`)) return;
    activePage = page;

    // Toggle pages
    $$('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));

    // Toggle all navigation buttons (sidebar + mobile nav)
    $$('[data-page]').forEach(b => {
      if (b.classList.contains('nav-item')) {
        b.classList.toggle('active', b.dataset.page === page);
      }
    });

    // Update topbar title
    const titles = {
      home: 'Good day.',
      goals: 'Your goals',
      schedule: 'Your schedule',
      focus: 'Focus mode',
      files: 'Your documents',
      progress: 'Your progress',
      examdesk: 'Exam Desk',
      about: 'About Sankalp',
      settings: 'Your settings'
    };
    const titleEl = $('#pageTitle');
    if (titleEl) {
      titleEl.textContent = titles[page] || 'Sankalp';
    }

    // Dynamic renders on entry
    if (page === 'schedule') renderCalendar();
    if (page === 'progress') renderProgress();
    if (page === 'examdesk') renderExamDesk();
    if (page === 'files') renderFiles();

    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(syncMobileNavScroll, 80);
  }

  /* ==========================================================================
     7. MODAL SYSTEM
     ========================================================================== */
  const modalEl = $('#modal');
  const modalForm = $('#modalForm');
  const modalTitle = $('#modalTitle');
  const modalEyebrow = $('#modalEyebrow');
  const modalBody = $('#modalBody');
  const modalActions = $('#modalActions');

  function openModal(title, eyebrow, bodyHTML, actionsHTML) {
    if (!modalEl) return;
    if (modalTitle) modalTitle.textContent = title;
    if (modalEyebrow) modalEyebrow.textContent = eyebrow;
    if (modalBody) modalBody.innerHTML = bodyHTML;
    if (modalActions) modalActions.innerHTML = actionsHTML;

    // Bind cancel actions automatically
    $$('[data-cancel], [value="cancel"]', modalEl).forEach(b => {
      b.onclick = (e) => {
        e.preventDefault();
        closeModal();
      };
    });

    if (typeof modalEl.showModal === 'function') {
      modalEl.showModal();
    }
  }

  function closeModal() {
    if (modalEl && modalEl.open) {
      modalEl.close();
      if (modalBody) modalBody.innerHTML = '';
      if (modalActions) modalActions.innerHTML = '';
      if (modalForm) modalForm.onsubmit = null;
    }
  }

  /* ==========================================================================
     8. FOCUS TIMER (ACCURATE TIMESTAMP-BASED)
     ========================================================================== */
  const timer = {
    running: false,
    startedAt: null,
    elapsed: 0,
    interval: null
  };

  function getTimerElapsedMs() {
    return timer.elapsed + (timer.running && timer.startedAt ? Date.now() - timer.startedAt : 0);
  }

  function updateTimerUI() {
    const display = $('#timerDisplay');
    if (display) {
      display.textContent = fmtLongTime(getTimerElapsedMs());
    }
  }

  function startTimer() {
    if (timer.running) return;
    timer.running = true;
    timer.startedAt = Date.now();
    clearInterval(timer.interval);
    timer.interval = setInterval(updateTimerUI, 300);

    const statusEl = $('#timerStatus');
    const dotEl = $('#timerDot');
    const timerStateEl = $('.timer-state');

    if (statusEl) statusEl.textContent = 'You’re in a focus session';
    if (dotEl) dotEl.style.opacity = '1';
    if (timerStateEl) timerStateEl.classList.add('running');

    $('#timerStart')?.classList.add('hidden');
    $('#timerPause')?.classList.remove('hidden');
    $('#timerResume')?.classList.add('hidden');
    $('#timerReset')?.classList.remove('hidden');
    $('#timerFinish')?.classList.remove('hidden');

    updateTimerUI();
  }

  function pauseTimer() {
    if (!timer.running) return;
    timer.elapsed = getTimerElapsedMs();
    timer.running = false;
    timer.startedAt = null;
    clearInterval(timer.interval);

    const statusEl = $('#timerStatus');
    const timerStateEl = $('.timer-state');

    if (statusEl) statusEl.textContent = 'Paused';
    if (timerStateEl) timerStateEl.classList.remove('running');

    $('#timerPause')?.classList.add('hidden');
    $('#timerResume')?.classList.remove('hidden');
  }

  function resetTimer() {
    timer.running = false;
    timer.elapsed = 0;
    timer.startedAt = null;
    clearInterval(timer.interval);

    const display = $('#timerDisplay');
    const statusEl = $('#timerStatus');
    const dotEl = $('#timerDot');
    const timerStateEl = $('.timer-state');

    if (display) display.textContent = '00:00:00';
    if (statusEl) statusEl.textContent = 'Ready when you are';
    if (dotEl) dotEl.style.opacity = '0.3';
    if (timerStateEl) timerStateEl.classList.remove('running');

    $('#timerStart')?.classList.remove('hidden');
    $('#timerPause')?.classList.add('hidden');
    $('#timerResume')?.classList.add('hidden');
    $('#timerReset')?.classList.add('hidden');
    $('#timerFinish')?.classList.add('hidden');
  }

  function finishTimer() {
    const elapsedMs = getTimerElapsedMs();
    const minutes = Math.max(1, Math.round(elapsedMs / 60000));

    if (elapsedMs < 15000) {
      showToast('Focus for at least a minute before logging a session.');
      return;
    }

    const goalSelect = $('#sessionGoal');
    const subjectInput = $('#sessionSubject');
    const noteInput = $('#sessionNote');

    const selectedGoalId = goalSelect?.value || '';
    const goal = state.goals.find(g => g.id === selectedGoalId);
    const subject = subjectInput?.value.trim() || (goal ? goal.name : 'Focused Study');
    const note = noteInput?.value.trim() || '';

    const newSession = {
      id: uid(),
      date: isoToday(),
      minutes,
      subject,
      goalId: selectedGoalId,
      note,
      createdAt: new Date().toISOString()
    };

    state.sessions.push(newSession);
    saveAppState();
    resetTimer();

    if (noteInput) noteInput.value = '';
    renderAll();
    showToast(`${fmtMinutes(minutes)} logged to your study progress.`);

    // Gentle check-in prompt if not done today
    if (!state.checkins.some(c => c.date === isoToday())) {
      setTimeout(() => {
        if (confirm('Great focus session! Would you like to log your quick daily check-in now?')) {
          openCheckinModal();
        }
      }, 350);
    }
  }

  function getTodayStudiedMinutes() {
    const historical = state.sessions
      .filter(s => s.date === isoToday())
      .reduce((sum, s) => sum + s.minutes, 0);
    const live = timer.running ? Math.floor(getTimerElapsedMs() / 60000) : 0;
    return historical + live;
  }

  /* ==========================================================================
     9. GOALS & MILESTONES
     ========================================================================== */
  function getGoalCompletionPercent(goal) {
    const milestones = goal.milestones || [];
    if (!milestones.length) return goal.done ? 100 : 0;
    const completed = milestones.filter(m => m.done).length;
    return Math.round((completed / milestones.length) * 100);
  }

  function renderGoalCards(container, goals) {
    if (!container) return;
    container.innerHTML = goals.map(goal => {
      const ms = goal.milestones || [];
      const doneCount = ms.filter(m => m.done).length;
      const pct = getGoalCompletionPercent(goal);
      const isComplete = goal.done || (ms.length > 0 && doneCount === ms.length);

      return `
        <article class="card goal-card" data-goal="${esc(goal.id)}">
          <div class="goal-card-head">
            <div>
              <p class="eyebrow green">
                ${esc((goal.category || 'Learning').toUpperCase())}
                ${goal.targetDate ? ` · DUE ${esc(formatDisplayDate(goal.targetDate).toUpperCase())}` : ''}
                ${isComplete ? ' · COMPLETED' : ''}
              </p>
              <h3 class="goal-title">${esc(goal.name)}</h3>
              ${goal.why ? `<p class="goal-reason">${esc(goal.why)}</p>` : ''}
            </div>
            <button class="icon-button goal-menu" aria-label="Edit ${esc(goal.name)}">⋯</button>
          </div>

          ${ms.length ? `
            <div class="goal-path" aria-label="Milestone journey">
              ${ms.map((m, i) => `
                <div class="path-step ${m.done ? 'done' : ''}" title="${esc(m.name)}">
                  <span class="path-dot">${m.done ? '✓' : i + 1}</span>
                  <span>${esc(m.name)}</span>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="empty-state" style="padding: 12px; margin: 10px 0;">No milestones yet. Map your first step!</div>
          `}

          ${ms.length ? `
            <details class="milestone-manager" style="margin-top: 10px;">
              <summary style="cursor:pointer; font-size:12px; font-weight:600; opacity:0.8;">Manage milestones (${doneCount}/${ms.length})</summary>
              <div class="manage-step-list" style="display:grid; gap:8px; margin-top:8px;">
                ${ms.map((m, i) => `
                  <div class="manage-step" data-step="${esc(m.id)}" style="display:flex; align-items:center; gap:8px;">
                    <button class="step-toggle" aria-label="${m.done ? 'Reopen' : 'Complete'} ${esc(m.name)}" style="background:none; border:1px solid rgba(127,127,127,0.3); border-radius:50%; width:24px; height:24px; cursor:pointer;">
                      ${m.done ? '✓' : '○'}
                    </button>
                    <span class="manage-step-name" style="flex:1; min-width:0; font-size:13px;">
                      <strong>${esc(m.name)}</strong>
                      ${m.deadline ? `<small style="display:block; opacity:0.7;">Due ${esc(formatDisplayDate(m.deadline))}</small>` : ''}
                    </span>
                    <button class="text-small step-edit" style="background:none; border:0; cursor:pointer; font-size:11px;">Edit</button>
                    <button class="text-small step-up" ${i === 0 ? 'disabled' : ''} style="background:none; border:0; cursor:pointer;">↑</button>
                    <button class="text-small step-down" ${i === ms.length - 1 ? 'disabled' : ''} style="background:none; border:0; cursor:pointer;">↓</button>
                    <button class="text-small step-delete" style="background:none; border:0; color:#ef4444; cursor:pointer;">×</button>
                  </div>
                `).join('')}
              </div>
            </details>
          ` : ''}

          <div class="goal-footer" style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; padding-top:10px; border-top:1px solid rgba(127,127,127,0.15);">
            <span class="goal-progress" style="font-size:12px; opacity:0.85;">
              ${isComplete ? 'Goal completed!' : `${pct}% completed · ${doneCount} of ${ms.length} milestones`}
            </span>
            <div class="goal-actions" style="display:flex; gap:6px;">
              <button class="button quiet small add-milestone">＋ Step</button>
              ${ms.some(m => !m.done) && !goal.done ? `<button class="button quiet small complete-next">Complete Next</button>` : ''}
              ${!goal.done ? `<button class="button quiet small finish-goal">Mark Done</button>` : ''}
              <button class="button quiet small delete-goal" style="color:#ef4444;">Delete</button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    wireGoalCardEvents(container);
  }

  function wireGoalCardEvents(root) {
    $$('.goal-card', root).forEach(card => {
      const goalId = card.dataset.goal;
      const goal = state.goals.find(g => g.id === goalId);
      if (!goal) return;

      $('.goal-menu', card)?.addEventListener('click', () => openGoalFormModal(goal));
      $('.add-milestone', card)?.addEventListener('click', () => openMilestoneFormModal(goal));
      $('.delete-goal', card)?.addEventListener('click', () => deleteGoal(goal));

      $('.complete-next', card)?.addEventListener('click', () => {
        const nextMilestone = (goal.milestones || []).find(m => !m.done);
        if (nextMilestone) {
          nextMilestone.done = true;
          nextMilestone.completedAt = isoToday();
          saveAppState();
          renderAll();
          showToast(`Milestone completed: ${nextMilestone.name}`);
        }
      });

      $('.finish-goal', card)?.addEventListener('click', () => {
        goal.done = true;
        goal.completedAt = isoToday();
        (goal.milestones || []).forEach(m => {
          if (!m.done) {
            m.done = true;
            m.completedAt = isoToday();
          }
        });
        saveAppState();
        renderAll();
        showToast(`Goal completed: ${goal.name}!`);
      });

      $$('.manage-step', card).forEach(row => {
        const stepId = row.dataset.step;
        const milestone = (goal.milestones || []).find(m => m.id === stepId);
        if (!milestone) return;

        $('.step-toggle', row)?.addEventListener('click', () => {
          milestone.done = !milestone.done;
          milestone.completedAt = milestone.done ? isoToday() : '';
          saveAppState();
          renderAll();
        });

        $('.step-edit', row)?.addEventListener('click', () => openMilestoneFormModal(goal, milestone));

        $('.step-up', row)?.addEventListener('click', () => {
          const idx = goal.milestones.indexOf(milestone);
          if (idx > 0) {
            goal.milestones.splice(idx, 1);
            goal.milestones.splice(idx - 1, 0, milestone);
            saveAppState();
            renderAll();
          }
        });

        $('.step-down', row)?.addEventListener('click', () => {
          const idx = goal.milestones.indexOf(milestone);
          if (idx < goal.milestones.length - 1) {
            goal.milestones.splice(idx, 1);
            goal.milestones.splice(idx + 1, 0, milestone);
            saveAppState();
            renderAll();
          }
        });

        $('.step-delete', row)?.addEventListener('click', () => {
          if (confirm(`Remove milestone "${milestone.name}"?`)) {
            goal.milestones = goal.milestones.filter(m => m.id !== milestone.id);
            saveAppState();
            renderAll();
            showToast('Milestone removed.');
          }
        });
      });
    });
  }

  function openGoalFormModal(goal = null) {
    const isEdit = Boolean(goal);
    const current = goal || { name: '', why: '', targetDate: '', category: 'Learning', milestones: [] };

    const bodyHTML = `
      <div style="display:grid; gap:12px;">
        <label class="form-field" style="display:grid; gap:4px; font-size:12px; font-weight:600;">
          Goal Name
          <input name="name" id="goalInputName" required maxlength="90" value="${esc(current.name)}" placeholder="e.g. Master Organic Chemistry" style="padding:10px; border-radius:10px; border:1px solid rgba(127,127,127,0.3); background:transparent; color:inherit;">
        </label>
        <label class="form-field" style="display:grid; gap:4px; font-size:12px; font-weight:600;">
          Why does this matter to you?
          <textarea name="why" id="goalInputWhy" maxlength="250" placeholder="A meaningful reason keeps you going..." style="padding:10px; border-radius:10px; border:1px solid rgba(127,127,127,0.3); background:transparent; color:inherit; min-height:70px;">${esc(current.why || '')}</textarea>
        </label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <label class="form-field" style="display:grid; gap:4px; font-size:12px; font-weight:600;">
            Target Date
            <input name="targetDate" id="goalInputDate" type="date" value="${esc(current.targetDate || '')}" style="padding:10px; border-radius:10px; border:1px solid rgba(127,127,127,0.3); background:transparent; color:inherit;">
          </label>
          <label class="form-field" style="display:grid; gap:4px; font-size:12px; font-weight:600;">
            Category
            <select name="category" id="goalInputCategory" style="padding:10px; border-radius:10px; border:1px solid rgba(127,127,127,0.3); background:transparent; color:inherit;">
              ${['Learning', 'Exams', 'Study', 'Personal', 'Health', 'Career', 'Other'].map(c => `
                <option value="${c}" ${c === current.category ? 'selected' : ''}>${c}</option>
              `).join('')}
            </select>
          </label>
        </div>
        <label class="form-field" style="display:grid; gap:4px; font-size:12px; font-weight:600;">
          Milestones <span style="font-weight:400; opacity:0.7;">(one per line)</span>
          <textarea name="milestones" id="goalInputMilestones" placeholder="Read Chapter 1&#10;Solve practice problems&#10;Past year questions" style="padding:10px; border-radius:10px; border:1px solid rgba(127,127,127,0.3); background:transparent; color:inherit; min-height:85px;">${esc((current.milestones || []).map(m => m.name).join('\n'))}</textarea>
        </label>
      </div>
    `;

    const actionsHTML = `
      ${isEdit ? `<button class="button danger" type="button" id="btnDeleteGoalFromModal">Delete</button>` : ''}
      <button class="button quiet" type="button" data-cancel>Cancel</button>
      <button class="button primary" type="submit">${isEdit ? 'Save Changes' : 'Create Goal'}</button>
    `;

    openModal(isEdit ? 'Edit Goal' : 'Create Goal', 'GOAL → PATH', bodyHTML, actionsHTML);

    if (isEdit) {
      $('#btnDeleteGoalFromModal')?.addEventListener('click', () => {
        closeModal();
        deleteGoal(goal);
      });
    }

    if (modalForm) {
      modalForm.onsubmit = (e) => {
        e.preventDefault();
        const nameVal = $('#goalInputName')?.value.trim();
        if (!nameVal) return showToast('Please enter a goal name.');

        const whyVal = $('#goalInputWhy')?.value.trim() || '';
        const dateVal = $('#goalInputDate')?.value || '';
        const catVal = $('#goalInputCategory')?.value || 'Learning';

        const lines = ($('#goalInputMilestones')?.value || '')
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean);

        const existingMap = new Map((current.milestones || []).map(m => [m.name, m]));
        const updatedMilestones = lines.map(line => {
          if (existingMap.has(line)) return existingMap.get(line);
          return { id: uid(), name: line, done: false, deadline: '', notes: '' };
        });

        const targetObj = {
          ...current,
          id: current.id || uid(),
          name: nameVal,
          why: whyVal,
          targetDate: dateVal,
          category: catVal,
          done: current.done || false,
          milestones: updatedMilestones,
          createdAt: current.createdAt || new Date().toISOString()
        };

        if (isEdit) {
          state.goals = state.goals.map(g => g.id === current.id ? targetObj : g);
        } else {
          state.goals.unshift(targetObj);
        }

        saveAppState();
        closeModal();
        renderAll();
        showToast(isEdit ? 'Goal updated.' : 'Goal created.');
      };
    }
  }

  function openMilestoneFormModal(goal, milestone = null) {
    const isEdit = Boolean(milestone);
    const current = milestone || { name: '', deadline: '', notes: '' };

    const bodyHTML = `
      <div style="display:grid; gap:12px;">
        <label class="form-field" style="display:grid; gap:4px; font-size:12px; font-weight:600;">
          Milestone Name
          <input id="msName" required maxlength="90" value="${esc(current.name)}" placeholder="e.g. Finish numerical exercises" style="padding:10px; border-radius:10px; border:1px solid rgba(127,127,127,0.3); background:transparent; color:inherit;">
        </label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <label class="form-field" style="display:grid; gap:4px; font-size:12px; font-weight:600;">
            Target Deadline
            <input id="msDeadline" type="date" value="${esc(current.deadline || '')}" style="padding:10px; border-radius:10px; border:1px solid rgba(127,127,127,0.3); background:transparent; color:inherit;">
          </label>
          <label class="form-field" style="display:grid; gap:4px; font-size:12px; font-weight:600;">
            Notes
            <input id="msNotes" maxlength="120" value="${esc(current.notes || '')}" placeholder="Optional details" style="padding:10px; border-radius:10px; border:1px solid rgba(127,127,127,0.3); background:transparent; color:inherit;">
          </label>
        </div>
      </div>
    `;

    const actionsHTML = `
      <button class="button quiet" type="button" data-cancel>Cancel</button>
      <button class="button primary" type="submit">${isEdit ? 'Save Step' : 'Add Step'}</button>
    `;

    openModal(isEdit ? 'Edit Milestone' : 'Add Milestone', goal.name.toUpperCase(), bodyHTML, actionsHTML);

    if (modalForm) {
      modalForm.onsubmit = (e) => {
        e.preventDefault();
        const name = $('#msName')?.value.trim();
        if (!name) return showToast('Please enter a milestone name.');

        const deadline = $('#msDeadline')?.value || '';
        const notes = $('#msNotes')?.value.trim() || '';

        if (isEdit) {
          Object.assign(milestone, { name, deadline, notes });
        } else {
          goal.milestones = goal.milestones || [];
          goal.milestones.push({ id: uid(), name, deadline, notes, done: false });
        }

        saveAppState();
        closeModal();
        renderAll();
        showToast(isEdit ? 'Milestone updated.' : 'Milestone added.');
      };
    }
  }

  function deleteGoal(goal) {
    if (confirm(`Delete "${goal.name}" and all its milestones? Your session records will remain intact.`)) {
      state.goals = state.goals.filter(g => g.id !== goal.id);
      saveAppState();
      renderAll();
      showToast('Goal deleted.');
    }
  }

  function renderGoalsPage() {
    const listEl = $('#goalsPageList');
    const emptyEl = $('#goalsEmpty');
    if (!listEl) return;

    renderGoalCards(listEl, state.goals);
    const hasGoals = state.goals.length > 0;
    if (emptyEl) emptyEl.classList.toggle('hidden', hasGoals);
    listEl.classList.toggle('hidden', !hasGoals);
  }

  /* ==========================================================================
     10. SCHEDULE & CALENDAR
     ========================================================================== */
  const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function getNextScheduledClassMarkup() {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.toTimeString().slice(0, 5);

    const candidates = state.events.map(ev => {
      const delta = (Number(ev.dayIndex) - currentDay + 7) % 7;
      return { event: ev, delta };
    }).filter(item => {
      return item.delta > 0 || (item.delta === 0 && item.event.time > currentTime);
    }).sort((a, b) => a.delta - b.delta || a.event.time.localeCompare(b.event.time));

    if (!candidates.length) {
      return `<span>No upcoming classes today.</span><br><button class="text-button" data-page="schedule" style="background:none; border:0; color:#22c55e; cursor:pointer; font-size:12px; margin-top:4px;">Add timetable →</button>`;
    }

    const { event, delta } = candidates[0];
    const dayLabel = delta === 0 ? 'Today' : DAYS_OF_WEEK[event.dayIndex];
    return `<strong>${esc(event.title)}</strong><small style="display:block; opacity:0.8;">${dayLabel} · ${esc(event.time)}${event.room ? ` · ${esc(event.room)}` : ''}</small>`;
  }

  function renderScheduleList() {
    const listEl = $('#scheduleList');
    const emptyEl = $('#scheduleEmpty');
    if (!listEl) return;

    const sortedEvents = [...state.events].sort((a, b) => {
      return Number(a.dayIndex) - Number(b.dayIndex) || a.time.localeCompare(b.time);
    });

    listEl.innerHTML = sortedEvents.map(ev => `
      <div class="schedule-item" data-event="${esc(ev.id)}" style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border:1px solid rgba(127,127,127,0.15); border-radius:12px; margin-bottom:8px;">
        <span class="schedule-time" style="font-size:12px; line-height:1.3; min-width:85px;">
          <strong>${DAYS_OF_WEEK[ev.dayIndex]}</strong><br>
          <small style="opacity:0.75;">${esc(ev.time)}</small>
        </span>
        <span style="flex:1; min-width:0; padding:0 10px;">
          <strong>${esc(ev.title)}</strong>
          <small style="display:block; opacity:0.75;">${esc(ev.kind || 'Study block')}${ev.room ? ` · ${esc(ev.room)}` : ''}</small>
        </span>
        <span class="schedule-actions" style="display:flex; gap:6px;">
          <button class="button quiet small edit-event">Edit</button>
          <button class="button quiet small delete-event" style="color:#ef4444;">Delete</button>
        </span>
      </div>
    `).join('');

    const hasEvents = sortedEvents.length > 0;
    if (emptyEl) emptyEl.classList.toggle('hidden', hasEvents);
    listEl.classList.toggle('hidden', !hasEvents);

    // Event wiring
    $$('.schedule-item', listEl).forEach(item => {
      const evId = item.dataset.event;
      const ev = state.events.find(e => e.id === evId);
      if (!ev) return;

      $('.edit-event', item)?.addEventListener('click', () => openEventFormModal(ev));
      $('.delete-event', item)?.addEventListener('click', () => {
        if (confirm(`Remove "${ev.title}" from your timetable?`)) {
          state.events = state.events.filter(e => e.id !== ev.id);
          saveAppState();
          renderAll();
          showToast('Timetable item removed.');
        }
      });
    });
  }

  function renderCalendar() {
    const monthEl = $('#calendarMonth');
    const gridEl = $('#calendarGrid');
    if (!gridEl) return;

    const y = calendarCursor.getFullYear();
    const m = calendarCursor.getMonth();

    if (monthEl) {
      monthEl.textContent = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(calendarCursor);
    }

    const firstDay = new Date(y, m, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysInPrevMonth = new Date(y, m, 0).getDate();

    const headers = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    let html = headers.map(h => `<div class="calendar-dayname" style="text-align:center; font-size:11px; font-weight:700; opacity:0.6; padding:6px 0;">${h}</div>`).join('');

    const milestoneDates = state.goals.flatMap(g => (g.milestones || []).filter(ms => ms.deadline).map(ms => ms.deadline))
      .concat(state.goals.filter(g => g.targetDate && !g.done).map(g => g.targetDate));

    for (let i = 0; i < 42; i++) {
      const dayNum = i - startOffset + 1;
      const isCurrentMonth = dayNum > 0 && dayNum <= daysInMonth;
      const displayedDay = isCurrentMonth ? dayNum : (dayNum <= 0 ? daysInPrevMonth + dayNum : dayNum - daysInMonth);

      const targetDate = new Date(y, m + (isCurrentMonth ? 0 : (dayNum <= 0 ? -1 : 1)), displayedDay);
      const dateKey = localDateStr(targetDate);

      const isToday = dateKey === isoToday();
      const hasStudied = state.sessions.some(s => s.date === dateKey);
      const hasDeadline = milestoneDates.includes(dateKey);
      const hasSchedule = state.events.some(e => Number(e.dayIndex) === targetDate.getDay());

      html += `
        <div class="calendar-date ${isCurrentMonth ? '' : 'dim'} ${isToday ? 'today' : ''}" style="padding:6px; min-height:42px; border-radius:10px; text-align:center; font-size:12px; position:relative; ${isCurrentMonth ? '' : 'opacity:0.35;'} ${isToday ? 'border:1px solid #22c55e;' : ''}">
          <span>${displayedDay}</span>
          <div class="calendar-indicators" style="display:flex; justify-content:center; gap:3px; margin-top:4px;">
            ${hasStudied ? '<i class="dot study" style="width:4px; height:4px; border-radius:50%; background:#22c55e;"></i>' : ''}
            ${hasDeadline ? '<i class="dot deadline" style="width:4px; height:4px; border-radius:50%; background:#eab308;"></i>' : ''}
            ${hasSchedule ? '<i class="dot schedule" style="width:4px; height:4px; border-radius:50%; background:#3b82f6;"></i>' : ''}
          </div>
        </div>
      `;
    }

    gridEl.innerHTML = html;
  }

  function openEventFormModal(eventItem = null) {
    const isEdit = Boolean(eventItem);
    const current = eventItem || { title: '', dayIndex: new Date().getDay(), time: '16:00', room: '', kind: 'Study block' };

    const bodyHTML = `
      <div style="display:grid; gap:12px;">
        <label class="form-field" style="display:grid; gap:4px; font-size:12px; font-weight:600;">
          Subject or Activity
          <input id="evTitle" required maxlength="80" value="${esc(current.title)}" placeholder="e.g. Physics Revision" style="padding:10px; border-radius:10px; border:1px solid rgba(127,127,127,0.3); background:transparent; color:inherit;">
        </label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <label class="form-field" style="display:grid; gap:4px; font-size:12px; font-weight:600;">
            Day of Week
            <select id="evDay" style="padding:10px; border-radius:10px; border:1px solid rgba(127,127,127,0.3); background:transparent; color:inherit;">
              ${DAYS_OF_WEEK.map((d, i) => `<option value="${i}" ${i === Number(current.dayIndex) ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </label>
          <label class="form-field" style="display:grid; gap:4px; font-size:12px; font-weight:600;">
            Time
            <input id="evTime" type="time" required value="${esc(current.time || '16:00')}" style="padding:10px; border-radius:10px; border:1px solid rgba(127,127,127,0.3); background:transparent; color:inherit;">
          </label>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <label class="form-field" style="display:grid; gap:4px; font-size:12px; font-weight:600;">
            Category
            <select id="evKind" style="padding:10px; border-radius:10px; border:1px solid rgba(127,127,127,0.3); background:transparent; color:inherit;">
              ${['Study block', 'Class', 'Tuition', 'Revision', 'Exam', 'Other'].map(k => `<option value="${k}" ${k === current.kind ? 'selected' : ''}>${k}</option>`).join('')}
            </select>
          </label>
          <label class="form-field" style="display:grid; gap:4px; font-size:12px; font-weight:600;">
            Room / Location / Teacher (optional)
            <input id="evRoom" maxlength="60" value="${esc(current.room || '')}" placeholder="e.g. Room 204" style="padding:10px; border-radius:10px; border:1px solid rgba(127,127,127,0.3); background:transparent; color:inherit;">
          </label>
        </div>
      </div>
    `;

    const actionsHTML = `
      <button class="button quiet" type="button" data-cancel>Cancel</button>
      <button class="button primary" type="submit">${isEdit ? 'Save Changes' : 'Add to Timetable'}</button>
    `;

    openModal(isEdit ? 'Edit Timetable Entry' : 'Add to Timetable', 'MAKE TIME FOR IT', bodyHTML, actionsHTML);

    if (modalForm) {
      modalForm.onsubmit = (e) => {
        e.preventDefault();
        const title = $('#evTitle')?.value.trim();
        const time = $('#evTime')?.value;
        if (!title || !time) return showToast('Please enter title and time.');

        const item = {
          ...current,
          id: current.id || uid(),
          title,
          dayIndex: Number($('#evDay')?.value ?? 0),
          time,
          kind: $('#evKind')?.value || 'Study block',
          room: $('#evRoom')?.value.trim() || ''
        };

        if (isEdit) {
          state.events = state.events.map(ev => ev.id === current.id ? item : ev);
        } else {
          state.events.push(item);
        }

        saveAppState();
        closeModal();
        renderAll();
        showToast(isEdit ? 'Timetable updated.' : 'Added to timetable.');
      };
    }
  }

  /* ==========================================================================
     11. DAILY CHECK-IN
     ========================================================================== */
  function openCheckinModal() {
    const todayRecord = state.checkins.find(c => c.date === isoToday());

    const bodyHTML = `
      <div style="display:grid; gap:12px;">
        <p class="muted" style="margin:0; font-size:13px;">Did you work toward your goals today? Any focused effort matters.</p>
        <div class="checkin-options" style="display:flex; gap:12px; margin:6px 0;">
          ${['Yes', 'Partially', 'Not today'].map(status => `
            <label class="checkin-option" style="flex:1; border:1px solid rgba(127,127,127,0.25); border-radius:12px; padding:10px; text-align:center; cursor:pointer;">
              <input type="radio" name="checkinStatus" value="${status}" ${todayRecord?.status === status ? 'checked' : (status === 'Yes' && !todayRecord ? 'checked' : '')}>
              <span style="display:block; margin-top:4px; font-weight:600; font-size:12px;">${status}</span>
            </label>
          `).join('')}
        </div>
        <label class="form-field" style="display:grid; gap:4px; font-size:12px; font-weight:600;">
          A note to yourself <span style="font-weight:400; opacity:0.7;">(optional)</span>
          <textarea id="checkinNote" maxlength="180" placeholder="e.g. Completed organic mechanisms and 10 questions." style="padding:10px; border-radius:10px; border:1px solid rgba(127,127,127,0.3); background:transparent; color:inherit; min-height:65px;">${esc(todayRecord?.note || '')}</textarea>
        </label>
      </div>
    `;

    const actionsHTML = `
      <button class="button quiet" type="button" data-cancel>Cancel</button>
      <button class="button primary" type="submit">Save Check-in</button>
    `;

    openModal('How did today go?', 'DAILY CHECK-IN', bodyHTML, actionsHTML);

    if (modalForm) {
      modalForm.onsubmit = (e) => {
        e.preventDefault();
        const selectedRadio = $('input[name="checkinStatus"]:checked');
        const status = selectedRadio?.value || 'Yes';
        const note = $('#checkinNote')?.value.trim() || '';

        const record = { date: isoToday(), status, note };
        if (todayRecord) {
          state.checkins = state.checkins.map(c => c.date === isoToday() ? record : c);
        } else {
          state.checkins.push(record);
        }

        saveAppState();
        closeModal();
        renderAll();
        showToast('Daily check-in saved!');
      };
    }
  }

  /* ==========================================================================
     12. PROGRESS, STATS & ACHIEVEMENTS
     ========================================================================== */
  function calculateStreaks(activeDateSet) {
    let currentStreak = 0;
    let longestStreak = 0;
    let running = 0;

    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const todayKey = localDateStr(d);
    const y = new Date(d);
    y.setDate(y.getDate() - 1);
    const yesterdayKey = localDateStr(y);

    let cursor = new Date(d);
    if (!activeDateSet.has(todayKey)) {
      cursor.setDate(cursor.getDate() - 1);
    }

    const startCheck = localDateStr(cursor);
    if (startCheck === todayKey || startCheck === yesterdayKey) {
      while (activeDateSet.has(localDateStr(cursor))) {
        currentStreak++;
        cursor.setDate(cursor.getDate() - 1);
      }
    }

    const sortedDates = [...activeDateSet].sort();
    let prevDate = null;
    for (const key of sortedDates) {
      const thisDate = new Date(`${key}T00:00:00`);
      if (prevDate) {
        const diffDays = Math.round((thisDate - prevDate) / (1000 * 60 * 60 * 24));
        running = diffDays === 1 ? running + 1 : 1;
      } else {
        running = 1;
      }
      longestStreak = Math.max(longestStreak, running);
      prevDate = thisDate;
    }

    return { current: currentStreak, longest: longestStreak };
  }

  function renderProgress() {
    const totalMinutes = state.sessions.reduce((sum, s) => sum + s.minutes, 0);
    const completedGoals = state.goals.filter(g => g.done).length;
    const completedMilestones = state.goals.reduce((acc, g) => acc + (g.milestones || []).filter(m => m.done).length, 0);

    const totalStudyEl = $('#totalStudyMetric');
    const sessionMetricEl = $('#sessionMetric');
    const milestoneMetricEl = $('#milestoneMetric');
    const completedGoalEl = $('#completedGoalMetric');

    if (totalStudyEl) totalStudyEl.textContent = fmtMinutes(totalMinutes);
    if (sessionMetricEl) sessionMetricEl.textContent = state.sessions.length;
    if (milestoneMetricEl) milestoneMetricEl.textContent = completedMilestones;
    if (completedGoalEl) completedGoalEl.textContent = completedGoals;

    // Weekly Chart
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);

    const weekData = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const key = localDateStr(d);
      const minutes = state.sessions.filter(s => s.date === key).reduce((sum, s) => sum + s.minutes, 0);
      return {
        key,
        label: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d).slice(0, 2),
        minutes
      };
    });

    const maxWeekMin = Math.max(60, ...weekData.map(d => d.minutes));
    const totalWeekMin = weekData.reduce((sum, d) => sum + d.minutes, 0);

    const weekTotalEl = $('#weekTotal');
    const weekChartEl = $('#weekChart');

    if (weekTotalEl) weekTotalEl.textContent = `${fmtMinutes(totalWeekMin)} this week`;
    if (weekChartEl) {
      weekChartEl.innerHTML = weekData.map(d => `
        <div class="chart-day" style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1;">
          <span class="chart-bar-wrap" style="height:110px; width:100%; display:flex; align-items:flex-end; justify-content:center; background:rgba(127,127,127,0.08); border-radius:8px; overflow:hidden;">
            <span class="chart-bar" style="width:100%; height:${Math.max(4, Math.round((d.minutes / maxWeekMin) * 100))}%; background:#22c55e; border-radius:6px; transition:height 0.4s ease;"></span>
          </span>
          <small style="font-size:11px; opacity:0.8;">${d.label}</small>
          <em style="font-size:10px; font-style:normal; opacity:0.6;">${d.minutes ? fmtMinutes(d.minutes) : '—'}</em>
        </div>
      `).join('');
    }

    // Streaks
    const activeDates = new Set([
      ...state.sessions.map(s => s.date),
      ...state.checkins.map(c => c.date)
    ].filter(Boolean));

    const streaks = calculateStreaks(activeDates);
    const currentStreakEl = $('#currentStreak');
    const longestStreakEl = $('#longestStreak');
    const activeDaysEl = $('#activeDays');
    const totalCheckinsEl = $('#totalCheckins');

    if (currentStreakEl) currentStreakEl.textContent = streaks.current;
    if (longestStreakEl) longestStreakEl.textContent = `${streaks.longest} ${streaks.longest === 1 ? 'day' : 'days'}`;
    if (activeDaysEl) activeDaysEl.textContent = activeDates.size;
    if (totalCheckinsEl) totalCheckinsEl.textContent = state.checkins.length;

    // Recent Activity Feed
    const activities = [
      ...state.sessions.map(s => ({
        date: s.date,
        icon: '◷',
        title: s.subject || 'Study session',
        detail: `${fmtMinutes(s.minutes)} focused`
      })),
      ...state.checkins.map(c => ({
        date: c.date,
        icon: '✓',
        title: `Daily check-in · ${c.status}`,
        detail: c.note || 'Focused toward goals'
      })),
      ...state.goals.flatMap(g => (g.milestones || []).filter(m => m.done && m.completedAt).map(m => ({
        date: m.completedAt,
        icon: '✦',
        title: m.name,
        detail: `Milestone completed · ${g.name}`
      })))
    ].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);

    const activityListEl = $('#activityList');
    const activityEmptyEl = $('#activityEmpty');

    if (activityListEl) {
      activityListEl.innerHTML = activities.map(act => `
        <div class="activity-item" style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid rgba(127,127,127,0.12);">
          <span class="activity-symbol" style="width:32px; height:32px; border-radius:10px; background:rgba(34,197,94,0.12); color:#22c55e; display:grid; place-items:center; font-weight:800;">${act.icon}</span>
          <span style="flex:1; min-width:0;">
            <strong style="display:block; font-size:13px;">${esc(act.title)}</strong>
            <small style="opacity:0.75; font-size:11px;">${esc(act.detail)} · ${esc(formatDisplayDate(act.date))}</small>
          </span>
        </div>
      `).join('');
    }

    if (activityEmptyEl) {
      activityEmptyEl.classList.toggle('hidden', activities.length > 0);
    }

    // Achievements
    const achieveListEl = $('#achievementList');
    if (achieveListEl) {
      const achievements = [
        ['🏁', 'First Step', 'Complete your first focused study session.', state.sessions.length >= 1],
        ['🔥', '7 Day Streak', 'Show up for your goals 7 days in a row.', streaks.longest >= 7],
        ['🎯', 'Goal Crusher', 'Complete your first goal.', completedGoals >= 1],
        ['📚', 'Dedicated Learner', 'Complete 10 focused study sessions.', state.sessions.length >= 10],
        ['⏱️', '10 Hours Club', 'Log 10 total hours of deep study.', totalMinutes >= 600],
        ['✦', 'Path Builder', 'Complete 5 goal milestones.', completedMilestones >= 5]
      ];

      achieveListEl.innerHTML = achievements.map(([icon, title, desc, unlocked]) => `
        <div class="achievement ${unlocked ? '' : 'locked'}" style="display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:12px; margin-bottom:8px; border:1px solid rgba(127,127,127,0.15); ${unlocked ? 'background:rgba(34,197,94,0.06); border-color:rgba(34,197,94,0.3);' : 'opacity:0.4;'}">
          <span class="achievement-icon" style="font-size:20px;">${icon}</span>
          <span style="flex:1; min-width:0;">
            <strong style="display:block; font-size:13px;">${title}</strong>
            <small style="display:block; opacity:0.8; font-size:11px;">${desc}</small>
          </span>
        </div>
      `).join('');
    }
  }

  /* ==========================================================================
     13. FILES & DOCUMENTS (INDEXEDDB INTEGRATION)
     ========================================================================== */
  async function handleFileUpload(file) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      showToast('File is larger than 100 MB. Please pick a smaller document.');
      return;
    }

    const categories = ['Notes', 'Question Papers', 'Books', 'Assignments', 'Other'];
    const bodyHTML = `
      <div style="display:grid; gap:12px;">
        <p style="margin:0; font-size:13px;">
          <strong>${esc(file.name)}</strong><br>
          <span class="muted" style="font-size:11px;">${formatFileSize(file.size)}</span>
        </p>
        <label class="form-field" style="display:grid; gap:4px; font-size:12px; font-weight:600;">
          Category
          <select id="docCategory" style="padding:10px; border-radius:10px; border:1px solid rgba(127,127,127,0.3); background:transparent; color:inherit;">
            ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </label>
        <p class="muted" style="margin:0; font-size:11px;">Documents are saved locally in this device's browser database.</p>
      </div>
    `;

    const actionsHTML = `
      <button class="button quiet" type="button" data-cancel>Cancel</button>
      <button class="button primary" id="btnSaveDocument" type="button">Save to Device</button>
    `;

    openModal('Save Document', 'YOUR STUDY DESK', bodyHTML, actionsHTML);

    $('#btnSaveDocument')?.addEventListener('click', async () => {
      const category = $('#docCategory')?.value || 'Notes';
      const saveBtn = $('#btnSaveDocument');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
      }

      try {
        await storeDocument({
          id: uid(),
          name: file.name,
          size: file.size,
          type: file.type,
          category,
          createdAt: new Date().toISOString(),
          blob: file
        });
        closeModal();
        renderFiles();
        showToast('Document saved successfully.');
      } catch (err) {
        console.error('File saving failed:', err);
        closeModal();
        showToast(err?.name === 'QuotaExceededError' ? 'Browser storage quota exceeded.' : 'Could not save file to device.');
      }
    });
  }

  async function renderFiles() {
    const listEl = $('#fileList');
    const emptyEl = $('#filesEmpty');
    const query = ($('#fileSearch')?.value || '').toLowerCase();
    const selectedCategory = $('#fileCategoryFilter')?.value || '';

    if (!listEl) return;

    const docs = await listDocuments();
    const filtered = docs.filter(d => {
      const matchesSearch = !query || d.name.toLowerCase().includes(query);
      const matchesCat = !selectedCategory || d.category === selectedCategory;
      return matchesSearch && matchesCat;
    });

    listEl.innerHTML = filtered.map(d => `
      <article class="card file-card" data-file="${esc(d.id)}" style="display:flex; align-items:center; gap:12px; padding:12px 14px; border:1px solid rgba(127,127,127,0.18); border-radius:14px; margin-bottom:8px;">
        <span class="file-icon" style="width:36px; height:36px; border-radius:10px; background:rgba(34,197,94,0.12); color:#22c55e; display:grid; place-items:center; font-size:16px;">${d.type === 'application/pdf' ? '▤' : '□'}</span>
        <span class="file-info" style="flex:1; min-width:0;">
          <strong style="display:block; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(d.name)}">${esc(d.name)}</strong>
          <small style="opacity:0.75; font-size:11px;">${esc(d.category)} · ${esc(formatFileSize(d.size))}</small>
        </span>
        <span class="file-actions" style="display:flex; gap:6px;">
          <button class="icon-button open-file" aria-label="Open document" style="min-width:36px; min-height:36px; border-radius:10px;">↗</button>
          <button class="icon-button delete-file" aria-label="Delete document" style="min-width:36px; min-height:36px; border-radius:10px; color:#ef4444;">×</button>
        </span>
      </article>
    `).join('');

    const hasFiles = filtered.length > 0;
    if (emptyEl) emptyEl.classList.toggle('hidden', hasFiles);

    // Wire actions
    $$('.file-card', listEl).forEach(card => {
      const fileId = card.dataset.file;
      const doc = docs.find(d => d.id === fileId);
      if (!doc) return;

      $('.open-file', card)?.addEventListener('click', () => {
        if (!doc.blob) return showToast('File content is unavailable.');
        const url = URL.createObjectURL(doc.blob);
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      });

      $('.delete-file', card)?.addEventListener('click', async () => {
        if (confirm(`Delete "${doc.name}" from this device?`)) {
          try {
            await removeDocument(doc.id);
            renderFiles();
            showToast('Document deleted.');
          } catch (e) {
            showToast('Could not delete document.');
          }
        }
      });
    });
  }

  /* ==========================================================================
     14. EXAM DESK MODULE
     ========================================================================== */
  function openExamDeskExamModal() {
    const bodyHTML = `
      <div class="examdesk-form">
        <label>Exam name
          <input id="edExamName" required placeholder="e.g. Physics Midterm">
        </label>
        <label>Subject
          <input id="edExamSubject" placeholder="e.g. Physics">
        </label>
        <label>Exam date
          <input id="edExamDate" type="date" required>
        </label>
        <label>Total marks
          <input id="edExamMarks" type="number" min="1" placeholder="Optional">
        </label>
      </div>
    `;

    const actionsHTML = `
      <button class="button quiet" type="button" data-cancel>Cancel</button>
      <button class="button primary" id="edSaveExamBtn" type="button">Save Exam</button>
    `;

    openModal('Add an exam', 'EXAM DESK', bodyHTML, actionsHTML);

    $('#edSaveExamBtn')?.addEventListener('click', () => {
      const name = $('#edExamName')?.value.trim();
      const subject = $('#edExamSubject')?.value.trim();
      const date = $('#edExamDate')?.value;
      const marks = $('#edExamMarks')?.value.trim();

      if (!name || !date) return showToast('Please enter the exam name and date.');

      examData.exams.push({
        id: uid(),
        name,
        subject,
        date,
        marks
      });

      saveExamData();
      closeModal();
      renderExamDesk();
      showToast('Exam added.');
    });
  }

  function openExamDeskSubjectModal() {
    const bodyHTML = `
      <div class="examdesk-form">
        <label>Subject name
          <input id="edSubjectName" required placeholder="e.g. Chemistry">
        </label>
        <label>First Chapter
          <input id="edChapterFirst" placeholder="e.g. Solutions">
        </label>
        <label class="full">More chapters
          <textarea id="edChapterMore" placeholder="Write one chapter name per line"></textarea>
        </label>
      </div>
      <p class="muted" style="font-size:12px; margin-top:8px;">You can track each chapter separately across School, Tuition, and Personal study.</p>
    `;

    const actionsHTML = `
      <button class="button quiet" type="button" data-cancel>Cancel</button>
      <button class="button primary" id="edSaveSubjectBtn" type="button">Save Subject</button>
    `;

    openModal('Add a subject', 'SYLLABUS TRACKER', bodyHTML, actionsHTML);

    $('#edSaveSubjectBtn')?.addEventListener('click', () => {
      const name = $('#edSubjectName')?.value.trim();
      const first = $('#edChapterFirst')?.value.trim();
      const more = ($('#edChapterMore')?.value || '')
        .split('\n')
        .map(x => x.trim())
        .filter(Boolean);

      const allChapters = [...(first ? [first] : []), ...more];

      if (!name) return showToast('Please enter a subject name.');
      if (!allChapters.length) return showToast('Add at least one chapter.');

      examData.subjects.push({
        id: uid(),
        name,
        chapters: allChapters.map((ch, idx) => ({
          id: `${Date.now()}-${idx}`,
          name: ch,
          school: 'Not Started',
          tuition: 'Not Started',
          personal: 'Not Started'
        }))
      });

      saveExamData();
      closeModal();
      renderExamDesk();
      showToast('Subject and syllabus added.');
    });
  }

  function openExamDeskNoteModal() {
    const bodyHTML = `
      <div class="examdesk-form">
        <label>Title
          <input id="edNoteTitle" required placeholder="e.g. Ray Optics Formulas">
        </label>
        <label>Subject
          <input id="edNoteSubject" placeholder="e.g. Physics">
        </label>
        <label class="full">Note
          <textarea id="edNoteText" required placeholder="Write formulas, reminders, or quick notes..."></textarea>
        </label>
        <label>Sticky Color
          <select id="edNoteColor">
            <option value="green">Green</option>
            <option value="gold">Gold</option>
            <option value="blue">Blue</option>
            <option value="plain">Plain</option>
          </select>
        </label>
      </div>
    `;

    const actionsHTML = `
      <button class="button quiet" type="button" data-cancel>Cancel</button>
      <button class="button primary" id="edSaveNoteBtn" type="button">Save Note</button>
    `;

    openModal('New sticky note', 'QUICK NOTES', bodyHTML, actionsHTML);

    $('#edSaveNoteBtn')?.addEventListener('click', () => {
      const title = $('#edNoteTitle')?.value.trim();
      const subject = $('#edNoteSubject')?.value.trim();
      const text = $('#edNoteText')?.value.trim();
      const color = $('#edNoteColor')?.value || 'plain';

      if (!title || !text) return showToast('Please enter both title and note content.');

      examData.notes.unshift({
        id: uid(),
        title,
        subject,
        text,
        color
      });

      saveExamData();
      closeModal();
      renderExamDesk();
      showToast('Sticky note saved.');
    });
  }

  function renderExamDesk() {
    // 1. Next Exam & Countdown
    const listEl = $('#examdeskExamList');
    const nextTitleEl = $('#examdeskNextExamTitle');
    const nextMetaEl = $('#examdeskNextExamMeta');
    const nextDateEl = $('#examdeskNextExamDate');
    const daysEl = $('#examdeskDays');
    const suggestionEl = $('#examdeskSuggestion');

    const upcoming = [...examData.exams]
      .filter(e => daysUntil(e.date) >= 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    const nextExam = upcoming[0];

    if (!nextExam) {
      if (nextTitleEl) nextTitleEl.textContent = 'No exam added yet';
      if (nextMetaEl) nextMetaEl.textContent = 'Add your first exam to start the countdown.';
      if (nextDateEl) nextDateEl.textContent = '';
      if (daysEl) daysEl.textContent = '—';
      if (suggestionEl) suggestionEl.textContent = 'Add an exam and your syllabus to get a simple preparation suggestion.';
    } else {
      const daysLeft = daysUntil(nextExam.date);
      if (nextTitleEl) nextTitleEl.textContent = nextExam.name;
      if (nextMetaEl) nextMetaEl.textContent = [nextExam.subject, nextExam.marks ? `${nextExam.marks} marks` : ''].filter(Boolean).join(' · ') || 'Exam';
      if (nextDateEl) nextDateEl.textContent = formatDisplayDate(nextExam.date);
      if (daysEl) daysEl.textContent = daysLeft === 0 ? '0' : String(daysLeft);

      // Suggestions
      const matchedSubject = examData.subjects.find(s =>
        nextExam.subject && s.name.toLowerCase() === nextExam.subject.toLowerCase()
      );

      if (matchedSubject) {
        const incompleteChapters = matchedSubject.chapters.filter(ch =>
          [ch.school, ch.tuition, ch.personal].some(val => val !== 'Completed')
        ).length;
        const total = matchedSubject.chapters.length;

        if (incompleteChapters && daysLeft > 0) {
          const pace = Math.max(1, Math.ceil(incompleteChapters / daysLeft));
          if (suggestionEl) {
            suggestionEl.textContent = `${incompleteChapters} of ${total} chapter${total === 1 ? '' : 's'} still need work. A reasonable target is about ${pace} chapter${pace === 1 ? '' : 's'} per day.`;
          }
        } else if (!incompleteChapters) {
          if (suggestionEl) suggestionEl.textContent = 'All tracked chapters completed! Use remaining time for mock practice.';
        } else {
          if (suggestionEl) suggestionEl.textContent = 'Exam day is here! Focus on calm revision and high-weightage topics.';
        }
      } else if (daysLeft <= 3) {
        if (suggestionEl) suggestionEl.textContent = 'The exam is close. Prioritize revision, mock papers, and key formulas.';
      } else if (daysLeft <= 7) {
        if (suggestionEl) suggestionEl.textContent = 'One week left. Finish remaining doubts and lock in your revision blocks.';
      } else {
        if (suggestionEl) suggestionEl.textContent = 'You have time on your side. Spread your chapters evenly and stay consistent.';
      }
    }

    // 2. All Exams List
    if (listEl) {
      const allExams = [...examData.exams].sort((a, b) => a.date.localeCompare(b.date));
      listEl.innerHTML = allExams.length ? allExams.map(ex => {
        const isPast = daysUntil(ex.date) < 0;
        return `
          <div class="examdesk-item" ${isPast ? 'style="opacity:0.6;"' : ''}>
            <div class="examdesk-item-main">
              <strong>${esc(ex.name)}</strong>
              <small>${esc(ex.subject || 'General')} · ${esc(formatDisplayDate(ex.date))}${ex.marks ? ` · ${esc(ex.marks)} marks` : ''}${isPast ? ' · Completed' : ''}</small>
            </div>
            <button class="examdesk-delete" data-delete-exam="${esc(ex.id)}" aria-label="Delete exam ${esc(ex.name)}">×</button>
          </div>
        `;
      }).join('') : `<div class="examdesk-empty">No exams added yet.</div>`;
    }

    // 3. Syllabus Tracker
    const subjectListEl = $('#examdeskSubjectList');
    const prepSuggestionEl = $('#examdeskPrepSuggestion');

    if (subjectListEl) {
      if (!examData.subjects.length) {
        subjectListEl.innerHTML = `<div class="examdesk-empty">Add a subject and its chapter names.</div>`;
        if (prepSuggestionEl) prepSuggestionEl.textContent = 'Start by adding a subject and writing its chapters.';
      } else {
        let totalSlots = 0;
        let completedSlots = 0;

        subjectListEl.innerHTML = examData.subjects.map(sub => {
          const chapters = Array.isArray(sub.chapters) ? sub.chapters : [];
          const possible = chapters.length * 3;
          let subCompleted = 0;

          const chapterRows = chapters.map(ch => {
            totalSlots += 3;
            const completedCount = ['school', 'tuition', 'personal'].filter(k => ch[k] === 'Completed').length;
            completedSlots += completedCount;
            subCompleted += completedCount;

            return `
              <div class="examdesk-chapter">
                <div class="examdesk-chapter-name">${esc(ch.name)}</div>
                ${['school', 'tuition', 'personal'].map(source => `
                  <select class="examdesk-status"
                    data-subject-id="${esc(sub.id)}"
                    data-chapter-id="${esc(ch.id)}"
                    data-source="${source}"
                    aria-label="${esc(source)} status for ${esc(ch.name)}">
                    ${['Not Started', 'In Progress', 'Completed'].map(opt => `
                      <option value="${opt}" ${ch[source] === opt ? 'selected' : ''}>${opt}</option>
                    `).join('')}
                  </select>
                `).join('')}
              </div>
            `;
          }).join('');

          const pct = possible ? Math.round((subCompleted / possible) * 100) : 0;

          return `
            <div class="examdesk-item" style="display:block; margin-bottom:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div class="examdesk-item-main">
                  <strong>${esc(sub.name)}</strong>
                  <small>${chapters.length} chapter${chapters.length === 1 ? '' : 's'}</small>
                </div>
                <button class="examdesk-delete" data-delete-subject="${esc(sub.id)}" aria-label="Delete subject ${esc(sub.name)}">×</button>
              </div>
              <div class="examdesk-progress">
                <div class="examdesk-progress-row"><span>Overall completion</span><strong>${pct}%</strong></div>
                <div class="examdesk-progress-track"><span style="width:${pct}%"></span></div>
              </div>
              <div class="examdesk-chapters">
                <div class="examdesk-chapter-head" aria-hidden="true">
                  <span>CHAPTER</span><span>SCHOOL</span><span>TUITION</span><span>PERSONAL</span>
                </div>
                ${chapterRows}
              </div>
            </div>
          `;
        }).join('');

        const overallPct = totalSlots ? Math.round((completedSlots / totalSlots) * 100) : 0;
        if (prepSuggestionEl) {
          prepSuggestionEl.textContent = overallPct === 100
            ? 'All tracked school, tuition, and personal syllabus items are marked complete. Keep practicing!'
            : `${overallPct}% of total syllabus tracks completed. Continue clearing unfinished topics.`;
        }
      }
    }

    // 4. Quick Sticky Notes
    const notesBox = $('#examdeskNotes');
    if (notesBox) {
      notesBox.innerHTML = examData.notes.length ? examData.notes.map(n => `
        <article class="examdesk-note" data-color="${esc(n.color || 'plain')}">
          <button class="examdesk-note-delete" data-delete-note="${esc(n.id)}" aria-label="Delete note ${esc(n.title)}">×</button>
          <strong>${esc(n.title)}</strong>
          ${n.subject ? `<small>${esc(n.subject)}</small>` : ''}
          <p>${esc(n.text)}</p>
        </article>
      `).join('') : `<div class="examdesk-empty">No quick notes yet. Add one for formulas, reminders, or chapter notes.</div>`;
    }
  }

  /* ==========================================================================
     15. BACKUP, RESTORE & DATA MANAGEMENT
     ========================================================================== */
  async function exportAllData() {
    const docs = await listDocuments();
    const backup = {
      ...state,
      examDesk: examData,
      exportedAt: new Date().toISOString(),
      documents: docs.map(d => ({
        id: d.id,
        name: d.name,
        size: d.size,
        type: d.type,
        category: d.category,
        createdAt: d.createdAt
      }))
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sankalp-backup-${isoToday()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup exported. (Note: large document binaries are kept on device).');
  }

  async function importBackupFile(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.goals) || !Array.isArray(parsed.sessions)) {
        showToast('Invalid Sankalp backup file.');
        return;
      }

      if (!confirm('Import this backup? This will replace your current local goals, sessions, timetable, and exam desk data.')) {
        return;
      }

      state = {
        version: 1,
        settings: { ...defaultState().settings, ...(parsed.settings || {}) },
        goals: parsed.goals,
        sessions: parsed.sessions,
        events: Array.isArray(parsed.events) ? parsed.events : [],
        checkins: Array.isArray(parsed.checkins) ? parsed.checkins : []
      };

      if (parsed.examDesk && typeof parsed.examDesk === 'object') {
        examData = {
          exams: Array.isArray(parsed.examDesk.exams) ? parsed.examDesk.exams : [],
          subjects: Array.isArray(parsed.examDesk.subjects) ? parsed.examDesk.subjects : [],
          notes: Array.isArray(parsed.examDesk.notes) ? parsed.examDesk.notes : []
        };
        saveExamData();
      }

      saveAppState();
      renderAll();
      showToast('Backup restored successfully.');
    } catch (e) {
      console.error('Import error:', e);
      showToast('Failed to parse the backup file.');
    }
  }

  async function clearAllLocalData() {
    if (!confirm('Are you sure you want to delete ALL Sankalp data from this device? This will erase all goals, focus history, timetable, exams, and stored documents.')) {
      return;
    }

    try {
      const db = await dbPromise;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });

      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(EXAM_KEY);

      state = defaultState();
      examData = defaultExamData();

      saveAppState();
      saveExamData();

      renderAll();
      navigate('home');
      showToast('All local Sankalp data has been cleared.');
    } catch (e) {
      console.error('Data clear error:', e);
      showToast('Could not clear all data. Please try again.');
    }
  }

  /* ==========================================================================
     16. NOTIFICATIONS & REMINDERS
     ========================================================================== */
  async function toggleBrowserReminders() {
    if (state.settings.reminders) {
      state.settings.reminders = false;
      saveAppState();
      const btn = $('#notificationBtn');
      if (btn) btn.textContent = 'Enable reminders';
      showToast('Study reminders turned off.');
      return;
    }

    if (!('Notification' in window)) {
      showToast('Browser notifications are not supported here.');
      const help = $('#notificationHelp');
      if (help) help.textContent = 'Notifications are not supported in this browser.';
      return;
    }

    if (Notification.permission === 'denied') {
      showToast('Notifications are blocked in your browser settings.');
      return;
    }

    if (Notification.permission === 'default') {
      const res = await Notification.requestPermission();
      if (res !== 'granted') {
        showToast('Notification permission not granted.');
        return;
      }
    }

    state.settings.reminders = true;
    state.settings.reminderTime = $('#reminderTime')?.value || '18:00';
    saveAppState();

    const btn = $('#notificationBtn');
    if (btn) btn.textContent = 'Disable reminders';
    showToast('Reminders enabled for this browser.');
  }

  function checkTimetableAndGoalReminders() {
    if (!state.settings.reminders || !('Notification' in window) || Notification.permission !== 'granted') return;

    const now = new Date();
    const timeNow = now.toTimeString().slice(0, 5);
    const dayIndex = now.getDay();

    // Check for timetable match
    const matchingEvent = state.events.find(e => Number(e.dayIndex) === dayIndex && e.time === timeNow);
    if (matchingEvent) {
      const key = `sankalp-event-notif-${isoToday()}-${matchingEvent.id}`;
      if (sessionStorage.getItem(key) !== '1') {
        new Notification('Sankalp · Timetable Reminder', {
          body: `${matchingEvent.title}${matchingEvent.room ? ` (${matchingEvent.room})` : ''} starts now!`
        });
        sessionStorage.setItem(key, '1');
      }
    }

    // Daily study check-in reminder
    if (timeNow === (state.settings.reminderTime || '18:00')) {
      const dailyKey = `sankalp-daily-notif-${isoToday()}`;
      if (sessionStorage.getItem(dailyKey) !== '1') {
        new Notification('Sankalp · Daily Focus', {
          body: 'Take a small step for your goals today.'
        });
        sessionStorage.setItem(dailyKey, '1');
      }
    }
  }

  /* ==========================================================================
     17. MASTER RENDER PIPELINE
     ========================================================================== */
  function renderHome() {
    const studiedMin = getTodayStudiedMinutes();
    const dailyTarget = state.settings.dailyGoal || 120;
    const pct = Math.min(100, Math.round((studiedMin / dailyTarget) * 100));

    const todayGoalText = $('#todayGoalText');
    const todayStudied = $('#todayStudied');
    const todayRemaining = $('#todayRemaining');
    const todayPercent = $('#todayPercent');
    const dailyBar = $('#dailyBar');
    const nextClass = $('#nextClass');

    if (todayGoalText) todayGoalText.textContent = fmtMinutes(dailyTarget);
    if (todayStudied) todayStudied.textContent = fmtMinutes(studiedMin);
    if (todayRemaining) todayRemaining.textContent = fmtMinutes(Math.max(0, dailyTarget - studiedMin));
    if (todayPercent) todayPercent.textContent = `${pct}%`;
    if (dailyBar) dailyBar.style.width = `${pct}%`;
    if (nextClass) nextClass.innerHTML = getNextScheduledClassMarkup();

    renderGoalCards($('#homeGoals'), state.goals.slice(0, 3));

    // Next Action Card (Today's Sankalp)
    const activeGoal = state.goals.find(g => !g.done);
    const activeMilestone = activeGoal?.milestones?.find(m => !m.done);

    const actionTitle = $('#todayActionTitle');
    const actionDetail = $('#todayActionDetail');
    const actionProgress = $('#todayActionProgress');
    const startActionBtn = $('#startTodayAction');

    if (actionTitle) {
      actionTitle.textContent = activeMilestone?.name || (!activeGoal ? 'Choose one small step' : 'Your next small step');
    }
    if (actionDetail) {
      actionDetail.textContent = activeMilestone
        ? `${activeGoal.name}${activeMilestone.deadline ? ` · due ${formatDisplayDate(activeMilestone.deadline)}` : ''}`
        : (!activeGoal ? 'Your next milestone can turn a big goal into today’s clear action.' : 'Add a milestone to map out your path.');
    }
    if (actionProgress) {
      actionProgress.textContent = activeMilestone
        ? `${activeGoal.milestones.filter(m => m.done).length} / ${activeGoal.milestones.length} steps · ${activeGoal.name}`
        : (activeGoal ? activeGoal.name : 'No active goal yet');
    }
    if (startActionBtn) {
      startActionBtn.disabled = !activeGoal;
      startActionBtn.onclick = () => {
        if (activeGoal) {
          const subjectField = $('#sessionSubject');
          const goalField = $('#sessionGoal');
          if (subjectField) subjectField.value = activeMilestone ? activeMilestone.name : activeGoal.name;
          if (goalField) goalField.value = activeGoal.id;
          navigate('focus');
        }
      };
    }
  }

  function renderFocusPage() {
    const studiedMin = getTodayStudiedMinutes();
    const dailyTarget = state.settings.dailyGoal || 120;

    const focusTimeEl = $('#focusTodayTime');
    const focusTargetEl = $('#focusDailyTarget');
    const focusBarEl = $('#focusDailyBar');
    const sessionGoalSelect = $('#sessionGoal');
    const recentSessionsEl = $('#recentSessions');

    if (focusTimeEl) focusTimeEl.textContent = fmtMinutes(studiedMin);
    if (focusTargetEl) focusTargetEl.textContent = fmtMinutes(dailyTarget);
    if (focusBarEl) focusBarEl.style.width = `${Math.min(100, Math.round((studiedMin / dailyTarget) * 100))}%`;

    if (sessionGoalSelect) {
      const currentSelected = sessionGoalSelect.value;
      sessionGoalSelect.innerHTML = '<option value="">No goal selected</option>' +
        state.goals.filter(g => !g.done).map(g => `
          <option value="${esc(g.id)}" ${g.id === currentSelected ? 'selected' : ''}>${esc(g.name)}</option>
        `).join('');
    }

    if (recentSessionsEl) {
      const recents = state.sessions.slice(-4).reverse();
      recentSessionsEl.innerHTML = recents.length ? recents.map(s => `
        <div class="mini-item" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(127,127,127,0.1); font-size:12px;">
          <span>${esc(s.subject || 'Study session')}</span>
          <strong style="color:#22c55e;">${fmtMinutes(s.minutes)}</strong>
        </div>
      `).join('') : '<span class="muted" style="font-size:11px;">Your first session is waiting.</span>';
    }
  }

  function renderAll() {
    applyTheme();

    const dateLabelEl = $('#dateLabel');
    if (dateLabelEl) {
      dateLabelEl.textContent = new Intl.DateTimeFormat(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      }).format(new Date()).toUpperCase();
    }

    renderHome();
    renderGoalsPage();
    renderScheduleList();
    renderCalendar();
    renderFocusPage();
    renderProgress();
    renderExamDesk();

    // Sync settings form controls
    const dailyGoalInput = $('#dailyGoalInput');
    const reminderTimeInput = $('#reminderTime');
    const notifBtn = $('#notificationBtn');

    if (dailyGoalInput) dailyGoalInput.value = state.settings.dailyGoal || 120;
    if (reminderTimeInput) reminderTimeInput.value = state.settings.reminderTime || '18:00';
    if (notifBtn) notifBtn.textContent = state.settings.reminders ? 'Disable reminders' : 'Enable reminders';
  }

  /* ==========================================================================
     18. GLOBAL EVENT LISTENERS & DELEGATION
     ========================================================================== */
  function bindGlobalEvents() {
    // Navigation via [data-page] clicks (Desktop & Mobile)
    document.addEventListener('click', (e) => {
      const pageTrigger = e.target.closest('[data-page]');
      if (pageTrigger) {
        e.preventDefault();
        navigate(pageTrigger.dataset.page);
        return;
      }

      // Exam Desk deletes via event delegation
      const examDel = e.target.closest('[data-delete-exam]');
      if (examDel) {
        const id = examDel.dataset.deleteExam;
        examData.exams = examData.exams.filter(ex => ex.id !== id);
        saveExamData();
        renderExamDesk();
        showToast('Exam removed.');
        return;
      }

      const subDel = e.target.closest('[data-delete-subject]');
      if (subDel) {
        const id = subDel.dataset.deleteSubject;
        if (confirm('Delete this subject and all its chapters?')) {
          examData.subjects = examData.subjects.filter(s => s.id !== id);
          saveExamData();
          renderExamDesk();
          showToast('Subject removed.');
        }
        return;
      }

      const noteDel = e.target.closest('[data-delete-note]');
      if (noteDel) {
        const id = noteDel.dataset.deleteNote;
        examData.notes = examData.notes.filter(n => n.id !== id);
        saveExamData();
        renderExamDesk();
        showToast('Sticky note removed.');
        return;
      }
    });

    // Exam Desk chapter syllabus status changes
    document.addEventListener('change', (e) => {
      const statusSelect = e.target.closest('.examdesk-status');
      if (statusSelect) {
        const { subjectId, chapterId, source } = statusSelect.dataset;
        const sub = examData.subjects.find(s => s.id === subjectId);
        const chapter = sub?.chapters.find(c => c.id === chapterId);
        if (chapter && source) {
          chapter[source] = statusSelect.value;
          saveExamData();
          renderExamDesk();
        }
      }
    });

    // Topbar Profile / Settings
    $('#profileBtn')?.addEventListener('click', () => navigate('settings'));

    // Theme toggle button
    $('#themeToggle')?.addEventListener('click', () => {
      state.settings.theme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
      saveAppState();
      applyTheme();
    });

    // Quote refresh
    $('#newQuote')?.addEventListener('click', () => {
      const quoteEl = $('#quote');
      if (quoteEl) {
        const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
        quoteEl.textContent = `“${q}”`;
      }
    });

    // Goal creation buttons
    $('#addGoalHome')?.addEventListener('click', () => openGoalFormModal());
    $('#addGoalBtn')?.addEventListener('click', () => openGoalFormModal());
    $('#firstGoalBtn')?.addEventListener('click', () => openGoalFormModal());

    // Schedule buttons
    $('#addEventBtn')?.addEventListener('click', () => openEventFormModal());
    $('#prevMonth')?.addEventListener('click', () => {
      calendarCursor.setMonth(calendarCursor.getMonth() - 1);
      renderCalendar();
    });
    $('#nextMonth')?.addEventListener('click', () => {
      calendarCursor.setMonth(calendarCursor.getMonth() + 1);
      renderCalendar();
    });

    // Quick Home Actions
    $('#editDailyGoal')?.addEventListener('click', () => {
      navigate('settings');
      $('#dailyGoalInput')?.focus();
    });

    // Focus controls
    $('#timerStart')?.addEventListener('click', startTimer);
    $('#timerResume')?.addEventListener('click', startTimer);
    $('#timerPause')?.addEventListener('click', pauseTimer);
    $('#timerReset')?.addEventListener('click', resetTimer);
    $('#timerFinish')?.addEventListener('click', finishTimer);

    // Progress actions
    $('#checkinBtn')?.addEventListener('click', openCheckinModal);

    // File inputs & filters
    $('#fileInput')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleFileUpload(file);
      e.target.value = '';
    });
    $('#fileSearch')?.addEventListener('input', renderFiles);
    $('#fileCategoryFilter')?.addEventListener('change', renderFiles);

    // Exam Desk main buttons
    $('#examdeskAddExam')?.addEventListener('click', openExamDeskExamModal);
    $('#examdeskAddSubject')?.addEventListener('click', openExamDeskSubjectModal);
    $('#examdeskAddNote')?.addEventListener('click', openExamDeskNoteModal);

    // Settings actions
    $('#appearance')?.addEventListener('change', (e) => {
      state.settings.theme = e.target.value;
      saveAppState();
      applyTheme();
    });

    $('#dailyGoalInput')?.addEventListener('change', (e) => {
      const val = Math.max(15, Math.min(1440, Number(e.target.value) || 120));
      state.settings.dailyGoal = val;
      saveAppState();
      renderAll();
      showToast('Daily study goal updated.');
    });

    $('#reminderTime')?.addEventListener('change', (e) => {
      state.settings.reminderTime = e.target.value;
      saveAppState();
    });

    $('#notificationBtn')?.addEventListener('click', toggleBrowserReminders);
    $('#exportBtn')?.addEventListener('click', exportAllData);
    $('#clearDataBtn')?.addEventListener('click', clearAllLocalData);

    $('#importInput')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) importBackupFile(file);
      e.target.value = '';
    });

    // Modal backdrop click to close
    modalEl?.addEventListener('click', (e) => {
      if (e.target === modalEl) closeModal();
    });

    // Keyboard ESC to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalEl?.open) {
        closeModal();
      }
    });

    // System theme change listener
    window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => {
      if (state.settings.theme === 'system') applyTheme();
    });
  }

  /* ==========================================================================
     19. INITIALIZATION
     ========================================================================== */
  function init() {
    bindGlobalEvents();
    renderAll();
    renderFiles();

    // Check reminders every 30 seconds
    setInterval(checkTimetableAndGoalReminders, 30000);

    // Keep Exam countdown fresh every minute
    setInterval(() => {
      if (activePage === 'examdesk') renderExamDesk();
    }, 60000);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
