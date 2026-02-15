"use client";

import { useMemo, useState, type ReactElement } from "react";
import { PaymentButton, PaymentModal, type CreatedIntentPayload } from "@wpis/react";
import type { CreateIntentInput } from "@wpis/core";

const verifierUrl = process.env.NEXT_PUBLIC_VERIFIER_URL ?? "http://localhost:4000";

export default function Page(): ReactElement {
  const [recipient, setRecipient] = useState("0x1111111111111111111111111111111111111111");
  const [assetType, setAssetType] = useState<"native" | "erc20">("native");
  const [contractAddress, setContractAddress] = useState("0x2222222222222222222222222222222222222222");
  const [amount, setAmount] = useState("1000000000000000");

  const [created, setCreated] = useState<CreatedIntentPayload | null>(null);
  const [open, setOpen] = useState(false);

  const intentInput = useMemo<CreateIntentInput>(() => {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    return {
      recipient,
      amount,
      reference: `demo-${Date.now()}`,
      expiresAt,
      asset:
        assetType === "native"
          ? { symbol: "ETH", decimals: 18, type: "native" }
          : { symbol: "USDC", decimals: 6, type: "erc20", contractAddress },
      confirmationPolicy: { minConfirmations: 2 }
    };
  }, [amount, assetType, contractAddress, recipient]);

  return (
    <main className="container">
      <h1>WPIS Demo</h1>
      <p>Chain-agnostic payment intent PoC on Optimism.</p>

      <label>
        Recipient
        <input value={recipient} onChange={(event) => setRecipient(event.target.value)} />
      </label>

      <label>
        Asset type
        <select value={assetType} onChange={(event) => setAssetType(event.target.value as "native" | "erc20")}>
          <option value="native">Native (ETH)</option>
          <option value="erc20">ERC20</option>
        </select>
      </label>

      {assetType === "erc20" ? (
        <label>
          ERC20 contract
          <input value={contractAddress} onChange={(event) => setContractAddress(event.target.value)} />
        </label>
      ) : null}

      <label>
        Amount (base units)
        <input value={amount} onChange={(event) => setAmount(event.target.value)} />
      </label>

      <PaymentButton
        verifierUrl={verifierUrl}
        input={intentInput}
        onCreated={(payload) => {
          setCreated(payload);
          setOpen(true);
        }}
      />

      <PaymentModal
        isOpen={open}
        verifierUrl={verifierUrl}
        intent={created?.intent ?? null}
        paymentRequest={created?.paymentRequest ?? null}
        onClose={() => setOpen(false)}
      />
    </main>
  );
}
