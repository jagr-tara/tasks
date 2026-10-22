// Single-Page Task, Performance & Settings Manager
// Interacts with Cloudflare Pages Function at /api/todos with X-App-Password authentication
// Matches exact UI and architecture requirements from AGENTS.md

(function () {
  'use strict';

  const API_ENDPOINT = '/api/todos';
  const AUTH_STORAGE_KEY = 'app_password';
  const LOCAL_CACHE_KEY = 'offline_todos_cache';
  const PROJECTS_STORAGE_KEY = 'app_custom_projects';

  // Default Projects Preset (Text only with sub-projects and groups)
  const DEFAULT_PROJECTS = [
    {
      id: 'proj-1',
      name: 'Decision making',
      group: 'Management',
      subprojects: ['Roadmap', 'Strategy'],
    },
    {
      id: 'proj-2',
      name: 'Design system',
      group: 'Product',
      subprojects: ['Components', 'Typography'],
    },
    {
      id: 'proj-3',
      name: 'Exploration phase',
      group: 'Product',
      subprojects: ['Prototypes'],
    },
  ];

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
    selectedSubproject: null,
    expandedProjects: new Set(),
    activePeriod: 'week', // 'week' | 'month' | 'year'
    bannerTimeout: null,
    isReordering: false,
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
    taskSubprojectChipsRow: document.getElementById('taskSubprojectChipsRow'),
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
    toggleReorderBtn: document.getElementById('toggleReorderBtn'),
    projectFormCard: document.getElementById('projectFormCard'),
    projectFormTitle: document.getElementById('projectFormTitle'),
    projectForm: document.getElementById('projectForm'),
    editProjectId: document.getElementById('editProjectId'),
    editParentProjectId: document.getElementById('editParentProjectId'),
    editSubprojectName: document.getElementById('editSubprojectName'),
    projectNameLabel: document.getElementById('projectNameLabel'),
    projectNameInput: document.getElementById('projectNameInput'),
    projectGroupFieldGroup: document.getElementById('projectGroupFieldGroup'),
    projectGroupInput: document.getElementById('projectGroupInput'),
    groupSuggestionsList: document.getElementById('groupSuggestionsList'),
    cancelProjectBtn: document.getElementById('cancelProjectBtn'),
    settingsProjectsList: document.getElementById('settingsProjectsList'),

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
          return parsed.map((p, idx) => ({
            id: p.id || `proj-${idx + 1}`,
            name: p.name,
            group: (p.group || 'General').trim(),
            subprojects: Array.isArray(p.subprojects) ? p.subprojects : [],
          }));
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

  function getUniqueGroups() {
    const groups = [];
    state.projects.forEach((p) => {
      const g = (p.group || 'General').trim();
      if (!groups.includes(g)) groups.push(g);
    });
    return groups.length > 0 ? groups : ['General'];
  }

  function getGroupedProjects() {
    const groups = getUniqueGroups();
    return groups.map((group) => ({
      group,
      projects: state.projects.filter((p) => (p.group || 'General').trim().toLowerCase() === group.toLowerCase()),
    })).filter((g) => g.projects.length > 0);
  }

  function moveGroup(groupName, delta) {
    const groups = getUniqueGroups();
    const currIdx = groups.indexOf(groupName);
    const targetIdx = currIdx + delta;
    if (targetIdx < 0 || targetIdx >= groups.length) return;
    const targetGroup = groups[targetIdx];

    const newGroups = [...groups];
    newGroups[currIdx] = targetGroup;
    newGroups[targetIdx] = groupName;

    const reordered = [];
    newGroups.forEach((g) => {
      state.projects.filter((p) => (p.group || 'General').trim().toLowerCase() === g.toLowerCase()).forEach((p) => reordered.push(p));
    });
    state.projects.forEach((p) => {
      if (!reordered.includes(p)) reordered.push(p);
    });
    state.projects = reordered;
    saveStoredProjects();
    renderProjectsUI();
    render();
  }

  function moveProjectInGroup(projId, delta) {
    const proj = state.projects.find((p) => p.id === projId);
    if (!proj) return;
    const group = (proj.group || 'General').trim().toLowerCase();
    const groupProjects = state.projects.filter((p) => (p.group || 'General').trim().toLowerCase() === group);
    const currIdxInGroup = groupProjects.findIndex((p) => p.id === projId);
    const targetIdxInGroup = currIdxInGroup + delta;
    if (targetIdxInGroup < 0 || targetIdxInGroup >= groupProjects.length) return;

    const otherProj = groupProjects[targetIdxInGroup];
    const indexA = state.projects.findIndex((p) => p.id === projId);
    const indexB = state.projects.findIndex((p) => p.id === otherProj.id);
    if (indexA === -1 || indexB === -1) return;

    const temp = state.projects[indexA];
    state.projects[indexA] = state.projects[indexB];
    state.projects[indexB] = temp;

    saveStoredProjects();
    renderProjectsUI();
    render();
  }

  function moveSubproject(parentProjId, subIndex, delta) {
    const parent = state.projects.find((p) => p.id === parentProjId);
    if (!parent || !Array.isArray(parent.subprojects)) return;
    const target = subIndex + delta;
    if (target < 0 || target >= parent.subprojects.length) return;
    const temp = parent.subprojects[subIndex];
    parent.subprojects[subIndex] = parent.subprojects[target];
    parent.subprojects[target] = temp;
    saveStoredProjects();
    renderProjectsUI();
    render();
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
      const tagContent = match[1].trim();
      const cleanTitle = match[2] || rawTitle;

      if (tagContent.includes('/')) {
        const slashIndex = tagContent.indexOf('/');
        const parentName = tagContent.substring(0, slashIndex).trim();
        const subName = tagContent.substring(slashIndex + 1).trim();
        const proj = getProjectByName(parentName);
        return {
          category: proj ? proj.name : parentName,
          subproject: subName || null,
          cleanTitle,
        };
      }

      const proj = getProjectByName(tagContent);
      return {
        category: proj ? proj.name : tagContent,
        subproject: null,
        cleanTitle,
      };
    }

    const defaultProj = state.projects[0] || { name: 'General', subprojects: [] };
    return {
      category: defaultProj.name,
      subproject: null,
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
    const subproject = state.selectedSubproject;
    const tag = subproject ? `[${category} / ${subproject}]` : `[${category}]`;
    const formattedTitle = `${tag} ${cleanTitle}`;

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

  async function handleSaveTitle(id, rawTitle, originalCategory, originalSubproject = null) {
    const trimmed = rawTitle.trim();
    if (!trimmed) {
      render();
      return;
    }

    setSyncing(true, 'Saving...');

    let finalTitle = trimmed;
    if (!trimmed.startsWith('[')) {
      const tag = originalSubproject
        ? `[${originalCategory} / ${originalSubproject}]`
        : `[${originalCategory || state.selectedCategory}]`;
      finalTitle = `${tag} ${trimmed}`;
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

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ================= PROJECT MANAGEMENT & UI BINDING =================
  function renderProjectsUI() {
    // Ensure selectedCategory is valid
    if (!state.projects.some((p) => p.name === state.selectedCategory)) {
      state.selectedCategory = state.projects[0] ? state.projects[0].name : '';
    }

    const curProj = state.projects.find((p) => p.name === state.selectedCategory);
    if (!curProj || !Array.isArray(curProj.subprojects) || !curProj.subprojects.includes(state.selectedSubproject)) {
      state.selectedSubproject = null;
    }

    // Populate Group Suggestions Datalist in Settings Form
    if (elements.groupSuggestionsList) {
      const uniqueGroups = getUniqueGroups();
      elements.groupSuggestionsList.innerHTML = uniqueGroups
        .map((g) => `<option value="${escapeHtml(g)}">`)
        .join('');
    }

    // Update Reorder Toggle Button State
    if (elements.toggleReorderBtn) {
      elements.toggleReorderBtn.classList.toggle('is-active', state.isReordering);
      elements.toggleReorderBtn.textContent = state.isReordering ? '✓ Done' : '⇅ Reorder';
    }

    // 1. Render Category Chips on Tasks Page (Grouped cleanly into cluster rows)
    if (elements.taskCategoryChipsRow) {
      elements.taskCategoryChipsRow.innerHTML = '';
      const grouped = getGroupedProjects();

      grouped.forEach(({ group, projects }) => {
        const cluster = document.createElement('div');
        cluster.className = 'chips-group-cluster';

        const groupTag = document.createElement('span');
        groupTag.className = 'chips-group-tag';
        groupTag.textContent = group;
        cluster.appendChild(groupTag);

        const chipsSet = document.createElement('div');
        chipsSet.className = 'group-chips-set';

        projects.forEach((proj) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          const isSelected = proj.name === state.selectedCategory;
          chip.className = `category-chip ${isSelected ? 'active' : ''}`;
          chip.dataset.category = proj.name;
          chip.setAttribute('role', 'radio');
          chip.setAttribute('aria-checked', isSelected ? 'true' : 'false');
          chip.textContent = proj.name;

          chip.addEventListener('click', () => {
            state.selectedCategory = proj.name;
            state.selectedSubproject = null;
            renderProjectsUI();
          });

          chipsSet.appendChild(chip);
        });

        cluster.appendChild(chipsSet);
        elements.taskCategoryChipsRow.appendChild(cluster);
      });
    }

    // 1b. Render Sub-project Chips on Tasks Page (if current project has subprojects)
    if (elements.taskSubprojectChipsRow) {
      if (curProj && Array.isArray(curProj.subprojects) && curProj.subprojects.length > 0) {
        elements.taskSubprojectChipsRow.classList.remove('hidden');
        elements.taskSubprojectChipsRow.innerHTML = '';

        const subTag = document.createElement('span');
        subTag.className = 'chips-group-tag';
        subTag.textContent = 'Sub-project';
        elements.taskSubprojectChipsRow.appendChild(subTag);

        const chipsSet = document.createElement('div');
        chipsSet.className = 'group-chips-set';

        // "General" chip
        const allChip = document.createElement('button');
        allChip.type = 'button';
        const isAllActive = !state.selectedSubproject;
        allChip.className = `subproject-chip ${isAllActive ? 'active' : ''}`;
        allChip.textContent = 'General';
        allChip.addEventListener('click', () => {
          state.selectedSubproject = null;
          renderProjectsUI();
        });
        chipsSet.appendChild(allChip);

        // Specific subproject chips
        curProj.subprojects.forEach((subName) => {
          const subChip = document.createElement('button');
          subChip.type = 'button';
          const isSubActive = state.selectedSubproject === subName;
          subChip.className = `subproject-chip ${isSubActive ? 'active' : ''}`;
          subChip.textContent = subName;
          subChip.addEventListener('click', () => {
            state.selectedSubproject = subName;
            renderProjectsUI();
          });
          chipsSet.appendChild(subChip);
        });

        elements.taskSubprojectChipsRow.appendChild(chipsSet);
      } else {
        elements.taskSubprojectChipsRow.classList.add('hidden');
        elements.taskSubprojectChipsRow.innerHTML = '';
      }
    }

    // 2. Render Projects & Sub-projects List on Settings Page (Sorted by Group with custom Reorder controls)
    if (elements.settingsProjectsList) {
      elements.settingsProjectsList.innerHTML = '';
      const grouped = getGroupedProjects();
      const allGroups = getUniqueGroups();

      grouped.forEach(({ group, projects }) => {
        // Group Header
        const groupHeader = document.createElement('div');
        groupHeader.className = 'settings-group-header';

        const groupIdx = allGroups.indexOf(group);
        const canMoveGroupUp = groupIdx > 0;
        const canMoveGroupDown = groupIdx < allGroups.length - 1;

        groupHeader.innerHTML = `
          <div class="settings-group-title">
            <span>${escapeHtml(group)}</span>
            <span class="project-group-count">(${projects.length})</span>
          </div>
          ${
            state.isReordering && allGroups.length > 1
              ? `
              <div class="reorder-btn-group">
                <button type="button" class="btn-reorder move-group-up" title="Move group above" ${canMoveGroupUp ? '' : 'disabled'}>▲</button>
                <button type="button" class="btn-reorder move-group-down" title="Move group below" ${canMoveGroupDown ? '' : 'disabled'}>▼</button>
              </div>
              `
              : ''
          }
        `;

        if (state.isReordering && allGroups.length > 1) {
          const upBtn = groupHeader.querySelector('.move-group-up');
          const downBtn = groupHeader.querySelector('.move-group-down');
          if (upBtn) upBtn.addEventListener('click', () => moveGroup(group, -1));
          if (downBtn) downBtn.addEventListener('click', () => moveGroup(group, 1));
        }

        elements.settingsProjectsList.appendChild(groupHeader);

        // Projects under this group
        projects.forEach((proj, pIdx) => {
          const projTasks = state.todos.filter((t) => parseTask(t).category.toLowerCase() === proj.name.toLowerCase());
          const projCompleted = projTasks.filter((t) => Boolean(t.completed)).length;
          const subprojects = Array.isArray(proj.subprojects) ? proj.subprojects : [];

          const item = document.createElement('div');
          item.className = 'project-manage-item';
          item.dataset.id = proj.id;

          const canMoveProjUp = pIdx > 0;
          const canMoveProjDown = pIdx < projects.length - 1;

          // Parent project header
          const headerEl = document.createElement('div');
          headerEl.className = 'proj-manage-header';
          headerEl.innerHTML = `
            <div class="proj-manage-left">
              <div class="proj-manage-name">${escapeHtml(proj.name)}</div>
              <div class="project-pct">${projTasks.length} task${projTasks.length === 1 ? '' : 's'} (${projCompleted} done)</div>
            </div>
            <div class="proj-manage-actions">
              ${
                state.isReordering
                  ? `
                  <div class="reorder-btn-group">
                    <button type="button" class="btn-reorder move-proj-up" title="Move project above" ${canMoveProjUp ? '' : 'disabled'}>▲</button>
                    <button type="button" class="btn-reorder move-proj-down" title="Move project below" ${canMoveProjDown ? '' : 'disabled'}>▼</button>
                  </div>
                  `
                  : ''
              }
              <button type="button" class="btn-xs-action add-subproj-btn" title="Add sub-project to ${escapeHtml(proj.name)}">+ Sub</button>
              <button type="button" class="icon-btn edit-proj-btn" aria-label="Edit project ${escapeHtml(proj.name)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button type="button" class="icon-btn icon-btn-delete delete-proj-btn" aria-label="Delete project ${escapeHtml(proj.name)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          `;

          if (state.isReordering) {
            const upBtn = headerEl.querySelector('.move-proj-up');
            const downBtn = headerEl.querySelector('.move-proj-down');
            if (upBtn) upBtn.addEventListener('click', () => moveProjectInGroup(proj.id, -1));
            if (downBtn) downBtn.addEventListener('click', () => moveProjectInGroup(proj.id, 1));
          }

          headerEl.querySelector('.add-subproj-btn').addEventListener('click', () => {
            openEditProjectForm(null, proj, null);
          });

          headerEl.querySelector('.edit-proj-btn').addEventListener('click', () => {
            openEditProjectForm(proj, null, null);
          });

          headerEl.querySelector('.delete-proj-btn').addEventListener('click', () => {
            handleDeleteProject(proj.id);
          });

          item.appendChild(headerEl);

          // Sub-projects list under parent project
          if (subprojects.length > 0) {
            const subListEl = document.createElement('div');
            subListEl.className = 'subprojects-manage-list';

            subprojects.forEach((subName, sIdx) => {
              const subTasks = projTasks.filter((t) => (parseTask(t).subproject || '').toLowerCase() === subName.toLowerCase());
              const subDone = subTasks.filter((t) => Boolean(t.completed)).length;
              const canMoveSubUp = sIdx > 0;
              const canMoveSubDown = sIdx < subprojects.length - 1;

              const subItem = document.createElement('div');
              subItem.className = 'subproject-manage-item';
              subItem.innerHTML = `
                <div class="subproj-manage-left">
                  <span class="subproj-branch-symbol">↳</span>
                  <span class="subproj-manage-name">${escapeHtml(subName)}</span>
                  <span class="subproj-count-badge">(${subDone}/${subTasks.length})</span>
                </div>
                <div class="proj-manage-actions">
                  ${
                    state.isReordering && subprojects.length > 1
                      ? `
                      <div class="reorder-btn-group">
                        <button type="button" class="btn-reorder move-sub-up" title="Move sub-project above" ${canMoveSubUp ? '' : 'disabled'}>▲</button>
                        <button type="button" class="btn-reorder move-sub-down" title="Move sub-project below" ${canMoveSubDown ? '' : 'disabled'}>▼</button>
                      </div>
                      `
                      : ''
                  }
                  <button type="button" class="icon-btn-xs edit-subproj-btn" title="Edit sub-project ${escapeHtml(subName)}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                  <button type="button" class="icon-btn-xs delete-subproj-btn" title="Delete sub-project ${escapeHtml(subName)}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              `;

              if (state.isReordering && subprojects.length > 1) {
                const subUp = subItem.querySelector('.move-sub-up');
                const subDown = subItem.querySelector('.move-sub-down');
                if (subUp) subUp.addEventListener('click', () => moveSubproject(proj.id, sIdx, -1));
                if (subDown) subDown.addEventListener('click', () => moveSubproject(proj.id, sIdx, 1));
              }

              subItem.querySelector('.edit-subproj-btn').addEventListener('click', () => {
                openEditProjectForm(null, proj, subName);
              });

              subItem.querySelector('.delete-subproj-btn').addEventListener('click', () => {
                handleDeleteSubproject(proj.id, subName);
              });

              subListEl.appendChild(subItem);
            });

            item.appendChild(subListEl);
          }

          elements.settingsProjectsList.appendChild(item);
        });
      });
    }

    renderPerformanceMetrics();
  }

  function openEditProjectForm(proj = null, parentProj = null, subName = null) {
    if (!elements.projectFormCard) return;
    elements.projectFormCard.classList.remove('hidden');

    if (parentProj) {
      // Sub-project mode
      elements.editProjectId.value = '';
      elements.editParentProjectId.value = parentProj.id;
      elements.editSubprojectName.value = subName || '';
      if (elements.projectNameLabel) {
        elements.projectNameLabel.textContent = subName ? `Edit Sub-project in "${parentProj.name}"` : `Sub-project Name for "${parentProj.name}"`;
      }
      elements.projectFormTitle.textContent = subName ? 'Edit Sub-project' : `Add Sub-project to "${parentProj.name}"`;
      elements.projectNameInput.placeholder = 'e.g. Components';
      elements.projectNameInput.value = subName || '';
      if (elements.projectGroupFieldGroup) elements.projectGroupFieldGroup.classList.add('hidden');
    } else if (proj) {
      // Edit Parent Project
      elements.editProjectId.value = proj.id;
      elements.editParentProjectId.value = '';
      elements.editSubprojectName.value = '';
      if (elements.projectNameLabel) elements.projectNameLabel.textContent = 'Project Name';
      elements.projectFormTitle.textContent = 'Edit Project';
      elements.projectNameInput.placeholder = 'e.g. Mobile Architecture';
      elements.projectNameInput.value = proj.name;
      if (elements.projectGroupFieldGroup) elements.projectGroupFieldGroup.classList.remove('hidden');
      if (elements.projectGroupInput) elements.projectGroupInput.value = proj.group || 'General';
    } else {
      // New Parent Project
      elements.editProjectId.value = '';
      elements.editParentProjectId.value = '';
      elements.editSubprojectName.value = '';
      if (elements.projectNameLabel) elements.projectNameLabel.textContent = 'Project Name';
      elements.projectFormTitle.textContent = 'New Project';
      elements.projectNameInput.placeholder = 'e.g. Mobile Architecture';
      elements.projectNameInput.value = '';
      if (elements.projectGroupFieldGroup) elements.projectGroupFieldGroup.classList.remove('hidden');
      if (elements.projectGroupInput) elements.projectGroupInput.value = '';
    }

    elements.projectNameInput.focus();
    elements.projectFormCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function closeProjectForm() {
    if (!elements.projectFormCard) return;
    elements.projectFormCard.classList.add('hidden');
    elements.editProjectId.value = '';
    elements.editParentProjectId.value = '';
    elements.editSubprojectName.value = '';
    elements.projectNameInput.value = '';
    if (elements.projectGroupInput) elements.projectGroupInput.value = '';
  }

  function handleSaveProject(event) {
    event.preventDefault();
    const name = elements.projectNameInput.value.trim();
    const editId = elements.editProjectId.value;
    const parentProjId = elements.editParentProjectId.value;
    const editSubName = elements.editSubprojectName.value;
    const group = (elements.projectGroupInput ? elements.projectGroupInput.value.trim() : '') || 'General';

    if (!name) return;

    if (parentProjId) {
      // Sub-project addition / modification
      const parent = state.projects.find((p) => p.id === parentProjId);
      if (!parent) return;
      if (!Array.isArray(parent.subprojects)) parent.subprojects = [];

      if (editSubName) {
        // Edit existing subproject
        parent.subprojects = parent.subprojects.map((s) => (s.toLowerCase() === editSubName.toLowerCase() ? name : s));
        state.todos = state.todos.map((t) => {
          const parsed = parseTask(t);
          if (parsed.category.toLowerCase() === parent.name.toLowerCase() && (parsed.subproject || '').toLowerCase() === editSubName.toLowerCase()) {
            return { ...t, title: `[${parent.name} / ${name}] ${parsed.cleanTitle}` };
          }
          return t;
        });
        showBanner('Sub-project updated successfully.', 'info');
      } else {
        // Add new subproject
        if (parent.subprojects.some((s) => s.toLowerCase() === name.toLowerCase())) {
          showBanner(`Sub-project "${name}" already exists in ${parent.name}.`);
          return;
        }
        parent.subprojects.push(name);
        showBanner('Sub-project added successfully.', 'info');
      }
    } else if (editId) {
      // Edit existing main project
      const existing = state.projects.find((p) => p.id === editId);
      if (existing) {
        const oldName = existing.name;
        existing.name = name;
        existing.group = group;

        // Update existing task titles to match new project name
        state.todos = state.todos.map((t) => {
          const parsed = parseTask(t);
          if (parsed.category.toLowerCase() === oldName.toLowerCase()) {
            const subTag = parsed.subproject ? ` / ${parsed.subproject}` : '';
            return { ...t, title: `[${name}${subTag}] ${parsed.cleanTitle}` };
          }
          return t;
        });
        showBanner('Project updated successfully.', 'info');
      }
    } else {
      // Add new main project
      if (getProjectByName(name)) {
        showBanner(`A project named "${name}" already exists.`);
        return;
      }

      state.projects.push({
        id: `proj-${Date.now()}`,
        name,
        group,
        subprojects: [],
      });
      state.selectedCategory = name;
      showBanner('New project added.', 'info');
    }

    saveStoredProjects();
    closeProjectForm();
    renderProjectsUI();
    render();
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
      state.selectedSubproject = null;
    }

    saveStoredProjects();
    renderProjectsUI();
    render();
    showBanner(`Project "${proj.name}" removed.`, 'info');
  }

  function handleDeleteSubproject(parentProjId, subName) {
    const parent = state.projects.find((p) => p.id === parentProjId);
    if (!parent || !Array.isArray(parent.subprojects)) return;

    parent.subprojects = parent.subprojects.filter((s) => s.toLowerCase() !== subName.toLowerCase());

    // Update tasks under this subproject to just parent
    state.todos = state.todos.map((t) => {
      const parsed = parseTask(t);
      if (parsed.category.toLowerCase() === parent.name.toLowerCase() && (parsed.subproject || '').toLowerCase() === subName.toLowerCase()) {
        return { ...t, title: `[${parent.name}] ${parsed.cleanTitle}` };
      }
      return t;
    });

    if (state.selectedSubproject && state.selectedSubproject.toLowerCase() === subName.toLowerCase()) {
      state.selectedSubproject = null;
    }

    saveStoredProjects();
    renderProjectsUI();
    render();
    showBanner(`Sub-project "${subName}" removed.`, 'info');
  }

  // ================= PERFORMANCE METRICS COMPUTATION =================
  function renderPerformanceMetrics() {
    const totalCount = state.todos.length;
    const completedCount = state.todos.filter((t) => Boolean(t.completed)).length;
    const activeCount = totalCount - completedCount;
    const overallPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    if (elements.focusedTimeValue) {
      elements.focusedTimeValue.textContent = `${overallPct}%`;
    }
    if (elements.comparisonSubtext) {
      elements.comparisonSubtext.textContent = `${completedCount} of ${totalCount} tasks completed (${activeCount} active)`;
    }
    if (elements.trendBadge) {
      elements.trendBadge.innerHTML = `<span class="badge-arrow">▲</span> ${overallPct}%`;
    }
    if (elements.tasksDoneCount) {
      elements.tasksDoneCount.textContent = completedCount;
    }
    if (elements.avgDailyFocusValue) {
      elements.avgDailyFocusValue.textContent = `${overallPct}%`;
    }

    // Main parent projects list grouped by Group with expandable subproject progress
    if (!elements.projectItemsList) return;
    elements.projectItemsList.innerHTML = '';

    const grouped = getGroupedProjects();
    grouped.forEach(({ group, projects }) => {
      // Group Header
      if (grouped.length > 1) {
        const groupHeader = document.createElement('div');
        groupHeader.className = 'project-group-header';
        groupHeader.innerHTML = `
          <span class="project-group-title">${escapeHtml(group)}</span>
          <span class="project-group-count">${projects.length} project${projects.length === 1 ? '' : 's'}</span>
        `;
        elements.projectItemsList.appendChild(groupHeader);
      }

      projects.forEach((proj) => {
        const projectTasks = state.todos.filter((t) => parseTask(t).category.toLowerCase() === proj.name.toLowerCase());
        const projTotal = projectTasks.length;
        const projCompleted = projectTasks.filter((t) => Boolean(t.completed)).length;
        const projPct = projTotal > 0 ? Math.round((projCompleted / projTotal) * 100) : 0;

        const subprojects = Array.isArray(proj.subprojects) ? proj.subprojects : [];
        const hasSubprojects = subprojects.length > 0;
        const isExpanded = state.expandedProjects.has(proj.id);

        const wrapper = document.createElement('div');
        wrapper.className = 'project-row-item-wrapper';
        wrapper.dataset.projectId = proj.id;

        // Parent row
        const row = document.createElement('div');
        row.className = 'project-row-item';
        row.dataset.project = proj.name;
        row.innerHTML = `
          <div class="project-body-col">
            <div class="project-name-row">
              <span class="project-name">${escapeHtml(proj.name)}</span>
              ${hasSubprojects ? `<button type="button" class="subproject-toggle-btn ${isExpanded ? 'is-active' : ''}" aria-expanded="${isExpanded ? 'true' : 'false'}">Breakdown <span class="toggle-icon">${isExpanded ? '▲' : '▼'}</span></button>` : ''}
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${projPct}%;"></div>
            </div>
          </div>
          <div class="project-stats-col">
            <span class="project-count-stat">${projCompleted} of ${projTotal} done</span>
            <span class="project-pct">${projPct}%</span>
          </div>
        `;

        row.querySelector('.project-name').addEventListener('click', () => {
          state.selectedCategory = proj.name;
          state.selectedSubproject = null;
          goToSlide(1);
        });

        if (hasSubprojects) {
          const toggleBtn = row.querySelector('.subproject-toggle-btn');
          if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              if (state.expandedProjects.has(proj.id)) {
                state.expandedProjects.delete(proj.id);
              } else {
                state.expandedProjects.add(proj.id);
              }
              renderPerformanceMetrics();
            });
          }
        }

        wrapper.appendChild(row);

        // Expandable Sub-projects breakdown
        if (hasSubprojects && isExpanded) {
          const breakdownEl = document.createElement('div');
          breakdownEl.className = 'subproject-breakdown-container';

          subprojects.forEach((subName) => {
            const subTasks = projectTasks.filter((t) => (parseTask(t).subproject || '').toLowerCase() === subName.toLowerCase());
            const subTotal = subTasks.length;
            const subDone = subTasks.filter((t) => Boolean(t.completed)).length;
            const subPct = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : 0;

            const subItem = document.createElement('div');
            subItem.className = 'subproject-breakdown-item';
            subItem.innerHTML = `
              <div class="subproj-breakdown-body">
                <span class="subproj-breakdown-name">
                  <span class="subproj-branch-symbol">↳</span> ${escapeHtml(subName)}
                </span>
                <div class="progress-track-mini">
                  <div class="progress-fill-mini" style="width: ${subPct}%;"></div>
                </div>
              </div>
              <span class="subproj-breakdown-stats">${subDone}/${subTotal} (${subPct}%)</span>
            `;

            subItem.style.cursor = 'pointer';
            subItem.addEventListener('click', () => {
              state.selectedCategory = proj.name;
              state.selectedSubproject = subName;
              goToSlide(1);
            });

            breakdownEl.appendChild(subItem);
          });

          // Tasks under parent without subproject
          const directTasks = projectTasks.filter((t) => !parseTask(t).subproject);
          if (directTasks.length > 0) {
            const directTotal = directTasks.length;
            const directDone = directTasks.filter((t) => Boolean(t.completed)).length;
            const directPct = Math.round((directDone / directTotal) * 100);

            const directItem = document.createElement('div');
            directItem.className = 'subproject-breakdown-item';
            directItem.innerHTML = `
              <div class="subproj-breakdown-body">
                <span class="subproj-breakdown-name">
                  <span class="subproj-branch-symbol">↳</span> <em>General</em>
                </span>
                <div class="progress-track-mini">
                  <div class="progress-fill-mini" style="width: ${directPct}%;"></div>
                </div>
              </div>
              <span class="subproj-breakdown-stats">${directDone}/${directTotal} (${directPct}%)</span>
            `;
            breakdownEl.appendChild(directItem);
          }

          wrapper.appendChild(breakdownEl);
        }

        elements.projectItemsList.appendChild(wrapper);
      });
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
            handleSaveTitle(todo.id, input.value, parsed.category, parsed.subproject);
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
          if (parsed.subproject) {
            tagSpan.innerHTML = `${escapeHtml(parsed.category)} <span class="tag-subproject">/ ${escapeHtml(parsed.subproject)}</span>`;
          } else {
            tagSpan.textContent = parsed.category;
          }

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
    if (elements.form) elements.form.addEventListener('submit', handleAddTodo);

    // Task Filter Tabs
    if (elements.filterTabs) {
      elements.filterTabs.forEach((tab) => {
        tab.addEventListener('click', () => setFilter(tab.dataset.filter));
      });
    }

    // Clear Completed Button
    if (elements.clearCompletedBtn) {
      elements.clearCompletedBtn.addEventListener('click', handleClearCompleted);
    }

    // Banner Close
    if (elements.bannerClose) {
      elements.bannerClose.addEventListener('click', hideBanner);
    }

    // Performance Period Segmented Control (Week / Month / Year)
    if (elements.periodTabs) {
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
    }

    // ================= BOTTOM DOCK ACTIONS =================
    // 1. Left Button: Performance Dashboard
    if (elements.navPerformanceBtn) {
      elements.navPerformanceBtn.addEventListener('click', () => goToSlide(0));
    }

    // 2. Middle Plus Button: Tasks Management & Add Task
    if (elements.fabAddBtn) {
      elements.fabAddBtn.addEventListener('click', () => {
        goToSlide(1);
        setTimeout(() => {
          if (elements.taskInput) {
            elements.taskInput.focus();
            elements.taskInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
      });
    }

    // 3. Right Button: Settings & Projects
    if (elements.navSettingsBtn) {
      elements.navSettingsBtn.addEventListener('click', () => goToSlide(2));
    }

    // Performance Page Shortcuts
    if (elements.cardTasksDone) {
      elements.cardTasksDone.addEventListener('click', () => goToSlide(1));
    }

    if (elements.seeAllProjectsBtn) {
      elements.seeAllProjectsBtn.addEventListener('click', () => goToSlide(2));
    }

    // ================= SETTINGS: PROJECT ACTIONS =================
    if (elements.openAddProjectBtn) {
      elements.openAddProjectBtn.addEventListener('click', () => {
        openEditProjectForm(null);
      });
    }

    if (elements.toggleReorderBtn) {
      elements.toggleReorderBtn.addEventListener('click', () => {
        state.isReordering = !state.isReordering;
        renderProjectsUI();
      });
    }

    if (elements.cancelProjectBtn) {
      elements.cancelProjectBtn.addEventListener('click', closeProjectForm);
    }
    if (elements.projectForm) {
      elements.projectForm.addEventListener('submit', handleSaveProject);
    }

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
