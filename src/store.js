import { randomUUID } from 'node:crypto';

export const STATUSES = ['todo', 'doing', 'done'];
export const PRIORITIES = ['low', 'medium', 'high'];

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function normalizeTitle(title) {
  if (typeof title !== 'string' || title.trim() === '') {
    throw badRequest('A non-empty title is required');
  }
  return title.trim();
}

function normalizeStatus(status) {
  if (status === undefined) return undefined;
  if (!STATUSES.includes(status)) {
    throw badRequest(`Status must be one of: ${STATUSES.join(', ')}`);
  }
  return status;
}

function normalizePriority(priority) {
  if (priority === undefined) return undefined;
  if (!PRIORITIES.includes(priority)) {
    throw badRequest(`Priority must be one of: ${PRIORITIES.join(', ')}`);
  }
  return priority;
}

function normalizeDueDate(dueDate) {
  if (dueDate === undefined || dueDate === null || dueDate === '') return null;
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) {
    throw badRequest('dueDate must be a valid date');
  }
  return parsed.toISOString();
}

function sortTasks(tasks, sort) {
  const sorted = [...tasks];
  switch (sort) {
    case 'dueDate':
      return sorted.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    case 'priority':
      return sorted.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    case 'title':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'createdAt':
    default:
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export function createStore() {
  const tasks = new Map();

  return {
    create(input = {}) {
      const now = new Date().toISOString();
      const task = {
        id: randomUUID(),
        title: normalizeTitle(input.title),
        description: typeof input.description === 'string' ? input.description : '',
        status: normalizeStatus(input.status) ?? 'todo',
        priority: normalizePriority(input.priority) ?? 'medium',
        dueDate: normalizeDueDate(input.dueDate),
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      tasks.set(task.id, task);
      return task;
    },

    get(id) {
      return tasks.get(id) ?? null;
    },

    list(filters = {}) {
      const { status, priority, q } = filters;
      let result = [...tasks.values()];

      if (status !== undefined) {
        normalizeStatus(status);
        result = result.filter((task) => task.status === status);
      }
      if (priority !== undefined) {
        normalizePriority(priority);
        result = result.filter((task) => task.priority === priority);
      }
      if (typeof q === 'string' && q.trim() !== '') {
        const needle = q.trim().toLowerCase();
        result = result.filter(
          (task) =>
            task.title.toLowerCase().includes(needle) ||
            task.description.toLowerCase().includes(needle),
        );
      }
      return sortTasks(result, filters.sort);
    },

    update(id, patch = {}) {
      const task = tasks.get(id);
      if (!task) return null;

      const next = { ...task };
      if ('title' in patch) next.title = normalizeTitle(patch.title);
      if ('description' in patch) {
        if (typeof patch.description !== 'string') throw badRequest('description must be a string');
        next.description = patch.description;
      }
      if ('status' in patch) {
        const status = normalizeStatus(patch.status);
        next.status = status;
        if (status === 'done' && !task.completedAt) next.completedAt = new Date().toISOString();
        if (status !== 'done') next.completedAt = null;
      }
      if ('priority' in patch) next.priority = normalizePriority(patch.priority);
      if ('dueDate' in patch) next.dueDate = normalizeDueDate(patch.dueDate);
      next.updatedAt = new Date().toISOString();

      tasks.set(id, next);
      return next;
    },

    remove(id) {
      return tasks.delete(id);
    },

    stats() {
      const byStatus = { todo: 0, doing: 0, done: 0 };
      for (const task of tasks.values()) byStatus[task.status] += 1;
      return { total: tasks.size, byStatus };
    },

    clear() {
      tasks.clear();
    },
  };
}
