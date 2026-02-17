import { useState, type CSSProperties, type ReactElement } from "react";
import type { CreateIntentInput, PaymentIntent } from "@idoa/wpis-core";

export interface CreatedIntentPayload {
  intent: PaymentIntent;
  paymentRequest: {
    paymentLink: string;
    qrPayload: string;
    instructions: string[];
    expiresAt: string;
  };
}

export interface PaymentButtonProps {
  verifierUrl: string;
  input: CreateIntentInput;
  onCreated: (payload: CreatedIntentPayload) => void;
}

export function PaymentButton({ verifierUrl, input, onCreated }: PaymentButtonProps): ReactElement {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createIntent = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${verifierUrl}/intents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "failed to create intent");
      }

      const payload = (await response.json()) as CreatedIntentPayload;
      onCreated(payload);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "failed to create intent";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void createIntent();
        }}
        disabled={loading}
        style={buttonStyle}
      >
        {loading ? "Creating..." : "Create Payment Intent"}
      </button>
      {error ? <p style={{ color: "#d33", marginTop: 8 }}>{error}</p> : null}
    </div>
  );
}

const buttonStyle: CSSProperties = {
  border: "none",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  padding: "12px 16px",
  cursor: "pointer"
};
