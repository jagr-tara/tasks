// Single-Page Task & Performance Manager
// Interacts with Cloudflare Pages Function at /api/todos with X-App-Password authentication
// Matches exact UI and architecture requirements from AGENTS.md

(function () {
  'use strict';

  const API_ENDPOINT = '/api/todos';
  const AUTH_STORAGE_KEY = 'app_password';
  const LOCAL_CACHE_KEY = 'offline_todos_cache';

  // Category Configuration
  const CATEGORIES = {
    'Decision making': { icon: '🪴', baseMinutes: 860, basePct: 62 },
    'Design system': { icon: '🍎', baseMinutes: 665, basePct: 48 },
    'Exploration phase': { icon: '🥞', baseMinutes: 435, basePct: 31 },
  };

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
    filter: 'all', // 'all' | 'active' | 'completed'
    isLoading: true,
    isSubmitting: false,
    editingId: null,
    activeSlide: 0, // 0 = Tasks, 1 = Performance
    selectedCategory: 'Decision making',
    activePeriod: 'week', // 'week' | 'month' | 'year'
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

    // Main App & Slider Elements
    appLayout: document.getElementById('appLayout'),
    pageViewport: document.getElementById('pageViewport'),
    pageSlider: document.getElementById('pageSlider'),

    // Navigation Dock Elements
    navTasksBtn: document.getElementById('navTasksBtn'),
    navPerformanceBtn: document.getElementById('navPerformanceBtn'),
    navMessagesBtn: document.getElementById('navMessagesBtn'),
    navProfileBtn: document.getElementById('navProfileBtn'),
    fabAddBtn: document.getElementById('fabAddBtn'),

    // Tasks Page Elements
    form: document.getElementById('todoForm'),
    taskInput: document.getElementById('taskInput'),
    submitBtn: document.getElementById('submitBtn'),
    btnText: document.querySelector('#submitBtn .btn-text'),
    btnSpinner: document.querySelector('#submitBtn .btn-spinner'),
    categoryChips: document.querySelectorAll('.category-chip'),
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

    // Performance Page Elements
    periodTabs: document.querySelectorAll('.period-tab'),
    trendBadge: document.getElementById('trendBadge'),
    focusedTimeValue: document.getElementById('focusedTimeValue'),
    comparisonSubtext: document.getElementById('comparisonSubtext'),
    heatmapGrid: document.getElementById('heatmapGrid'),
    tasksDoneCount: document.getElementById('tasksDoneCount'),
    avgDailyFocusValue: document.getElementById('avgDailyFocusValue'),
    seeAllProjectsBtn: document.getElementById('seeAllProjectsBtn'),
    projHoursDecision: document.getElementById('projHours-decision'),
    projPctDecision: document.getElementById('projPct-decision'),
    projBarDecision: document.getElementById('projBar-decision'),
    projHoursDesign: document.getElementById('projHours-design'),
    projPctDesign: document.getElementById('projPct-design'),
    projBarDesign: document.getElementById('projBar-design'),
    projHoursExploration: document.getElementById('projHours-exploration'),
    projPctExploration: document.getElementById('projPct-exploration'),
    projBarExploration: document.getElementById('projBar-exploration'),

    // Feedback & Status Elements
    banner: document.getElementById('banner'),
    bannerMessage: document.getElementById('bannerMessage'),
    bannerClose: document.getElementById('bannerClose'),
    connectionStatus: document.getElementById('connectionStatus'),
    syncStatus: document.getElementById('syncStatus'),
  };

  // ================= LOCAL FALLBACK STORAGE =================
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
    return localStorage.getItem(AUTH_STORAGE_KEY) || '';
  }

  function setStoredPassword(password) {
    localStorage.setItem(AUTH_STORAGE_KEY, password);
  }

  function clearStoredPassword() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  function showAuthPrompt(errorMessage = '') {
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

    if (match && CATEGORIES[match[1]]) {
      return {
        category: match[1],
        cleanTitle: match[2] || rawTitle,
        icon: CATEGORIES[match[1]].icon,
      };
    }

    // Default to Decision making if unspecified
    return {
      category: 'Decision making',
      cleanTitle: rawTitle,
      icon: '🪴',
    };
  }

  function formatDuration(minutes) {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hrs}h ${mins < 10 ? '0' : ''}${mins}m`;
  }

  let bannerTimeout = null;

  function showBanner(message, type = 'error') {
    elements.bannerMessage.textContent = message;
    elements.banner.className = `banner ${type}`;
    elements.banner.classList.remove('hidden');

    if (type === 'error' && elements.connectionStatus) {
      elements.connectionStatus.className = 'status-indicator is-error';
      elements.connectionStatus.querySelector('.status-label').textContent = 'Error';
    }

    clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(() => {
      hideBanner();
    }, 3500);
  }

  function hideBanner() {
    clearTimeout(bannerTimeout);
    elements.banner.classList.add('hidden');
    if (elements.connectionStatus) {
      elements.connectionStatus.className = 'status-indicator';
      elements.connectionStatus.querySelector('.status-label').textContent = 'Ready';
    }
  }

  function setSyncing(isSyncing, label = 'Syncing...') {
    if (!elements.connectionStatus || !elements.syncStatus) return;

    if (isSyncing) {
      elements.connectionStatus.className = 'status-indicator is-syncing';
      elements.connectionStatus.querySelector('.status-label').textContent = label;
      elements.syncStatus.textContent = 'Saving changes...';
    } else {
      elements.connectionStatus.className = 'status-indicator';
      elements.connectionStatus.querySelector('.status-label').textContent = 'Ready';
      elements.syncStatus.textContent = 'Up to date';
    }
  }

  // ================= API WRAPPER WITH OFFLINE FALLBACK =================
  async function apiRequest(url, options = {}) {
    const password = getStoredPassword();

    // If running in local file protocol, use local cache simulation
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
      // Fallback gracefully for local development or disconnected preview
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

    const formattedTitle = `[${state.selectedCategory}] ${cleanTitle}`;

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

    // Preserve project category tag if not explicitly typed
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

  // ================= SLIDER & NAVIGATION =================
  function goToSlide(slideIndex) {
    state.activeSlide = slideIndex;
    elements.pageSlider.style.transform = `translateX(-${slideIndex * 50}%)`;

    // Update Dock Tabs
    if (slideIndex === 0) {
      elements.navTasksBtn.classList.add('active');
      elements.navTasksBtn.setAttribute('aria-selected', 'true');
      elements.navPerformanceBtn.classList.remove('active');
      elements.navPerformanceBtn.setAttribute('aria-selected', 'false');
    } else {
      elements.navTasksBtn.classList.remove('active');
      elements.navTasksBtn.setAttribute('aria-selected', 'false');
      elements.navPerformanceBtn.classList.add('active');
      elements.navPerformanceBtn.setAttribute('aria-selected', 'true');
    }

    // Scroll smoothly to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderPerformanceMetrics();
  }

  // Swipe Gesture Support
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

        // Ensure horizontal swipe intent
        if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
          if (deltaX < 0 && state.activeSlide === 0) {
            goToSlide(1); // Swipe left -> Performance
          } else if (deltaX > 0 && state.activeSlide === 1) {
            goToSlide(0); // Swipe right -> Tasks
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

    // Pattern reproducing the reference image:
    // Left/middle columns have sparse blocks, rightmost columns have dense black squares
    for (let c = 0; c < totalColumns; c++) {
      for (let r = 0; r < rows; r++) {
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';

        let level = 0;
        const colRatio = c / totalColumns;

        if (colRatio > 0.85) {
          // Rightmost cluster: heavily dark
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

  // ================= PERFORMANCE METRICS COMPUTATION =================
  function renderPerformanceMetrics() {
    const period = PERIOD_DATA[state.activePeriod] || PERIOD_DATA.week;

    elements.focusedTimeValue.textContent = period.time;
    elements.comparisonSubtext.textContent = period.comparison;
    elements.trendBadge.innerHTML = `<span class="badge-arrow">▲</span> ${period.trend}`;
    elements.avgDailyFocusValue.textContent = period.avgFocus;

    // Calculate actual task stats
    const totalCompleted = state.todos.filter((t) => Boolean(t.completed)).length;
    // Base 18 tasks done matching image + user completed count
    elements.tasksDoneCount.textContent = 18 + totalCompleted;

    // Project breakdown calculation
    const projectStats = {
      'Decision making': { count: 0, completed: 0 },
      'Design system': { count: 0, completed: 0 },
      'Exploration phase': { count: 0, completed: 0 },
    };

    state.todos.forEach((todo) => {
      const { category } = parseTask(todo);
      if (projectStats[category]) {
        projectStats[category].count++;
        if (todo.completed) {
          projectStats[category].completed++;
        }
      }
    });

    // Dynamic adjustment on top of base values
    const decisionMins =
      CATEGORIES['Decision making'].baseMinutes + projectStats['Decision making'].completed * 45;
    const decisionPct = Math.min(
      95,
      CATEGORIES['Decision making'].basePct + projectStats['Decision making'].completed * 2
    );

    const designMins =
      CATEGORIES['Design system'].baseMinutes + projectStats['Design system'].completed * 35;
    const designPct = Math.min(
      95,
      CATEGORIES['Design system'].basePct + projectStats['Design system'].completed * 2
    );

    const explorationMins =
      CATEGORIES['Exploration phase'].baseMinutes +
      projectStats['Exploration phase'].completed * 30;
    const explorationPct = Math.min(
      95,
      CATEGORIES['Exploration phase'].basePct + projectStats['Exploration phase'].completed * 2
    );

    elements.projHoursDecision.textContent = formatDuration(decisionMins);
    elements.projPctDecision.textContent = `${decisionPct}%`;
    elements.projBarDecision.style.width = `${decisionPct}%`;

    elements.projHoursDesign.textContent = formatDuration(designMins);
    elements.projPctDesign.textContent = `${designPct}%`;
    elements.projBarDesign.style.width = `${designPct}%`;

    elements.projHoursExploration.textContent = formatDuration(explorationMins);
    elements.projPctExploration.textContent = `${explorationPct}%`;
    elements.projBarExploration.style.width = `${explorationPct}%`;
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

    // Update Counters
    elements.countAll.textContent = totalCount;
    elements.countActive.textContent = activeCount;
    elements.countCompleted.textContent = completedCount;
    elements.itemsLeft.textContent = `${activeCount} task${activeCount === 1 ? '' : 's'} remaining`;
    elements.clearCompletedBtn.disabled = completedCount === 0;

    // Filter Items
    let visibleTodos = state.todos;
    if (state.filter === 'active') {
      visibleTodos = state.todos.filter((t) => !t.completed);
    } else if (state.filter === 'completed') {
      visibleTodos = state.todos.filter((t) => Boolean(t.completed));
    }

    // Render Empty State or List
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

        // Custom Circular Checkbox
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

        // Task Content
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
          tagSpan.textContent = `${parsed.icon} ${parsed.category}`;

          content.appendChild(titleSpan);
          content.appendChild(tagSpan);
        }

        // Action Buttons
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

    // Lock Session
    elements.lockBtn.addEventListener('click', () => {
      clearStoredPassword();
      state.todos = [];
      showAuthPrompt();
    });

    // Add Todo Form
    elements.form.addEventListener('submit', handleAddTodo);

    // Category Selector Chips
    elements.categoryChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        elements.categoryChips.forEach((c) => {
          c.classList.remove('active');
          c.setAttribute('aria-checked', 'false');
        });
        chip.classList.add('active');
        chip.setAttribute('aria-checked', 'true');
        state.selectedCategory = chip.dataset.category;
      });
    });

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

    // Bottom Navigation Dock Tabs
    elements.navTasksBtn.addEventListener('click', () => goToSlide(0));
    elements.navPerformanceBtn.addEventListener('click', () => goToSlide(1));

    if (elements.navMessagesBtn) {
      elements.navMessagesBtn.addEventListener('click', () => {
        showBanner('Discussions & team comments coming in the next update.', 'info');
      });
    }

    if (elements.navProfileBtn) {
      elements.navProfileBtn.addEventListener('click', () => {
        showBanner('Workspace settings & profile connected.', 'info');
      });
    }

    // Floating Action Button (+ FAB)
    elements.fabAddBtn.addEventListener('click', () => {
      if (state.activeSlide !== 0) {
        goToSlide(0);
      }
      setTimeout(() => {
        elements.taskInput.focus();
        elements.taskInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    });

    initSwipeGestures();
  }

  // ================= APP INITIALIZATION =================
  function initializeApp() {
    setupEventListeners();
    renderHeatmap();

    const savedPassword = getStoredPassword();
    if (!savedPassword) {
      showAuthPrompt();
    } else {
      hideAuthPrompt();
      fetchTodos();
    }
  }

  document.addEventListener('DOMContentLoaded', initializeApp);
})();
