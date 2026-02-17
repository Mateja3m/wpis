# @wpis/react

Minimal React UI primitives for WPIS integrations.

## Components
- `PaymentButton`: creates intent via verifier API.
- `PaymentModal`: shows QR/instructions and polls status.

## Main Props
`PaymentButton`
- `verifierUrl`
- `input`
- `onCreated`

`PaymentModal`
- `isOpen`
- `verifierUrl`
- `intent`
- `paymentRequest`
- `onClose`

## Usage
See demo reference implementation:
- `demo-app/app/page.tsx`
