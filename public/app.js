// Single-Page Task Manager Logic
// Interacts with Cloudflare Pages Function at /api/todos

(function () {
  'use strict';

  const API_ENDPOINT = '/api/todos';

  // Application State
  const state = {
    todos: [],
    filter: 'all', // 'all' | 'active' | 'completed'
    isLoading: true,
    isSubmitting: false,
    editingId: null,
  };

  // DOM Elements
  const elements = {
    form: document.getElementById('todoForm'),
    taskInput: document.getElementById('taskInput'),
    submitBtn: document.getElementById('submitBtn'),
    btnText: document.querySelector('.btn-text'),
    btnSpinner: document.querySelector('.btn-spinner'),
    todoList: document.getElementById('todoList'),
    loadingSkeleton: document.getElementById('loadingSkeleton'),
    emptyState: document.getElementById('emptyState'),
    emptyMessage: document.getElementById('emptyMessage'),
    countAll: document.getElementById('countAll'),
    countActive: document.getElementById('countActive'),
    countCompleted: document.getElementById('countCompleted'),
    itemsLeft: document.getElementById('itemsLeft'),
    clearCompletedBtn: document.getElementById('clearCompletedBtn'),
    filterTabs: document.querySelectorAll('.filter-tab'),
    banner: document.getElementById('banner'),
    bannerMessage: document.getElementById('bannerMessage'),
    bannerClose: document.getElementById('bannerClose'),
    connectionStatus: document.getElementById('connectionStatus'),
    syncStatus: document.getElementById('syncStatus'),
  };

  // Helper: Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Helper: Format readable date
  function formatDate(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  }

  // Status Notification Banner
  function showBanner(message, type = 'error') {
    elements.bannerMessage.textContent = message;
    elements.banner.className = `banner ${type}`;
    elements.banner.classList.remove('hidden');

    if (type === 'error') {
      elements.connectionStatus.className = 'status-indicator is-error';
      elements.connectionStatus.querySelector('.status-label').textContent = 'Error';
    }
  }

  function hideBanner() {
    elements.banner.classList.add('hidden');
    elements.connectionStatus.className = 'status-indicator';
    elements.connectionStatus.querySelector('.status-label').textContent = 'Ready';
  }

  function setSyncing(isSyncing, label = 'Syncing...') {
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

  // API Call Wrapper
  async function apiRequest(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = data.error || `Server responded with status ${res.status}`;
      throw new Error(errorMsg);
    }

    return data;
  }

  // 1. Fetch Todos (GET)
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
      showBanner(`Failed to load tasks: ${error.message}`);
    } finally {
      state.isLoading = false;
      elements.loadingSkeleton.classList.add('hidden');
      render();
    }
  }

  // 2. Add Todo (POST)
  async function handleAddTodo(event) {
    event.preventDefault();
    const title = elements.taskInput.value.trim();
    if (!title || state.isSubmitting) return;

    state.isSubmitting = true;
    elements.submitBtn.disabled = true;
    elements.btnText.classList.add('hidden');
    elements.btnSpinner.classList.remove('hidden');
    setSyncing(true, 'Adding...');

    try {
      const data = await apiRequest(API_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ title }),
      });

      if (data.todo) {
        state.todos.unshift(data.todo);
      }
      elements.taskInput.value = '';
      hideBanner();
      render();
    } catch (error) {
      showBanner(`Could not add task: ${error.message}`);
    } finally {
      state.isSubmitting = false;
      elements.submitBtn.disabled = false;
      elements.btnText.classList.remove('hidden');
      elements.btnSpinner.classList.add('hidden');
      setSyncing(false);
    }
  }

  // 3. Toggle Complete (PUT)
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
      showBanner(`Could not update task status: ${error.message}`);
      itemEl.classList.remove('is-busy');
    } finally {
      setSyncing(false);
    }
  }

  // 4. Update Title (PUT)
  async function handleSaveTitle(id, newTitle) {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      render();
      return;
    }

    setSyncing(true, 'Saving...');

    try {
      const data = await apiRequest(API_ENDPOINT, {
        method: 'PUT',
        body: JSON.stringify({ id, title: trimmed }),
      });

      const updated = data.todo;
      state.todos = state.todos.map((t) => (t.id === id ? { ...t, ...updated } : t));
    } catch (error) {
      showBanner(`Could not rename task: ${error.message}`);
    } finally {
      state.editingId = null;
      setSyncing(false);
      render();
    }
  }

  // 5. Delete Todo (DELETE)
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
      showBanner(`Could not delete task: ${error.message}`);
      itemEl.classList.remove('is-busy');
    } finally {
      setSyncing(false);
    }
  }

  // 6. Clear Completed Todos
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
      showBanner(`Failed while clearing completed tasks: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  }

  // Filter Handling
  function setFilter(filter) {
    state.filter = filter;
    elements.filterTabs.forEach((tab) => {
      const isSelected = tab.dataset.filter === filter;
      tab.classList.toggle('active', isSelected);
      tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });
    render();
  }

  // Render Function
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
      return;
    }

    elements.emptyState.classList.add('hidden');
    elements.todoList.classList.remove('hidden');
    elements.todoList.innerHTML = '';

    visibleTodos.forEach((todo) => {
      const isCompleted = Boolean(todo.completed);
      const isEditing = state.editingId === todo.id;

      const li = document.createElement('li');
      li.className = `todo-item ${isCompleted ? 'is-completed' : ''}`;
      li.dataset.id = todo.id;

      // Checkbox
      const checkbox = document.createElement('button');
      checkbox.type = 'button';
      checkbox.className = 'custom-checkbox';
      checkbox.setAttribute('aria-label', isCompleted ? 'Mark task as incomplete' : 'Mark task as complete');
      checkbox.innerHTML = `
        <svg class="checkbox-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      checkbox.addEventListener('click', () => handleToggleTodo(todo.id, isCompleted, li));

      // Content container
      const content = document.createElement('div');
      content.className = 'todo-content';

      if (isEditing) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'edit-input';
        input.value = todo.title;
        input.maxLength = 255;

        const commitEdit = () => {
          handleSaveTitle(todo.id, input.value);
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
        titleSpan.textContent = todo.title;
        titleSpan.title = 'Double-click to edit';
        titleSpan.addEventListener('dblclick', () => {
          state.editingId = todo.id;
          render();
        });

        const metaSpan = document.createElement('span');
        metaSpan.className = 'todo-meta';
        const formattedDate = formatDate(todo.created_at);
        if (formattedDate) {
          metaSpan.textContent = `Created ${formattedDate}`;
        }

        content.appendChild(titleSpan);
        if (formattedDate) {
          content.appendChild(metaSpan);
        }
      }

      // Actions
      const actions = document.createElement('div');
      actions.className = 'item-actions';

      if (!isEditing) {
        // Edit Button
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'icon-btn';
        editBtn.setAttribute('aria-label', `Edit "${todo.title}"`);
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

      // Delete Button
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'icon-btn icon-btn-delete';
      deleteBtn.setAttribute('aria-label', `Delete "${todo.title}"`);
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

  // Event Listeners
  elements.form.addEventListener('submit', handleAddTodo);
  elements.clearCompletedBtn.addEventListener('click', handleClearCompleted);
  elements.bannerClose.addEventListener('click', hideBanner);

  elements.filterTabs.forEach((tab) => {
    tab.addEventListener('click', () => setFilter(tab.dataset.filter));
  });

  // Initialization
  document.addEventListener('DOMContentLoaded', fetchTodos);
})();
