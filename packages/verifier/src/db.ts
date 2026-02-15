import Database from "better-sqlite3";
import { canTransition, type PaymentIntent, type PaymentStatus, type VerificationResult } from "@wpis/core";

export interface StoredIntent {
  id: string;
  intent: PaymentIntent;
  status: PaymentStatus;
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
      .prepare("SELECT id, json, status FROM intents WHERE id = ?")
      .get(id) as { id: string; json: string; status: PaymentStatus } | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      intent: JSON.parse(row.json) as PaymentIntent,
      status: row.status
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

  public updateIntentStatus(id: string, status: PaymentStatus, verification: VerificationResult): boolean {
    const current = this.getIntent(id);
    if (!current) {
      return false;
    }

    if (current.status === status) {
      return false;
    }
    if (!canTransition(current.status, status)) {
      return false;
    }

    const updatedIntent: PaymentIntent = {
      ...current.intent,
      status
    };

    const now = new Date().toISOString();

    this.db
      .prepare("UPDATE intents SET json = @json, status = @status, updated_at = @updatedAt WHERE id = @id")
      .run({
        id,
        json: JSON.stringify(updatedIntent),
        status,
        updatedAt: now
      });

    this.addEvent(id, "INTENT_VERIFIED", verification);
    return true;
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
