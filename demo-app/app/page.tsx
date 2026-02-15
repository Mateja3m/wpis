"use client";

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import type { CreateIntentInput, PaymentIntent, PaymentStatus } from "@wpis/core";
import { QRCodeSVG } from "qrcode.react";

const verifierUrl = process.env.NEXT_PUBLIC_VERIFIER_URL ?? "http://localhost:4000";
const networkCaip2 = process.env.NEXT_PUBLIC_CHAIN_ID ?? "eip155:421614";

type AssetType = "native" | "erc20";

interface CreatedIntentPayload {
  intent: PaymentIntent;
  paymentRequest: {
    paymentLink: string;
    qrPayload: string;
    instructions: string[];
    expiresAt: string;
  };
}

type BackendStatus = "checking" | "connected" | "disconnected";
const REQUEST_TIMEOUT_MS = 8000;
const VERIFY_TIMEOUT_MS = 30000;
const usDateTimeFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

async function fetchWithTimeout(input: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  if (timeoutMs <= 0) {
    return fetch(input, init);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function formatUsDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return usDateTimeFormatter.format(date);
}

function generateReference(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `dev-playground-${crypto.randomUUID()}`;
  }
  return `dev-playground-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export default function Page(): ReactElement {
  const [recipient, setRecipient] = useState("0x1111111111111111111111111111111111111111");
  const [assetType, setAssetType] = useState<AssetType>("native");
  const [contractAddress, setContractAddress] = useState("0xaf88d065e77c8cC2239327C5EDb3A432268e5831");
  const [amount, setAmount] = useState("1000000000000000");

  const [created, setCreated] = useState<CreatedIntentPayload | null>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [confirmations, setConfirmations] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [creating, setCreating] = useState(false);
  const verifyRequestInFlight = useRef(false);

  const intentInput = useMemo<CreateIntentInput>(() => {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    return {
      recipient,
      amount,
      reference: "dev-playground-placeholder",
      expiresAt,
      chainId: networkCaip2,
      asset:
        assetType === "native"
          ? { symbol: "ETH", decimals: 18, type: "native" }
          : { symbol: "USDC", decimals: 6, type: "erc20", contractAddress },
      confirmationPolicy: { minConfirmations: 2 }
    };
  }, [amount, assetType, contractAddress, networkCaip2, recipient]);

  useEffect(() => {
    if (!open || !created?.intent.id) {
      return;
    }

    const poll = async (): Promise<void> => {
      if (verifyRequestInFlight.current) {
        return;
      }
      verifyRequestInFlight.current = true;
      try {
        const response = await fetchWithTimeout(`${verifierUrl}/intents/${created.intent.id}/verify`, { method: "POST" }, VERIFY_TIMEOUT_MS);
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { status: PaymentStatus; confirmations?: number };
        setStatus(payload.status);
        setConfirmations(payload.confirmations ?? null);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setBackendStatus("disconnected");
      } finally {
        verifyRequestInFlight.current = false;
      }
    };

    const handle = setInterval(() => {
      void poll();
    }, 5000);

    void poll();

    return () => {
      clearInterval(handle);
    };
  }, [created?.intent.id, open]);

  useEffect(() => {
    const checkBackend = async (): Promise<void> => {
      try {
        await fetchWithTimeout(`${verifierUrl}/health`, { cache: "no-store" });
        setBackendStatus("connected");
      } catch {
        setBackendStatus("disconnected");
      }
    };

    void checkBackend();
    const handle = setInterval(() => {
      void checkBackend();
    }, 10_000);

    return () => {
      clearInterval(handle);
    };
  }, []);

  const createIntent = async (): Promise<void> => {
    setCreating(true);
    setError(null);
    try {
      const response = await fetchWithTimeout(`${verifierUrl}/intents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...intentInput,
          reference: generateReference()
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Failed to create intent");
        return;
      }

      const payload = (await response.json()) as CreatedIntentPayload;
      setCreated(payload);
      setStatus(payload.intent.status);
      setConfirmations(null);
      setOpen(true);
      setBackendStatus("connected");
    } catch {
      setBackendStatus("disconnected");
      setError("Verifier API is unreachable. Check that http://localhost:4000/health is online.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", background: "#f4f6f8", py: 6, px: 2 }}>
      <Paper elevation={0} sx={{ maxWidth: 760, mx: "auto", p: 4, border: "1px solid #d9e1e8" }}>
        <Typography variant="h4" gutterBottom>
          Developer Playground - Reference Implementation
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          WPIS Arbitrum One payment intent infrastructure primitive. This UI is for protocol/tooling validation, not checkout UX.
        </Typography>
        <Alert severity={backendStatus === "connected" ? "success" : backendStatus === "checking" ? "info" : "warning"} sx={{ mb: 3 }}>
          Verifier backend:{" "}
          {backendStatus === "connected"
            ? `Connected (${verifierUrl})`
            : backendStatus === "checking"
              ? `Checking (${verifierUrl}/health)`
              : `Disconnected (${verifierUrl})`}
        </Alert>

        <Stack spacing={2.5}>
          <TextField
            label="Recipient"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            fullWidth
            size="small"
          />

          <FormControl size="small" fullWidth>
            <InputLabel id="asset-type-label">Asset type</InputLabel>
            <Select
              labelId="asset-type-label"
              value={assetType}
              label="Asset type"
              onChange={(event) => setAssetType(event.target.value as AssetType)}
            >
              <MenuItem value="native">Native (ETH)</MenuItem>
              <MenuItem value="erc20">ERC20</MenuItem>
            </Select>
          </FormControl>

          {assetType === "erc20" ? (
            <TextField
              label="ERC20 contract"
              value={contractAddress}
              onChange={(event) => setContractAddress(event.target.value)}
              fullWidth
              size="small"
            />
          ) : null}

          <TextField
            label="Amount (base units)"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            fullWidth
            size="small"
          />

          <Button
            variant="contained"
            onClick={() => void createIntent()}
            disabled={creating}
            disableElevation
            sx={{
              textTransform: "none",
              borderRadius: 1.5,
              py: 1.25,
              fontWeight: 600,
              letterSpacing: 0.2,
              backgroundColor: "#1f2937",
              "&:hover": { backgroundColor: "#111827" },
              "&.Mui-disabled": {
                backgroundColor: "#d1d5db",
                color: "#374151"
              }
            }}
          >
            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
              {creating ? <CircularProgress size={16} color="inherit" /> : null}
              {creating ? "Creating intent..." : "Create intent"}
            </Box>
          </Button>

          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Intent Verification Monitor</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5}>
            {created ? (
              <>
                <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
                  <QRCodeSVG value={created.paymentRequest.qrPayload} size={180} />
                </Box>

                <Typography variant="body2">
                  State: <strong>{status ?? created.intent.status}</strong>
                </Typography>
                <Typography variant="body2">Confirmations: {confirmations ?? "N/A"}</Typography>
                <Typography variant="body2">Expires at: {formatUsDateTime(created.intent.expiresAt)}</Typography>

                <Accordion disableGutters>
                  <AccordionSummary>
                    <Typography variant="subtitle2">Technical Details</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={1.5}>
                      <Typography variant="caption" color="text.secondary">
                        Intent JSON
                      </Typography>
                      <Box
                        component="pre"
                        sx={{
                          m: 0,
                          p: 1.5,
                          fontSize: 12,
                          border: "1px solid #d9e1e8",
                          background: "#f8fafc",
                          overflowX: "auto"
                        }}
                      >
                        {JSON.stringify(created.intent, null, 2)}
                      </Box>
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              </>
            ) : null}
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
