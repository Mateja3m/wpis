import Database from "better-sqlite3";
import { canTransition, type PaymentIntent, type PaymentStatus, type VerificationResult } from "@wpis/core";

export interface StoredIntent {
  id: string;
  intent: PaymentIntent;
  status: PaymentStatus;
  txHash: string | null;
  confirmations: number | null;
  lastCheckedAt: string | null;
}

export interface IntentStatusCounts {
  pending: number;
  detected: number;
  confirmed: number;
  expired: number;
  failed: number;
}

export class VerifierDb {
  private readonly db: Database.Database;

  public constructor(filename = "wpis-verifier.sqlite") {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.createSchema();
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS intents (
        id TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        status TEXT NOT NULL,
        tx_hash TEXT,
        confirmations INTEGER,
        last_checked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        intent_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(intent_id) REFERENCES intents(id)
      );

      CREATE INDEX IF NOT EXISTS idx_intents_status ON intents(status);
      CREATE INDEX IF NOT EXISTS idx_events_intent_id ON events(intent_id);
    `);

    this.ensureIntentsColumn("tx_hash", "TEXT");
    this.ensureIntentsColumn("confirmations", "INTEGER");
    this.ensureIntentsColumn("last_checked_at", "TEXT");
  }

  private ensureIntentsColumn(columnName: string, columnType: string): void {
    const columns = this.db.prepare("PRAGMA table_info(intents)").all() as Array<{ name: string }>;
    const exists = columns.some((column) => column.name === columnName);
    if (!exists) {
      this.db.exec(`ALTER TABLE intents ADD COLUMN ${columnName} ${columnType}`);
    }
  }

  public createIntent(intent: PaymentIntent): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO intents (id, json, status, created_at, updated_at)
         VALUES (@id, @json, @status, @createdAt, @updatedAt)`
      )
      .run({
        id: intent.id,
        json: JSON.stringify(intent),
        status: intent.status,
        createdAt: now,
        updatedAt: now
      });

    this.addEvent(intent.id, "INTENT_CREATED", { status: intent.status });
  }

  public getIntent(id: string): StoredIntent | null {
    const row = this.db
      .prepare("SELECT id, json, status, tx_hash, confirmations, last_checked_at FROM intents WHERE id = ?")
      .get(id) as
      | {
          id: string;
          json: string;
          status: PaymentStatus;
          tx_hash: string | null;
          confirmations: number | null;
          last_checked_at: string | null;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      intent: JSON.parse(row.json) as PaymentIntent,
      status: row.status,
      txHash: row.tx_hash,
      confirmations: row.confirmations,
      lastCheckedAt: row.last_checked_at
    };
  }

  public listPendingIntents(): PaymentIntent[] {
    const rows = this.db
      .prepare("SELECT json FROM intents WHERE status IN ('PENDING', 'DETECTED')")
      .all() as Array<{ json: string }>;

    return rows.map((row) => JSON.parse(row.json) as PaymentIntent);
  }

  public findByReference(reference: string): PaymentIntent | null {
    const rows = this.db.prepare("SELECT json FROM intents").all() as Array<{ json: string }>;
    const found = rows
      .map((row) => JSON.parse(row.json) as PaymentIntent)
      .find((intent) => intent.reference === reference);
    return found ?? null;
  }

  public getStatusCounts(): IntentStatusCounts {
    const rows = this.db
      .prepare("SELECT status, COUNT(*) as count FROM intents GROUP BY status")
      .all() as Array<{ status: PaymentStatus; count: number }>;

    const counts: IntentStatusCounts = {
      pending: 0,
      detected: 0,
      confirmed: 0,
      expired: 0,
      failed: 0
    };

    for (const row of rows) {
      if (row.status === "PENDING") {
        counts.pending = row.count;
      } else if (row.status === "DETECTED") {
        counts.detected = row.count;
      } else if (row.status === "CONFIRMED") {
        counts.confirmed = row.count;
      } else if (row.status === "EXPIRED") {
        counts.expired = row.count;
      } else if (row.status === "FAILED") {
        counts.failed = row.count;
      }
    }

    return counts;
  }

  public updateIntentStatus(id: string, status: PaymentStatus, verification: VerificationResult): boolean {
    const current = this.getIntent(id);
    if (!current) {
      return false;
    }

    const canMoveToStatus = current.status === status || canTransition(current.status, status);
    if (!canMoveToStatus) {
      return false;
    }

    const statusChanged = current.status !== status;
    const nextStatus = statusChanged ? status : current.status;
    const updatedIntent: PaymentIntent = statusChanged ? { ...current.intent, status: nextStatus } : current.intent;
    const nextTxHash = verification.txHash ?? current.txHash;
    const nextConfirmations = verification.confirmations ?? current.confirmations;

    const now = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE intents
         SET json = @json,
             status = @status,
             tx_hash = @txHash,
             confirmations = @confirmations,
             last_checked_at = @lastCheckedAt,
             updated_at = @updatedAt
         WHERE id = @id`
      )
      .run({
        id,
        json: JSON.stringify(updatedIntent),
        status: nextStatus,
        txHash: nextTxHash,
        confirmations: nextConfirmations,
        lastCheckedAt: now,
        updatedAt: now
      });

    this.addEvent(id, "INTENT_VERIFIED", {
      ...verification,
      status: nextStatus,
      txHash: nextTxHash ?? undefined,
      confirmations: nextConfirmations ?? undefined,
      at: now
    });
    return statusChanged;
  }

  private addEvent(intentId: string, type: string, payload: Record<string, unknown> | VerificationResult): void {
    this.db
      .prepare(
        `INSERT INTO events (intent_id, type, payload, created_at)
         VALUES (@intentId, @type, @payload, @createdAt)`
      )
      .run({
        intentId,
        type,
        payload: JSON.stringify(payload),
        createdAt: new Date().toISOString()
      });
  }

  public close(): void {
    this.db.close();
  }

  public ping(): boolean {
    const row = this.db.prepare("SELECT 1 as ok").get() as { ok: number };
    return row.ok === 1;
  }
}
