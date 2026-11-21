# Nukkad · Every shelf, live online.
> **A real-time online store for retail chains and kirana shops, built on PostgreSQL, Kafka, and OpenSearch on Aiven.**  
> *Theme: Retail & E-commerce: Build the Online Store*  
> *Team: LastMinute | College: Atria Institute of Technology*

---

## 🌟 The Vision
Physical shelves and online catalogues frequently drift apart, causing phantom inventory, overselling, and customer disappointment. **Nukkad** solves this at the database, event streaming, and search layers:
1. **Never Oversell:** PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) ensure two customers can never buy the last physical item.
2. **Reliable by Design:** The **Transactional Outbox Pattern** saves the order and the outbox event row in *one atomic database transaction*. No lost events, no double-counts.
3. **Event-Driven Sync:** Apache Kafka streams `order.placed` and `inventory.changed` events to consumers that update real-time projections and search documents.
4. **Search that Forgives:** OpenSearch with Hinglish and typo synonyms (`"bluetoth"` ➔ Bluetooth, `"atta"` / `"gehu"` ➔ Wheat flour, `"chawal"` ➔ Basmati rice) with store-level filtering.
5. **Live Kirana Dashboard:** Real-time stock counters, low-stock alerts, and an interactive **Kafka Event Feed** terminal stream via Server-Sent Events (SSE).

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      NUKKAD FRONTEND                        │
│   • Customer Storefront (/)   • Kirana Tablet (/store)      │
└──────────────┬──────────────────────────────▲───────────────┘
               │ HTTP REST                    │ Live SSE Stream
               ▼                              │
┌──────────────────────────────┐              │
│       Node.js / Express      │              │
│          REST API            │              │
└──────┬───────────────┬───────┘              │
       │               │                      │
       │ (1) Atomic    │ (Search queries)     │
       │     Order TX  │                      │
       ▼               ▼                      │
┌──────────────┐ ┌──────────────┐             │
│   Aiven for  │ │   Aiven for  │◄────────────┼──────────┐
│  PostgreSQL  │ │  OpenSearch  │             │          │
│              │ │ (Fuzzy, Syn) │             │          │
│ • Orders     │ └──────────────┘             │          │
│ • Inventory  │                              │          │
│ • Outbox Tab │                              │          │
└──────┬───────┘                              │          │
       │ (2) Outbox Relay                     │          │
       ▼                                      │          │
┌───────────────────────────────────────────┐ │          │
│             Aiven for Apache Kafka        │ │          │
│ Topics: store.orders | store.inventory    │ │          │
└──────┬────────────────────────────┬───────┘ │          │
       │ (3) Consume                │ (3) Consume        │
       ▼                            ▼                    │
┌───────────────────────┐  ┌─────────────────────────┐  │
│ Consumer: Inventory   │  │ Consumer: Search Sync   ├───┘
│ Projections & Alerts  │  │ Updates OpenSearch Doc  │
└───────────────────────┘  └─────────────────────────┘
```

---

## ⚡ The 3 Aiven Services in Action

| Service | Role in Nukkad | Real Implementation |
|---|---|---|
| **Aiven for PostgreSQL 18.7** | Primary ACID database | Atomic transactions with `SELECT ... FOR UPDATE` row locks, Order + Outbox committed together. |
| **Aiven for Apache Kafka** | Event Backbone | Topics `store.orders` and `store.inventory` with SASL SCRAM-SHA-256 + SSL CA authentication. Reliable outbox relay worker. |
| **Aiven for OpenSearch 3.6.0** | Typo-tolerant search engine | Custom synonym analyzer (`atta`, `gehu`, `chawal`, `bluetoth`) + store-level localized inventory filters. |

---

## 🚀 Running Locally

### Prerequisites
- Node.js v20+ and npm
- Valid Aiven service credentials (already pre-configured in `backend/.env`)

### 1. Start the Backend
```bash
cd backend
npm install
npm run dev
```
Backend runs on **`http://localhost:5000`** with live connections to Aiven PostgreSQL, Kafka, and OpenSearch.

### 2. Start the Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on **`http://localhost:3000`**.

---

## 🚢 Deployment Guide

### Frontend Deployment (Vercel)
1. Push code to your GitHub repository.
2. In [Vercel](https://vercel.com), click **Add New Project** and select the repository.
3. Set **Root Directory** to `frontend`.
4. In **Environment Variables**, set:
   - `VITE_API_BASE_URL`: URL of your deployed backend (e.g. `https://nukkad-api.onrender.com`).
5. Click **Deploy**. Vercel will build and serve your frontend with SSL globally.

### Backend Deployment (Render or Railway)
1. In [Render](https://render.com), click **New Web Service** and select the repository.
2. Set **Root Directory** to `backend`.
3. Set **Build Command**: `npm install && npm run build`
4. Set **Start Command**: `npm start`
5. In **Environment Variables**, paste the contents of `backend/.env` (including `ca.pem` certificate content or path).
6. Click **Deploy**. Render will host the REST API, Kafka consumers, and SSE stream.

---

## 🏆 Hackathon Demo Script (How to Present)

1. **The Storefront:** Open `http://localhost:3000`. Show the Koramangala store header and clean editorial design.
2. **Search that Forgives:**
   - Type `"bluetoth"` into the search bar. OpenSearch returns Bluetooth Neckband and Earphones instantly despite the typo.
   - Click `"gehu"` or `"atta"`. OpenSearch synonym analyzer returns Wheat Atta.
3. **Cart & Atomic Checkout:** Add Atta and Toor Dal to cart. Click **View Cart**, select **Delivery**, and click **Place Order**. Show confetti and order placed badge.
4. **The Kirana Tablet & Kafka Event Feed:** Switch to the **Storekeeper Tablet** tab. Show:
   - Orders Today incremented.
   - **Kafka Event Feed** terminal showing real-time `order.placed`, `inventory.changed`, and `search.synced` events.
   - Click **+5 Restock** on an item: watch Kafka publish `inventory.restocked` and update OpenSearch without page reloads.
5. **The Showstopper (Anti-Oversell Battle Test):**
   - Click **Race Condition Demo** in the top bar.
   - Click **Fire Concurrency Battle Now**: Two parallel checkouts race for 1 single stock unit.
   - Show that Buyer 1 gets the order, while Buyer 2 receives an immediate ACID rejection. Prove **zero overselling**!

---

*Built with passion for retail chains and kirana shops across India.*
