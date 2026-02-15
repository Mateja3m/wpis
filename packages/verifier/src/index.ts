import { createVerifierServer } from "./server.js";

const server = createVerifierServer();

void server.start();

const shutdown = async (): Promise<void> => {
  await server.stop();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
