"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
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

  const intentInput = useMemo<CreateIntentInput>(() => {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    return {
      recipient,
      amount,
      reference: `dev-playground-${Date.now()}`,
      expiresAt,
      chainId: "eip155:42161",
      asset:
        assetType === "native"
          ? { symbol: "ETH", decimals: 18, type: "native" }
          : { symbol: "USDC", decimals: 6, type: "erc20", contractAddress },
      confirmationPolicy: { minConfirmations: 2 }
    };
  }, [amount, assetType, contractAddress, recipient]);

  useEffect(() => {
    if (!open || !created?.intent.id) {
      return;
    }

    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(`${verifierUrl}/intents/${created.intent.id}/verify`, { method: "POST" });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { status: PaymentStatus; confirmations?: number };
        setStatus(payload.status);
        setConfirmations(payload.confirmations ?? null);
      } catch {
        setBackendStatus("disconnected");
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
        const response = await fetch(`${verifierUrl}/health`);
        setBackendStatus(response.ok ? "connected" : "disconnected");
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
    setError(null);
    try {
      const response = await fetch(`${verifierUrl}/intents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intentInput)
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

          <Button variant="contained" onClick={() => void createIntent()}>
            Create Intent
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
                <Typography variant="body2">Expires at: {created.intent.expiresAt}</Typography>

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
