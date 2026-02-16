import express, { type Request, type Response } from "express";
import cors from "cors";
import { canTransition, type WpisErrorCode } from "@wpis/core";
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

function isDebugEnabled(): boolean {
  return process.env.DEBUG_WPIS === "1";
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
  const rawExpectedChainId = process.env.ARBITRUM_CHAIN_ID ?? "421614";
  const parsedExpectedChainId = Number(rawExpectedChainId);
  const expectedChainId = Number.isInteger(parsedExpectedChainId) ? parsedExpectedChainId : 421614;
  const allowedOrigins = new Set<string>(["http://localhost:3000", "http://127.0.0.1:3000"]);
  const frontendOrigin = process.env.FRONTEND_ORIGIN;
  if (frontendOrigin) {
    allowedOrigins.add(frontendOrigin);
  }

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      methods: ["GET", "POST", "OPTIONS"],
      credentials: false
    })
  );
  app.use(express.json());

  const scanBlocksValue = process.env.EVM_SCAN_BLOCKS ?? "150";
  const scanBlocks = /^\d+$/.test(scanBlocksValue) ? BigInt(scanBlocksValue) : 150n;
  const db = new VerifierDb();
  const adapter = createArbitrumAdapter({
    expectedChainId,
    scanBlocks,
    isReferenceUsed: (reference) => db.findByReference(reference) !== null
  });
  const verificationLocks = new Map<string, Promise<VerificationResult>>();

  const verifyIntent = async (intentId: string, logType: "intent.verify" | "intent.poll.verify"): Promise<VerificationResult> => {
    const running = verificationLocks.get(intentId);
    if (running) {
      return running;
    }

    const task = (async (): Promise<VerificationResult> => {
      const startedAt = Date.now();
      const beforeVerify = db.getIntent(intentId);
      if (!beforeVerify) {
        return { status: "FAILED", reason: "intent not found" };
      }

      const result = await adapter.verify(beforeVerify.intent);
      const current = db.getIntent(intentId);
      if (!current) {
        return { status: "FAILED", reason: "intent not found" };
      }

      const nextStatus = resolveNextStatus(current.status, result);
      const updated = db.updateIntentStatus(current.id, nextStatus, result);
      structuredLog(logType, {
        intentId: current.id,
        previousStatus: current.status,
        nextStatus,
        updated,
        txHash: result.txHash,
        confirmations: result.confirmations ?? null,
        errorCode: result.errorCode ?? null,
        durationMs: Date.now() - startedAt
      });
      return { ...result, status: nextStatus };
    })();

    verificationLocks.set(intentId, task);
    try {
      return await task;
    } finally {
      verificationLocks.delete(intentId);
    }
  };

  app.get("/health", async (_request: Request, response: Response) => {
    const dbStatus = db.ping();
    const rpcHealth = await adapter.getRpcHealth();
    const chainId = rpcHealth.chainId ?? expectedChainId;
    const rpcConnected = rpcHealth.rpcConnected && chainId === expectedChainId;

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

    response.json({
      intent: stored.intent,
      status: stored.status,
      txHash: stored.txHash,
      confirmations: stored.confirmations,
      lastCheckedAt: stored.lastCheckedAt
    });
  });

  app.post("/intents/:id/verify", async (request: Request, response: Response) => {
    const id = typeof request.params.id === "string" ? request.params.id : "";
    const stored = db.getIntent(id);
    if (!stored) {
      response.status(404).json({ error: "intent not found" });
      return;
    }

    try {
      const result = await verifyIntent(stored.id, "intent.verify");
      response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "verification failed";
      response.status(500).json({ error: message, code: asErrorCode(error) });
    }
  });

  const intervalHandle = setInterval(async () => {
    const pollStartedAt = Date.now();
    const intents = db.listPendingIntents();
    const errorCounts: Record<string, number> = {};
    const verifyDurationsMs: number[] = [];
    for (const intent of intents) {
      try {
        const verifyStartedAt = Date.now();
        await verifyIntent(intent.id, "intent.poll.verify");
        verifyDurationsMs.push(Date.now() - verifyStartedAt);
      } catch (error) {
        const updated = db.updateIntentStatus(intent.id, "FAILED", { status: "FAILED", reason: "verifier exception" });
        const errorCode = asErrorCode(error) ?? "UNKNOWN";
        structuredLog("intent.poll.verify_error", {
          intentId: intent.id,
          previousStatus: intent.status,
          nextStatus: "FAILED",
          updated,
          errorCode
        });
        errorCounts[errorCode] = (errorCounts[errorCode] ?? 0) + 1;
      }
    }
    if (isDebugEnabled()) {
      const counts = db.getStatusCounts();
      const avgVerifyDurationMs =
        verifyDurationsMs.length > 0
          ? Number((verifyDurationsMs.reduce((sum, value) => sum + value, 0) / verifyDurationsMs.length).toFixed(2))
          : 0;
      structuredLog("intent.poll.summary", {
        checkedIntents: intents.length,
        pending: counts.pending,
        detected: counts.detected,
        expired: counts.expired,
        verifiedCalls: verifyDurationsMs.length,
        avgVerifyDurationMs,
        pollDurationMs: Date.now() - pollStartedAt,
        errors: errorCounts
      });
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
