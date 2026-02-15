import express, { type Request, type Response } from "express";
import { canTransition, type WpisErrorCode } from "@wpis/core";
import { ARBITRUM_ONE_CHAIN_ID, createArbitrumAdapter } from "@wpis/adapter-arbitrum";
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
  if (!canTransition(current, verification.status)) {
    return current;
  }
  return verification.status;
}

function structuredLog(type: string, payload: Record<string, unknown>): void {
  const event = {
    timestamp: new Date().toISOString(),
    type,
    ...payload
  };
  console.info(JSON.stringify(event));
}

function asErrorCode(error: unknown): WpisErrorCode | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  if (!("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: string }).code;
  if (
    code === "VALIDATION_ERROR" ||
    code === "RPC_ERROR" ||
    code === "EXPIRED_ERROR" ||
    code === "CONFIRMATION_PENDING" ||
    code === "CHAIN_MISMATCH"
  ) {
    return code;
  }
  return undefined;
}

export function createVerifierServer(): VerifierServer {
  const app = express();
  app.use(express.json());

  const scanBlocksValue = process.env.EVM_SCAN_BLOCKS ?? "500";
  const scanBlocks = /^\d+$/.test(scanBlocksValue) ? BigInt(scanBlocksValue) : 500n;
  const db = new VerifierDb();
  const adapter = createArbitrumAdapter({
    scanBlocks,
    isReferenceUsed: (reference) => db.findByReference(reference) !== null
  });

  app.get("/health", async (_request: Request, response: Response) => {
    const dbStatus = db.ping();
    const rpcHealth = await adapter.getRpcHealth();
    const chainId = rpcHealth.chainId ?? ARBITRUM_ONE_CHAIN_ID;
    const rpcConnected = rpcHealth.rpcConnected && chainId === ARBITRUM_ONE_CHAIN_ID;

    const payload = {
      ok: dbStatus && rpcConnected,
      chainId,
      rpcConnected,
      dbStatus
    };

    if (payload.ok) {
      response.json(payload);
      return;
    }
    response.status(503).json(payload);
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
      response.status(400).json({ error: message, code: asErrorCode(error) });
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
      const updated = db.updateIntentStatus(stored.id, nextStatus, result);
      structuredLog("intent.verify", {
        intentId: stored.id,
        previousStatus: stored.status,
        nextStatus,
        updated,
        txHash: result.txHash,
        confirmations: result.confirmations ?? null,
        errorCode: result.errorCode ?? null
      });
      response.json({ ...result, status: nextStatus });
    } catch (error) {
      const message = error instanceof Error ? error.message : "verification failed";
      response.status(500).json({ error: message, code: asErrorCode(error) });
    }
  });

  const intervalHandle = setInterval(async () => {
    const intents = db.listPendingIntents();
    for (const intent of intents) {
      try {
        const result = await adapter.verify(intent);
        const nextStatus = resolveNextStatus(intent.status, result);
        const updated = db.updateIntentStatus(intent.id, nextStatus, result);
        structuredLog("intent.poll.verify", {
          intentId: intent.id,
          previousStatus: intent.status,
          nextStatus,
          updated,
          txHash: result.txHash,
          confirmations: result.confirmations ?? null,
          errorCode: result.errorCode ?? null
        });
      } catch {
        const updated = db.updateIntentStatus(intent.id, "FAILED", { status: "FAILED", reason: "verifier exception" });
        structuredLog("intent.poll.verify_error", {
          intentId: intent.id,
          previousStatus: intent.status,
          nextStatus: "FAILED",
          updated
        });
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
          console.info(`[verifier] listening on http://localhost:${port}`);
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
