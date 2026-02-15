import express, { type Request, type Response } from "express";
import { transitionStatus } from "@wpis/core";
import { createArbitrumAdapter } from "@wpis/adapter-arbitrum";
import type { CreateIntentInput, PaymentStatus, VerificationResult } from "@wpis/core";
import { VerifierDb } from "./db.js";

export interface VerifierServer {
  app: express.Express;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

const terminalStatuses: PaymentStatus[] = ["CONFIRMED", "FAILED", "EXPIRED"];

function resolveNextStatus(current: PaymentStatus, verification: VerificationResult): PaymentStatus {
  if (terminalStatuses.includes(current)) {
    return current;
  }
  if (current === verification.status) {
    return current;
  }
  return transitionStatus(current, verification.status);
}

export function createVerifierServer(): VerifierServer {
  const app = express();
  app.use(express.json());

  const db = new VerifierDb();
  const adapter = createArbitrumAdapter({
    isReferenceUsed: (reference) => db.findByReference(reference) !== null
  });

  app.post("/intents", (request: Request, response: Response) => {
    try {
      const input = request.body as CreateIntentInput;
      const intent = adapter.createIntent(input);
      const paymentRequest = adapter.buildRequest(intent);
      db.createIntent(intent);
      response.status(201).json({ intent, paymentRequest });
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid request";
      response.status(400).json({ error: message });
    }
  });

  app.get("/intents/:id", (request: Request, response: Response) => {
    const id = typeof request.params.id === "string" ? request.params.id : "";
    const stored = db.getIntent(id);
    if (!stored) {
      response.status(404).json({ error: "intent not found" });
      return;
    }

    response.json({ intent: stored.intent, status: stored.status });
  });

  app.post("/intents/:id/verify", async (request: Request, response: Response) => {
    const id = typeof request.params.id === "string" ? request.params.id : "";
    const stored = db.getIntent(id);
    if (!stored) {
      response.status(404).json({ error: "intent not found" });
      return;
    }

    try {
      const result = await adapter.verify(stored.intent);
      const nextStatus = resolveNextStatus(stored.status, result);
      db.updateIntentStatus(stored.id, nextStatus, result);
      response.json({ ...result, status: nextStatus });
    } catch (error) {
      const message = error instanceof Error ? error.message : "verification failed";
      response.status(500).json({ error: message });
    }
  });

  const intervalHandle = setInterval(async () => {
    const intents = db.listPendingIntents();
    for (const intent of intents) {
      try {
        const result = await adapter.verify(intent);
        const nextStatus = resolveNextStatus(intent.status, result);
        if (nextStatus !== intent.status) {
          db.updateIntentStatus(intent.id, nextStatus, result);
        }
      } catch {
        db.updateIntentStatus(intent.id, "FAILED", { status: "FAILED", reason: "verifier exception" });
      }
    }
  }, 10_000);

  let server: ReturnType<typeof app.listen> | null = null;

  return {
    app,
    start: async () => {
      const port = Number(process.env.PORT ?? 4000);
      await new Promise<void>((resolve) => {
        server = app.listen(port, () => {
          resolve();
        });
      });
    },
    stop: async () => {
      clearInterval(intervalHandle);
      await new Promise<void>((resolve, reject) => {
        if (!server) {
          resolve();
          return;
        }
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      db.close();
    }
  };
}
