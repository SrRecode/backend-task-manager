import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/app.js';
import { createStore } from '../src/store.js';

let server;
let base;

before(async () => {
  server = createServer(createStore());
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

function api(path, init) {
  return fetch(`${base}${path}`, init);
}

function post(path, body) {
  return api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('store validation', () => {
  test('requires a title and defaults status/priority', () => {
    const store = createStore();
    const task = store.create({ title: 'Write report' });
    assert.equal(task.title, 'Write report');
    assert.equal(task.status, 'todo');
    assert.equal(task.priority, 'medium');
    assert.equal(task.completedAt, null);

    assert.throws(() => store.create({}), /title is required/);
    assert.throws(() => store.create({ title: '   ' }), /title is required/);
  });

  test('rejects invalid status, priority and dueDate', () => {
    const store = createStore();
    assert.throws(() => store.create({ title: 'x', status: 'later' }), /Status must be/);
    assert.throws(() => store.create({ title: 'x', priority: 'urgent' }), /Priority must be/);
    assert.throws(() => store.create({ title: 'x', dueDate: 'not-a-date' }), /valid date/);
  });

  test('sets completedAt when moving to done and clears it otherwise', () => {
    const store = createStore();
    const task = store.create({ title: 'ship' });
    const done = store.update(task.id, { status: 'done' });
    assert.ok(done.completedAt, 'completedAt set');
    const reopened = store.update(task.id, { status: 'todo' });
    assert.equal(reopened.completedAt, null);
  });
});

describe('HTTP api', () => {
  test('health reports stats', async () => {
    const res = await api('/health');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok', total: 0, byStatus: { todo: 0, doing: 0, done: 0 } });
  });

  test('creates a task (201) and reads it back', async () => {
    const res = await post('/api/tasks', { title: 'Design schema', priority: 'high' });
    assert.equal(res.status, 201);
    const task = await res.json();
    assert.equal(task.title, 'Design schema');
    assert.equal(task.priority, 'high');

    const get = await api(`/api/tasks/${task.id}`);
    assert.equal(get.status, 200);
    assert.equal((await get.json()).id, task.id);
  });

  test('rejects a missing title with 400', async () => {
    const res = await post('/api/tasks', { description: 'no title' });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /title is required/);
  });

  test('patches a task and stamps updatedAt', async () => {
    const { id, updatedAt } = await (await post('/api/tasks', { title: 'Patch me' })).json();
    await new Promise((r) => setTimeout(r, 5));
    const res = await api(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'doing', priority: 'low' }),
    });
    const patched = await res.json();
    assert.equal(patched.status, 'doing');
    assert.equal(patched.priority, 'low');
    assert.notEqual(patched.updatedAt, updatedAt);
  });

  test('complete and reopen actions', async () => {
    const { id } = await (await post('/api/tasks', { title: 'Finish me' })).json();

    const done = await (await post(`/api/tasks/${id}/complete`)).json();
    assert.equal(done.status, 'done');
    assert.ok(done.completedAt);

    const reopened = await (await post(`/api/tasks/${id}/reopen`)).json();
    assert.equal(reopened.status, 'todo');
    assert.equal(reopened.completedAt, null);
  });

  test('filters by status and priority and searches text', async () => {
    const fresh = createStore();
    const local = createServer(fresh);
    await new Promise((r) => local.listen(0, r));
    const localBase = `http://127.0.0.1:${local.address().port}`;

    const make = (body) =>
      fetch(`${localBase}/api/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    await make({ title: 'Alpha task', priority: 'high', status: 'todo' });
    await make({ title: 'Beta task', priority: 'low', status: 'doing' });
    await make({ title: 'Gamma', description: 'contains alpha word', priority: 'high', status: 'done' });

    const high = await (await fetch(`${localBase}/api/tasks?priority=high`)).json();
    assert.equal(high.count, 2);

    const todo = await (await fetch(`${localBase}/api/tasks?status=todo`)).json();
    assert.equal(todo.count, 1);
    assert.equal(todo.tasks[0].title, 'Alpha task');

    const search = await (await fetch(`${localBase}/api/tasks?q=alpha`)).json();
    assert.equal(search.count, 2);

    const sorted = await (await fetch(`${localBase}/api/tasks?sort=priority`)).json();
    assert.equal(sorted.tasks[0].priority, 'high');

    await new Promise((r) => local.close(r));
  });

  test('stats endpoint counts by status', async () => {
    const fresh = createStore();
    const local = createServer(fresh);
    await new Promise((r) => local.listen(0, r));
    const localBase = `http://127.0.0.1:${local.address().port}`;
    const make = (body) =>
      fetch(`${localBase}/api/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    await make({ title: 'a', status: 'todo' });
    await make({ title: 'b', status: 'done' });

    const stats = await (await fetch(`${localBase}/api/tasks/stats`)).json();
    assert.deepEqual(stats, { total: 2, byStatus: { todo: 1, doing: 0, done: 1 } });

    await new Promise((r) => local.close(r));
  });

  test('deletes a task and 404s afterwards', async () => {
    const { id } = await (await post('/api/tasks', { title: 'Temp' })).json();
    const del = await api(`/api/tasks/${id}`, { method: 'DELETE' });
    assert.equal(del.status, 204);
    const after = await api(`/api/tasks/${id}`);
    assert.equal(after.status, 404);
  });

  test('missing task returns 404 for GET/PATCH/DELETE/complete', async () => {
    assert.equal((await api('/api/tasks/nope')).status, 404);
    assert.equal(
      (await api('/api/tasks/nope', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' })).status,
      404,
    );
    assert.equal((await api('/api/tasks/nope', { method: 'DELETE' })).status, 404);
    assert.equal((await post('/api/tasks/nope/complete')).status, 404);
  });

  test('invalid JSON and bad filters return 400', async () => {
    const bad = await api('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ oops',
    });
    assert.equal(bad.status, 400);

    const filter = await api('/api/tasks?status=bogus');
    assert.equal(filter.status, 400);
  });

  test('unsupported method returns 405', async () => {
    const res = await api('/api/tasks', { method: 'DELETE' });
    assert.equal(res.status, 405);
  });
});
