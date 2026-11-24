# Miracle Me Backend — Soul

## Purpose
Miracle Me is a spiritual-guidance marketplace backend. Users pay listeners and astrologers for real-time communication through chat, audio calls, and video calls. The backend manages identities, sessions, payments, commissions, and live communication.

## Product Model
- Roles: `user`, `listener`, `astrologer`, `admin`
- Communication: chat, audio call, video call powered by Agora
- Billing: per-second, wallet-based, platform commission deducted before provider payout
- Pre-call: balance validation and affordable-duration calculation

## Non-Negotiables
- All financial mutations must be atomic and idempotent
- Wallet, transaction, and ledger data must never be silently mutated
- Conversation flow is sacred: create → start → end → bill
- No negative balances; cap billing at available balance
- Real-time events through Socket.IO for critical state changes

## This Codebase Wants To Be
- A stable, audit-ready financial backend for creator economy in spiritual services
- Resilient to duplicate webhooks, network failures, and wallet race conditions
- Easy to reason about because money moves predictably
