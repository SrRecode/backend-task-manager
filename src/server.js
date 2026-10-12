import { createServer } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const server = createServer();

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Task manager listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
