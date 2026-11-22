import { createBackend } from './backend';
const backend = createBackend();
const port = Number(process.env.PORT ?? 8080);
backend.server.listen(port, '0.0.0.0', () => console.log(`MoveCompass listening on port ${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void backend.close().then(() => process.exit(0)); });
