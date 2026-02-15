import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { PaymentIntent, PaymentStatus } from "@wpis/core";

export interface PaymentModalProps {
  isOpen: boolean;
  verifierUrl: string;
  intent: PaymentIntent | null;
  paymentRequest: {
    qrPayload: string;
    instructions: string[];
  } | null;
  onClose: () => void;
}

const terminalStatuses: PaymentStatus[] = ["CONFIRMED", "FAILED", "EXPIRED"];

export function PaymentModal(props: PaymentModalProps): ReactElement | null {
  const { isOpen, verifierUrl, intent, paymentRequest, onClose } = props;
  const [status, setStatus] = useState<PaymentStatus | null>(intent?.status ?? null);
  const [timeline, setTimeline] = useState<PaymentStatus[]>(intent?.status ? [intent.status] : []);

  useEffect(() => {
    setStatus(intent?.status ?? null);
    setTimeline(intent?.status ? [intent.status] : []);
  }, [intent?.id, intent?.status]);

  const isTerminal = useMemo(() => (status ? terminalStatuses.includes(status) : false), [status]);

  useEffect(() => {
    if (!isOpen || !intent || isTerminal) {
      return;
    }

    const poll = async (): Promise<void> => {
      const response = await fetch(`${verifierUrl}/intents/${intent.id}`);
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { status: PaymentStatus };
      setStatus((current) => {
        if (!current || current === payload.status) {
          return payload.status;
        }
        setTimeline((existing) => [...existing, payload.status]);
        return payload.status;
      });
    };

    const handle = setInterval(() => {
      void poll();
    }, 5000);

    void poll();

    return () => {
      clearInterval(handle);
    };
  }, [intent, isOpen, isTerminal, verifierUrl]);

  if (!isOpen || !intent || !paymentRequest) {
    return null;
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0 }}>Payment Intent</h2>
          <button type="button" onClick={onClose} style={buttonStyle}>
            Close
          </button>
        </div>
        <QRCodeSVG value={paymentRequest.qrPayload} size={200} />
        <p style={{ marginBottom: 8 }}>
          Status: <strong>{status ?? "PENDING"}</strong>
        </p>
        <p style={{ marginTop: 0, fontSize: 13, color: "#555" }}>Reference: {intent.reference}</p>
        <ul style={{ paddingLeft: 20 }}>
          {paymentRequest.instructions.map((instruction) => (
            <li key={instruction}>{instruction}</li>
          ))}
        </ul>
        <p style={{ marginBottom: 6, fontWeight: 600 }}>Status transitions</p>
        <p style={{ marginTop: 0, color: "#666" }}>{timeline.join(" -> ")}</p>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50
};

const modalStyle: CSSProperties = {
  width: "min(440px, 92vw)",
  background: "#fff",
  borderRadius: 12,
  padding: 20,
  boxShadow: "0 12px 48px rgba(0,0,0,0.2)"
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 16
};

const buttonStyle: CSSProperties = {
  border: "1px solid #ddd",
  background: "#fff",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer"
};
