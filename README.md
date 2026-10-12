# Backend Task Manager

A task-management REST API built on Node's built-in `http` module — **no runtime
dependencies**. It supports full CRUD, status transitions with an automatic
`completedAt` timestamp, filtering, sorting and aggregate stats.

## Requirements

- Node.js 18+ (uses the global `fetch` in tests and `crypto.randomUUID`)

## Getting started

```bash
npm start          # http://localhost:3000 (override with PORT)
npm run dev        # start with --watch
npm test           # node:test suite
```

## API

| Method | Path                          | Description                                  |
| ------ | ----------------------------- | -------------------------------------------- |
| GET    | `/health`                     | Liveness plus `total` / `byStatus`           |
| GET    | `/api/tasks`                  | List tasks (see filters below)               |
| POST   | `/api/tasks`                  | Create a task                                |
| GET    | `/api/tasks/stats`            | Aggregate counts by status                   |
| GET    | `/api/tasks/:id`              | Fetch one task                               |
| PATCH  | `/api/tasks/:id`              | Partially update a task                      |
| PUT    | `/api/tasks/:id`              | Alias of PATCH                               |
| DELETE | `/api/tasks/:id`              | Delete a task                                |
| POST   | `/api/tasks/:id/complete`     | Set status to `done`                         |
| POST   | `/api/tasks/:id/reopen`       | Set status back to `todo`                    |

### Task shape

```json
{
  "id": "7b0d...",
  "title": "Design schema",
  "description": "",
  "status": "todo",            // todo | doing | done
  "priority": "medium",        // low | medium | high
  "dueDate": null,             // ISO string or null
  "createdAt": "...",
  "updatedAt": "...",
  "completedAt": null
}
```

### List filters

`GET /api/tasks?status=todo&priority=high&q=design&sort=priority`

- `status`, `priority` — exact match (unknown values return `400`)
- `q` — case-insensitive substring over title and description
- `sort` — `createdAt` (default, newest first), `dueDate`, `priority`, `title`

### Examples

```bash
curl -s -X POST localhost:3000/api/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"Design schema","priority":"high","dueDate":"2026-01-01"}'

curl -s "localhost:3000/api/tasks?status=todo&sort=priority"
curl -s -X POST localhost:3000/api/tasks/<id>/complete
```

### Status codes

- `201` created, `204` deleted
- `400` bad title / enum / date / JSON / filter
- `404` unknown task or route
- `405` unsupported method
- `413` body over 32 KB

## Project layout

```
src/store.js     Store + validation + filtering/sorting (pure, unit tested)
src/app.js       createHandler / createServer — routing, JSON parsing, errors
src/server.js    Entry point: listens on PORT and handles shutdown
test/            node:test coverage of the store and the live HTTP API
```

### Design notes

- `status` drives `completedAt`: entering `done` stamps it, any other status
  clears it.
- Unknown `status`/`priority` query values are rejected with `400` rather than
  silently returning nothing.
- `createHandler(store)` is separate from `createServer`, so tests mount the
  handler on an ephemeral port (`listen(0)`).

## Tests

```bash
npm test
```

Covers title/enum/date validation, completedAt transitions, CRUD, PATCH
updatedAt stamping, complete/reopen actions, filtering by status/priority, text
search, sorting, stats, 404s and 400s.

## License

MIT
