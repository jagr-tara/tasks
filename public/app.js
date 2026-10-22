// Single-Page Task, Performance & Settings Manager
// Interacts with Cloudflare Pages Function at /api/todos with X-App-Password authentication
// Matches exact UI and architecture requirements from AGENTS.md

(function () {
  'use strict';

  const API_ENDPOINT = '/api/todos';
  const AUTH_STORAGE_KEY = 'app_password';
  const LOCAL_CACHE_KEY = 'offline_todos_cache';
  const PROJECTS_STORAGE_KEY = 'app_custom_projects';

  // Default Projects Preset (Text only)
  const DEFAULT_PROJECTS = [
    { id: 'proj-1', name: 'Decision making', baseMinutes: 860, basePct: 62 },
    { id: 'proj-2', name: 'Design system', baseMinutes: 665, basePct: 48 },
    { id: 'proj-3', name: 'Exploration phase', baseMinutes: 435, basePct: 31 },
  ];

  // Performance Period Data Presets
  const PERIOD_DATA = {
    week: {
      time: '32h 40m',
      comparison: 'vs. 31h 34m last week',
      trend: '+3.45%',
      isPositive: true,
      avgFocus: '4h 40m',
    },
    month: {
      time: '142h 10m',
      comparison: 'vs. 138h 20m last month',
      trend: '+2.82%',
      isPositive: true,
      avgFocus: '4h 45m',
    },
    year: {
      time: '1,620h 50m',
      comparison: 'vs. 1,510h last year',
      trend: '+7.31%',
      isPositive: true,
      avgFocus: '4h 50m',
    },
  };

  // Application State
  const state = {
    todos: [],
    projects: loadStoredProjects(),
    filter: 'all', // 'all' | 'active' | 'completed'
    isLoading: true,
    isSubmitting: false,
    editingId: null,
    activeSlide: 0, // 0 = Performance, 1 = Tasks, 2 = Settings
    selectedCategory: '',
    activePeriod: 'week', // 'week' | 'month' | 'year'
    bannerTimeout: null,
  };

  // DOM Elements
  const elements = {
    // Auth Elements
    authOverlay: document.getElementById('authOverlay'),
    authForm: document.getElementById('authForm'),
    authPassword: document.getElementById('authPassword'),
    authAlert: document.getElementById('authAlert'),
    authSubmitBtn: document.getElementById('authSubmitBtn'),
    authBtnText: document.querySelector('.auth-btn-text'),
    authBtnSpinner: document.querySelector('#authSubmitBtn .btn-spinner'),
    lockBtn: document.getElementById('lockBtn'),
    settingsLockBtn: document.getElementById('settingsLockBtn'),

    // Viewport & Slider Elements
    appLayout: document.getElementById('appLayout'),
    pageViewport: document.getElementById('pageViewport'),
    pageSlider: document.getElementById('pageSlider'),

    // Bottom Navigation Dock (Left: Performance, Center: Plus, Right: Settings)
    navPerformanceBtn: document.getElementById('navPerformanceBtn'),
    fabAddBtn: document.getElementById('fabAddBtn'),
    navSettingsBtn: document.getElementById('navSettingsBtn'),

    // Slide 0: Performance Elements
    periodTabs: document.querySelectorAll('.period-tab'),
    trendBadge: document.getElementById('trendBadge'),
    focusedTimeValue: document.getElementById('focusedTimeValue'),
    comparisonSubtext: document.getElementById('comparisonSubtext'),
    heatmapGrid: document.getElementById('heatmapGrid'),
    tasksDoneCount: document.getElementById('tasksDoneCount'),
    avgDailyFocusValue: document.getElementById('avgDailyFocusValue'),
    seeAllProjectsBtn: document.getElementById('seeAllProjectsBtn'),
    cardTasksDone: document.getElementById('cardTasksDone'),
    projectItemsList: document.getElementById('projectItemsList'),

    // Slide 1: Tasks Elements
    form: document.getElementById('todoForm'),
    taskInput: document.getElementById('taskInput'),
    submitBtn: document.getElementById('submitBtn'),
    btnText: document.querySelector('#submitBtn .btn-text'),
    btnSpinner: document.querySelector('#submitBtn .btn-spinner'),
    taskCategoryChipsRow: document.getElementById('taskCategoryChipsRow'),
    filterTabs: document.querySelectorAll('.filter-tab'),
    todoList: document.getElementById('todoList'),
    loadingSkeleton: document.getElementById('loadingSkeleton'),
    emptyState: document.getElementById('emptyState'),
    emptyMessage: document.getElementById('emptyMessage'),
    countAll: document.getElementById('countAll'),
    countActive: document.getElementById('countActive'),
    countCompleted: document.getElementById('countCompleted'),
    itemsLeft: document.getElementById('itemsLeft'),
    clearCompletedBtn: document.getElementById('clearCompletedBtn'),

    // Slide 2: Settings Elements
    openAddProjectBtn: document.getElementById('openAddProjectBtn'),
    projectFormCard: document.getElementById('projectFormCard'),
    projectFormTitle: document.getElementById('projectFormTitle'),
    projectForm: document.getElementById('projectForm'),
    editProjectId: document.getElementById('editProjectId'),
    projectNameInput: document.getElementById('projectNameInput'),
    cancelProjectBtn: document.getElementById('cancelProjectBtn'),
    settingsProjectsList: document.getElementById('settingsProjectsList'),
    resetProjectsBtn: document.getElementById('resetProjectsBtn'),

    // Feedback Elements
    banner: document.getElementById('banner'),
    bannerMessage: document.getElementById('bannerMessage'),
    bannerClose: document.getElementById('bannerClose'),
    connectionStatus: document.getElementById('connectionStatus'),
    syncStatus: document.getElementById('syncStatus'),
  };

  // ================= PROJECT STORAGE & HELPERS =================
  function loadStoredProjects() {
    try {
      const saved = localStorage.getItem(PROJECTS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((p) => {
            const { icon, ...rest } = p;
            return rest;
          });
        }
      }
    } catch {
      // fallback
    }
    return JSON.parse(JSON.stringify(DEFAULT_PROJECTS));
  }

  function saveStoredProjects() {
    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(state.projects));
    } catch {
      // ignore
    }
  }

  function getProjectByName(name) {
    return state.projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
  }

  // ================= LOCAL FALLBACK STORAGE FOR TODOS =================
  function getCachedTodos() {
    try {
      const saved = localStorage.getItem(LOCAL_CACHE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [
      { id: 1, title: '[Decision making] Review product roadmap', completed: 1, created_at: new Date().toISOString() },
      { id: 2, title: '[Design system] Update pill and button components', completed: 0, created_at: new Date().toISOString() },
      { id: 3, title: '[Exploration phase] Benchmark analytics widgets', completed: 0, created_at: new Date().toISOString() },
    ];
  }

  function setCachedTodos(todos) {
    try {
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(todos));
    } catch {
      // ignore
    }
  }

  // ================= AUTHENTICATION =================
  function getStoredPassword() {
    try {
      return localStorage.getItem(AUTH_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function setStoredPassword(password) {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, password);
    } catch {
      // ignore
    }
  }

  function clearStoredPassword() {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  function showAuthPrompt(errorMessage = '') {
    document.documentElement.classList.remove('is-authenticated');
    elements.appLayout.classList.add('hidden');
    elements.authOverlay.classList.remove('hidden');

    if (errorMessage) {
      elements.authAlert.textContent = errorMessage;
      elements.authAlert.classList.remove('hidden');
    } else {
      elements.authAlert.classList.add('hidden');
      elements.authAlert.textContent = '';
    }

    elements.authPassword.value = '';
    setTimeout(() => elements.authPassword.focus(), 60);
  }

  function hideAuthPrompt() {
    document.documentElement.classList.add('is-authenticated');
    elements.authAlert.classList.add('hidden');
    elements.authAlert.textContent = '';
    elements.authOverlay.classList.add('hidden');
    elements.appLayout.classList.remove('hidden');
  }

  function setAuthLoading(isLoading) {
    elements.authSubmitBtn.disabled = isLoading;
    if (isLoading) {
      elements.authBtnText.classList.add('hidden');
      elements.authBtnSpinner.classList.remove('hidden');
    } else {
      elements.authBtnText.classList.remove('hidden');
      elements.authBtnSpinner.classList.add('hidden');
    }
  }

  // ================= UTILITIES & PARSERS =================
  function parseTask(task) {
    const rawTitle = (task.title || '').trim();
    const match = rawTitle.match(/^\[(.*?)\]\s*(.*)$/);

    if (match) {
      const proj = getProjectByName(match[1]);
      return {
        category: proj ? proj.name : match[1],
        cleanTitle: match[2] || rawTitle,
      };
    }

    const defaultProj = state.projects[0] || { name: 'General' };
    return {
      category: defaultProj.name,
      cleanTitle: rawTitle,
    };
  }

  function formatDuration(minutes) {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hrs}h ${mins < 10 ? '0' : ''}${mins}m`;
  }

  function showBanner(message, type = 'error') {
    elements.bannerMessage.textContent = message;
    elements.banner.className = `banner ${type}`;
    elements.banner.classList.remove('hidden');

    if (type === 'error' && elements.connectionStatus) {
      elements.connectionStatus.className = 'status-indicator is-error';
      const label = elements.connectionStatus.querySelector('.status-label');
      if (label) label.textContent = 'Error';
    }

    clearTimeout(state.bannerTimeout);
    state.bannerTimeout = setTimeout(() => {
      hideBanner();
    }, 3500);
  }

  function hideBanner() {
    clearTimeout(state.bannerTimeout);
    elements.banner.classList.add('hidden');
    if (elements.connectionStatus) {
      elements.connectionStatus.className = 'status-indicator';
      const label = elements.connectionStatus.querySelector('.status-label');
      if (label) label.textContent = 'Ready';
    }
  }

  function setSyncing(isSyncing, label = 'Syncing...') {
    if (elements.connectionStatus) {
      if (isSyncing) {
        elements.connectionStatus.className = 'status-indicator is-syncing';
        const statusLabel = elements.connectionStatus.querySelector('.status-label');
        if (statusLabel) statusLabel.textContent = label;
      } else {
        elements.connectionStatus.className = 'status-indicator';
        const statusLabel = elements.connectionStatus.querySelector('.status-label');
        if (statusLabel) statusLabel.textContent = 'Ready';
      }
    }

    if (elements.syncStatus) {
      elements.syncStatus.textContent = isSyncing ? 'Saving changes...' : 'Up to date';
    }
  }

  // ================= API WRAPPER WITH OFFLINE FALLBACK =================
  async function apiRequest(url, options = {}) {
    const password = getStoredPassword();

    if (window.location.protocol === 'file:') {
      return simulateOfflineRequest(url, options);
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(password ? { 'X-App-Password': password } : {}),
      ...(options.headers || {}),
    };

    try {
      const res = await fetch(url, { ...options, headers });

      if (res.status === 401) {
        clearStoredPassword();
        showAuthPrompt('Invalid or expired password. Please enter the correct password.');
        throw new Error('Unauthorized');
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg = data.error || `Server responded with status ${res.status}`;
        throw new Error(errorMsg);
      }

      return data;
    } catch (err) {
      if (err.message === 'Unauthorized') throw err;
      return simulateOfflineRequest(url, options);
    }
  }

  function simulateOfflineRequest(url, options) {
    const method = (options.method || 'GET').toUpperCase();
    let cached = getCachedTodos();

    if (method === 'GET') {
      return { todos: cached };
    }

    if (method === 'POST') {
      const payload = JSON.parse(options.body || '{}');
      const newTodo = {
        id: Date.now(),
        title: payload.title || 'Untitled Task',
        completed: 0,
        created_at: new Date().toISOString(),
      };
      cached.unshift(newTodo);
      setCachedTodos(cached);
      return { todo: newTodo };
    }

    if (method === 'PUT') {
      const payload = JSON.parse(options.body || '{}');
      let updatedTodo = null;
      cached = cached.map((t) => {
        if (t.id === payload.id) {
          updatedTodo = {
            ...t,
            ...(payload.title !== undefined ? { title: payload.title } : {}),
            ...(payload.completed !== undefined ? { completed: payload.completed ? 1 : 0 } : {}),
          };
          return updatedTodo;
        }
        return t;
      });
      setCachedTodos(cached);
      return { todo: updatedTodo };
    }

    if (method === 'DELETE') {
      const urlObj = new URL(url, 'http://localhost');
      const id = Number(urlObj.searchParams.get('id'));
      cached = cached.filter((t) => t.id !== id);
      setCachedTodos(cached);
      return { success: true, id };
    }

    return {};
  }

  // ================= CRUD OPERATIONS =================
  async function fetchTodos() {
    state.isLoading = true;
    elements.loadingSkeleton.classList.remove('hidden');
    elements.todoList.classList.add('hidden');
    elements.emptyState.classList.add('hidden');

    try {
      const data = await apiRequest(API_ENDPOINT, { method: 'GET' });
      state.todos = Array.isArray(data.todos) ? data.todos : [];
      hideBanner();
    } catch (error) {
      if (error.message !== 'Unauthorized') {
        showBanner(`Failed to load tasks: ${error.message}`);
      }
    } finally {
      state.isLoading = false;
      elements.loadingSkeleton.classList.add('hidden');
      render();
    }
  }

  async function handleAddTodo(event) {
    if (event) event.preventDefault();
    const cleanTitle = elements.taskInput.value.trim();
    if (!cleanTitle || state.isSubmitting) return;

    state.isSubmitting = true;
    elements.submitBtn.disabled = true;
    elements.btnText.classList.add('hidden');
    elements.btnSpinner.classList.remove('hidden');
    setSyncing(true, 'Adding...');

    const category = state.selectedCategory || (state.projects[0] ? state.projects[0].name : 'General');
    const formattedTitle = `[${category}] ${cleanTitle}`;

    try {
      const data = await apiRequest(API_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ title: formattedTitle }),
      });

      if (data.todo) {
        state.todos.unshift(data.todo);
      }
      elements.taskInput.value = '';
      hideBanner();
      render();
    } catch (error) {
      if (error.message !== 'Unauthorized') {
        showBanner(`Could not add task: ${error.message}`);
      }
    } finally {
      state.isSubmitting = false;
      elements.submitBtn.disabled = false;
      elements.btnText.classList.remove('hidden');
      elements.btnSpinner.classList.add('hidden');
      setSyncing(false);
    }
  }

  async function handleToggleTodo(id, currentCompleted, itemEl) {
    itemEl.classList.add('is-busy');
    setSyncing(true, 'Updating...');

    const newCompleted = currentCompleted ? 0 : 1;

    try {
      const data = await apiRequest(API_ENDPOINT, {
        method: 'PUT',
        body: JSON.stringify({ id, completed: Boolean(newCompleted) }),
      });

      const updated = data.todo;
      state.todos = state.todos.map((t) => (t.id === id ? { ...t, ...updated } : t));
      render();
    } catch (error) {
      if (error.message !== 'Unauthorized') {
        showBanner(`Could not update task status: ${error.message}`);
        itemEl.classList.remove('is-busy');
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleSaveTitle(id, rawTitle, originalCategory) {
    const trimmed = rawTitle.trim();
    if (!trimmed) {
      render();
      return;
    }

    setSyncing(true, 'Saving...');

    let finalTitle = trimmed;
    if (!trimmed.startsWith('[')) {
      finalTitle = `[${originalCategory || state.selectedCategory}] ${trimmed}`;
    }

    try {
      const data = await apiRequest(API_ENDPOINT, {
        method: 'PUT',
        body: JSON.stringify({ id, title: finalTitle }),
      });

      const updated = data.todo;
      state.todos = state.todos.map((t) => (t.id === id ? { ...t, ...updated } : t));
    } catch (error) {
      if (error.message !== 'Unauthorized') {
        showBanner(`Could not rename task: ${error.message}`);
      }
    } finally {
      state.editingId = null;
      setSyncing(false);
      render();
    }
  }

  async function handleDeleteTodo(id, itemEl) {
    itemEl.classList.add('is-busy');
    setSyncing(true, 'Deleting...');

    try {
      await apiRequest(`${API_ENDPOINT}?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      state.todos = state.todos.filter((t) => t.id !== id);
      render();
    } catch (error) {
      if (error.message !== 'Unauthorized') {
        showBanner(`Could not delete task: ${error.message}`);
        itemEl.classList.remove('is-busy');
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleClearCompleted() {
    const completedTasks = state.todos.filter((t) => Boolean(t.completed));
    if (completedTasks.length === 0) return;

    elements.clearCompletedBtn.disabled = true;
    setSyncing(true, 'Clearing...');

    try {
      for (const task of completedTasks) {
        await apiRequest(`${API_ENDPOINT}?id=${encodeURIComponent(task.id)}`, {
          method: 'DELETE',
        });
      }
      state.todos = state.todos.filter((t) => !t.completed);
      render();
    } catch (error) {
      if (error.message !== 'Unauthorized') {
        showBanner(`Failed while clearing completed tasks: ${error.message}`);
      }
    } finally {
      setSyncing(false);
    }
  }

  // ================= 3-SLIDE DOCK NAVIGATION =================
  // Slide 0: Performance, Slide 1: Tasks (Center Plus), Slide 2: Settings
  function goToSlide(slideIndex) {
    if (slideIndex < 0 || slideIndex > 2) return;
    state.activeSlide = slideIndex;
    elements.pageSlider.style.transform = `translateX(-${slideIndex * (100 / 3)}%)`;

    // Update Dock Highlights
    elements.navPerformanceBtn.classList.toggle('active', slideIndex === 0);
    elements.navPerformanceBtn.setAttribute('aria-selected', slideIndex === 0 ? 'true' : 'false');

    elements.fabAddBtn.classList.toggle('active', slideIndex === 1);
    elements.fabAddBtn.setAttribute('aria-selected', slideIndex === 1 ? 'true' : 'false');

    elements.navSettingsBtn.classList.toggle('active', slideIndex === 2);
    elements.navSettingsBtn.setAttribute('aria-selected', slideIndex === 2 ? 'true' : 'false');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (slideIndex === 0) {
      renderPerformanceMetrics();
    } else if (slideIndex === 1) {
      setTimeout(() => elements.taskInput.focus(), 250);
    }
  }

  // Swipe Gesture Handling for 3 Slides
  let touchStartX = 0;
  let touchStartY = 0;

  function initSwipeGestures() {
    elements.pageViewport.addEventListener(
      'touchstart',
      (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );

    elements.pageViewport.addEventListener(
      'touchend',
      (e) => {
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;

        if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
          if (deltaX < 0 && state.activeSlide < 2) {
            goToSlide(state.activeSlide + 1); // Swipe left -> next slide
          } else if (deltaX > 0 && state.activeSlide > 0) {
            goToSlide(state.activeSlide - 1); // Swipe right -> prev slide
          }
        }
      },
      { passive: true }
    );
  }

  // ================= HEATMAP GENERATION =================
  function renderHeatmap() {
    elements.heatmapGrid.innerHTML = '';
    const totalColumns = 22;
    const rows = 7;

    for (let c = 0; c < totalColumns; c++) {
      for (let r = 0; r < rows; r++) {
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';

        let level = 0;
        const colRatio = c / totalColumns;

        if (colRatio > 0.85) {
          level = (c + r) % 5 === 0 ? 0 : (c + r) % 4 === 1 ? 2 : (c + r) % 2 === 0 ? 4 : 3;
        } else if (colRatio > 0.6) {
          level = (c * 3 + r * 7) % 7 > 4 ? 3 : (c + r) % 4 === 0 ? 4 : 0;
        } else if (colRatio > 0.3) {
          level = (c * 2 + r * 5) % 6 > 4 ? 4 : (c + r) % 8 === 0 ? 1 : 0;
        } else {
          level = (c + r) % 11 === 0 ? 4 : (c * r) % 13 === 0 ? 1 : 0;
        }

        cell.classList.add(`level-${level}`);
        elements.heatmapGrid.appendChild(cell);
      }
    }
  }

  // ================= PROJECT MANAGEMENT & UI BINDING =================
  function renderProjectsUI() {
    // Ensure selectedCategory is valid
    if (!state.projects.some((p) => p.name === state.selectedCategory)) {
      state.selectedCategory = state.projects[0] ? state.projects[0].name : '';
    }

    // 1. Render Category Chips on Tasks Page (Text only, wraps into new row)
    elements.taskCategoryChipsRow.innerHTML = '<span class="category-label">Project:</span>';
    state.projects.forEach((proj) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      const isSelected = proj.name === state.selectedCategory;
      chip.className = `category-chip ${isSelected ? 'active' : ''}`;
      chip.dataset.category = proj.name;
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      chip.textContent = proj.name;

      chip.addEventListener('click', () => {
        elements.taskCategoryChipsRow.querySelectorAll('.category-chip').forEach((c) => {
          c.classList.remove('active');
          c.setAttribute('aria-checked', 'false');
        });
        chip.classList.add('active');
        chip.setAttribute('aria-checked', 'true');
        state.selectedCategory = proj.name;
      });

      elements.taskCategoryChipsRow.appendChild(chip);
    });

    // 2. Render Projects List on Settings Page (Text only)
    elements.settingsProjectsList.innerHTML = '';
    state.projects.forEach((proj) => {
      const taskCount = state.todos.filter((t) => parseTask(t).category.toLowerCase() === proj.name.toLowerCase()).length;

      const item = document.createElement('div');
      item.className = 'project-manage-item';
      item.dataset.id = proj.id;
      item.innerHTML = `
        <div class="proj-manage-left">
          <div class="proj-manage-name">${proj.name}</div>
          <div class="project-pct">${taskCount} task${taskCount === 1 ? '' : 's'}</div>
        </div>
        <div class="proj-manage-actions">
          <button type="button" class="icon-btn edit-proj-btn" aria-label="Edit project ${proj.name}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button type="button" class="icon-btn icon-btn-delete delete-proj-btn" aria-label="Delete project ${proj.name}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      item.querySelector('.edit-proj-btn').addEventListener('click', () => {
        openEditProjectForm(proj);
      });

      item.querySelector('.delete-proj-btn').addEventListener('click', () => {
        handleDeleteProject(proj.id);
      });

      elements.settingsProjectsList.appendChild(item);
    });

    renderPerformanceMetrics();
  }

  function openEditProjectForm(proj = null) {
    elements.projectFormCard.classList.remove('hidden');

    if (proj) {
      elements.projectFormTitle.textContent = 'Edit Project';
      elements.editProjectId.value = proj.id;
      elements.projectNameInput.value = proj.name;
    } else {
      elements.projectFormTitle.textContent = 'New Project';
      elements.editProjectId.value = '';
      elements.projectNameInput.value = '';
    }

    elements.projectNameInput.focus();
    elements.projectFormCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function closeProjectForm() {
    elements.projectFormCard.classList.add('hidden');
    elements.editProjectId.value = '';
    elements.projectNameInput.value = '';
  }

  function handleSaveProject(event) {
    event.preventDefault();
    const name = elements.projectNameInput.value.trim();
    const editId = elements.editProjectId.value;

    if (!name) return;

    if (editId) {
      // Edit existing
      const existing = state.projects.find((p) => p.id === editId);
      if (existing) {
        const oldName = existing.name;
        existing.name = name;

        // Update existing task titles to match new project name
        state.todos = state.todos.map((t) => {
          const parsed = parseTask(t);
          if (parsed.category.toLowerCase() === oldName.toLowerCase()) {
            return { ...t, title: `[${name}] ${parsed.cleanTitle}` };
          }
          return t;
        });
      }
    } else {
      // Add new project
      if (getProjectByName(name)) {
        showBanner(`A project named "${name}" already exists.`);
        return;
      }

      state.projects.push({
        id: `proj-${Date.now()}`,
        name,
        baseMinutes: 300,
        basePct: 20,
      });
      state.selectedCategory = name;
    }

    saveStoredProjects();
    closeProjectForm();
    renderProjectsUI();
    render();
    showBanner(editId ? 'Project updated successfully.' : 'New project added.', 'info');
  }

  function handleDeleteProject(id) {
    if (state.projects.length <= 1) {
      showBanner('At least one project must be retained.');
      return;
    }

    const proj = state.projects.find((p) => p.id === id);
    if (!proj) return;

    state.projects = state.projects.filter((p) => p.id !== id);
    if (state.selectedCategory === proj.name) {
      state.selectedCategory = state.projects[0] ? state.projects[0].name : '';
    }

    saveStoredProjects();
    renderProjectsUI();
    render();
    showBanner(`Project "${proj.name}" removed.`, 'info');
  }

  function handleResetDefaultProjects() {
    state.projects = JSON.parse(JSON.stringify(DEFAULT_PROJECTS));
    state.selectedCategory = state.projects[0].name;
    saveStoredProjects();
    renderProjectsUI();
    render();
    showBanner('Projects reset to default.', 'info');
  }

  // ================= PERFORMANCE METRICS COMPUTATION =================
  function renderPerformanceMetrics() {
    const period = PERIOD_DATA[state.activePeriod] || PERIOD_DATA.week;

    elements.focusedTimeValue.textContent = period.time;
    elements.comparisonSubtext.textContent = period.comparison;
    elements.trendBadge.innerHTML = `<span class="badge-arrow">▲</span> ${period.trend}`;
    elements.avgDailyFocusValue.textContent = period.avgFocus;

    const totalCompleted = state.todos.filter((t) => Boolean(t.completed)).length;
    elements.tasksDoneCount.textContent = 18 + totalCompleted;

    // Project breakdown calculation based on all active projects (Text only)
    elements.projectItemsList.innerHTML = '';

    state.projects.forEach((proj) => {
      const projectTasks = state.todos.filter((t) => parseTask(t).category.toLowerCase() === proj.name.toLowerCase());
      const completedTasks = projectTasks.filter((t) => Boolean(t.completed)).length;

      const baseMins = proj.baseMinutes || 400;
      const basePct = proj.basePct || 30;

      const currentMins = baseMins + completedTasks * 45;
      const currentPct = Math.min(95, basePct + completedTasks * 3);

      const row = document.createElement('div');
      row.className = 'project-row-item';
      row.dataset.project = proj.name;
      row.innerHTML = `
        <div class="project-body-col">
          <span class="project-name">${proj.name}</span>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${currentPct}%;"></div>
          </div>
        </div>
        <div class="project-stats-col">
          <span class="project-hours">${formatDuration(currentMins)}</span>
          <span class="project-pct">${currentPct}%</span>
        </div>
      `;

      row.addEventListener('click', () => {
        state.selectedCategory = proj.name;
        goToSlide(1); // Jump to Tasks with this project selected
      });

      elements.projectItemsList.appendChild(row);
    });
  }

  // ================= TASK RENDERING =================
  function setFilter(filter) {
    state.filter = filter;
    elements.filterTabs.forEach((tab) => {
      const isSelected = tab.dataset.filter === filter;
      tab.classList.toggle('active', isSelected);
      tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });
    render();
  }

  function render() {
    if (state.isLoading) return;

    const totalCount = state.todos.length;
    const completedCount = state.todos.filter((t) => Boolean(t.completed)).length;
    const activeCount = totalCount - completedCount;

    elements.countAll.textContent = totalCount;
    elements.countActive.textContent = activeCount;
    elements.countCompleted.textContent = completedCount;
    elements.itemsLeft.textContent = `${activeCount} task${activeCount === 1 ? '' : 's'} remaining`;
    elements.clearCompletedBtn.disabled = completedCount === 0;

    let visibleTodos = state.todos;
    if (state.filter === 'active') {
      visibleTodos = state.todos.filter((t) => !t.completed);
    } else if (state.filter === 'completed') {
      visibleTodos = state.todos.filter((t) => Boolean(t.completed));
    }

    if (visibleTodos.length === 0) {
      elements.todoList.classList.add('hidden');
      elements.emptyState.classList.remove('hidden');

      if (totalCount === 0) {
        elements.emptyMessage.textContent = 'No tasks yet. Add your first task above.';
      } else if (state.filter === 'active') {
        elements.emptyMessage.textContent = 'All tasks are completed.';
      } else if (state.filter === 'completed') {
        elements.emptyMessage.textContent = 'No completed tasks yet.';
      }
    } else {
      elements.emptyState.classList.add('hidden');
      elements.todoList.classList.remove('hidden');
      elements.todoList.innerHTML = '';

      visibleTodos.forEach((todo) => {
        const isCompleted = Boolean(todo.completed);
        const isEditing = state.editingId === todo.id;
        const parsed = parseTask(todo);

        const li = document.createElement('li');
        li.className = `todo-item ${isCompleted ? 'is-completed' : ''}`;
        li.dataset.id = todo.id;

        const checkbox = document.createElement('button');
        checkbox.type = 'button';
        checkbox.className = 'custom-checkbox';
        checkbox.setAttribute(
          'aria-label',
          isCompleted ? 'Mark task as incomplete' : 'Mark task as complete'
        );
        checkbox.innerHTML = `
          <svg class="checkbox-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        checkbox.addEventListener('click', () => handleToggleTodo(todo.id, isCompleted, li));

        const content = document.createElement('div');
        content.className = 'todo-content';

        if (isEditing) {
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'edit-input';
          input.value = parsed.cleanTitle;
          input.maxLength = 255;

          const commitEdit = () => {
            handleSaveTitle(todo.id, input.value, parsed.category);
          };

          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              commitEdit();
            } else if (e.key === 'Escape') {
              state.editingId = null;
              render();
            }
          });
          input.addEventListener('blur', commitEdit);

          content.appendChild(input);
          setTimeout(() => input.focus(), 0);
        } else {
          const titleSpan = document.createElement('span');
          titleSpan.className = 'todo-title';
          titleSpan.textContent = parsed.cleanTitle;
          titleSpan.title = 'Double-click to edit';
          titleSpan.addEventListener('dblclick', () => {
            state.editingId = todo.id;
            render();
          });

          const tagSpan = document.createElement('span');
          tagSpan.className = 'todo-tag';
          tagSpan.textContent = parsed.category;

          content.appendChild(titleSpan);
          content.appendChild(tagSpan);
        }

        const actions = document.createElement('div');
        actions.className = 'item-actions';

        if (!isEditing) {
          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'icon-btn';
          editBtn.setAttribute('aria-label', `Edit "${parsed.cleanTitle}"`);
          editBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          `;
          editBtn.addEventListener('click', () => {
            state.editingId = todo.id;
            render();
          });
          actions.appendChild(editBtn);
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'icon-btn icon-btn-delete';
        deleteBtn.setAttribute('aria-label', `Delete "${parsed.cleanTitle}"`);
        deleteBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        `;
        deleteBtn.addEventListener('click', () => handleDeleteTodo(todo.id, li));
        actions.appendChild(deleteBtn);

        li.appendChild(checkbox);
        li.appendChild(content);
        li.appendChild(actions);
        elements.todoList.appendChild(li);
      });
    }

    renderPerformanceMetrics();
  }

  // ================= EVENT LISTENERS =================
  function setupEventListeners() {
    // Auth Form
    elements.authForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const enteredPassword = elements.authPassword.value.trim();
      if (!enteredPassword) return;

      setAuthLoading(true);
      setStoredPassword(enteredPassword);

      try {
        await fetchTodos();
        hideAuthPrompt();
      } catch {
        // 401 triggers clearStoredPassword & showAuthPrompt
      } finally {
        setAuthLoading(false);
      }
    });

    // Lock Session Buttons
    elements.lockBtn.addEventListener('click', () => {
      clearStoredPassword();
      state.todos = [];
      showAuthPrompt();
    });

    if (elements.settingsLockBtn) {
      elements.settingsLockBtn.addEventListener('click', () => {
        clearStoredPassword();
        state.todos = [];
        showAuthPrompt();
      });
    }

    // Add Todo Form
    elements.form.addEventListener('submit', handleAddTodo);

    // Task Filter Tabs
    elements.filterTabs.forEach((tab) => {
      tab.addEventListener('click', () => setFilter(tab.dataset.filter));
    });

    // Clear Completed Button
    elements.clearCompletedBtn.addEventListener('click', handleClearCompleted);

    // Banner Close
    elements.bannerClose.addEventListener('click', hideBanner);

    // Performance Period Segmented Control (Week / Month / Year)
    elements.periodTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        elements.periodTabs.forEach((t) => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        state.activePeriod = tab.dataset.period;
        renderPerformanceMetrics();
      });
    });

    // ================= BOTTOM DOCK ACTIONS =================
    // 1. Left Button: Performance Dashboard
    elements.navPerformanceBtn.addEventListener('click', () => goToSlide(0));

    // 2. Middle Plus Button: Tasks Management & Add Task
    elements.fabAddBtn.addEventListener('click', () => {
      goToSlide(1);
      setTimeout(() => {
        elements.taskInput.focus();
        elements.taskInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    });

    // 3. Right Button: Settings & Projects
    elements.navSettingsBtn.addEventListener('click', () => goToSlide(2));

    // Performance Page Shortcuts
    if (elements.cardTasksDone) {
      elements.cardTasksDone.addEventListener('click', () => goToSlide(1));
    }

    if (elements.seeAllProjectsBtn) {
      elements.seeAllProjectsBtn.addEventListener('click', () => goToSlide(2));
    }

    // ================= SETTINGS: PROJECT ACTIONS =================
    elements.openAddProjectBtn.addEventListener('click', () => {
      openEditProjectForm(null);
    });

    elements.cancelProjectBtn.addEventListener('click', closeProjectForm);
    elements.projectForm.addEventListener('submit', handleSaveProject);

    // Reset Projects Button
    elements.resetProjectsBtn.addEventListener('click', handleResetDefaultProjects);

    initSwipeGestures();
  }

  // ================= APP INITIALIZATION =================
  function initializeApp() {
    try {
      setupEventListeners();
      renderHeatmap();
      renderProjectsUI();
      goToSlide(0);

      const savedPassword = getStoredPassword();
      if (!savedPassword) {
        showAuthPrompt();
      } else {
        hideAuthPrompt();
        fetchTodos();
      }
    } catch (err) {
      console.error('Initialization error:', err);
      document.documentElement.classList.add('is-authenticated');
      if (elements.authOverlay) elements.authOverlay.classList.add('hidden');
      if (elements.appLayout) elements.appLayout.classList.remove('hidden');
      showBanner(`Initialization issue: ${err.message}`, 'error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }
})();
