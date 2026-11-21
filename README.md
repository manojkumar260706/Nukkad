# Nukkad - Real-Time Retail Storefront

A real-time online retail platform built on Aiven for PostgreSQL, Apache Kafka, and OpenSearch.

Theme: Retail & E-commerce: Build the Online Store  
Team: LastMinute | College: Atria Institute of Technology

---

## Architecture Overview

Nukkad addresses catalogue and physical shelf drift by connecting customer orders, inventory updates, and product search via an event-driven architecture.

1. **Anti-Oversell Guarantee:** PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) ensure two customers cannot purchase the last physical unit.
2. **Transactional Outbox Pattern:** Order creation and outbox event persistence execute within a single atomic database transaction.
3. **Event Streaming:** Apache Kafka streams `order.placed` and `inventory.restocked` events to asynchronous consumer workers.
4. **Search Synchronization:** OpenSearch indexes products with fuzzy matching and Indian retail synonym analysis, filtered by physical store availability.
5. **Separated Merchant Console:** A dedicated store manager portal provides real-time stock overrides, order status dispatch, and event logging.

```
+-------------------------------------------------------------+
|                      NUKKAD FRONTEND                        |
|   - Customer Storefront (/)   - Merchant Console (/store)   |
+------------------------------+------------------------------+
                               | HTTP REST / SSE Stream
                               v
+-------------------------------------------------------------+
|                     Node.js / Express                       |
|                          REST API                           |
+--------------+-------------------------------+--------------+
               |                               |
               | (1) Atomic Transaction        | (Search)
               v                               v
+------------------------------+ +----------------------------+
|     Aiven for PostgreSQL     | |     Aiven for OpenSearch   |
|   - Orders & Order Items     | |   - Fuzzy & Synonym Search |
|   - Inventory & Stores       | |   - Store-level filtering  |
|   - Users (Bcrypt Auth)      | +----------------------------+
|   - Transactional Outbox     |               ^
+--------------+---------------+               |
               |                               |
               | (2) Outbox Relay              | (4) Sync
               v                               |
+----------------------------------------------+--------------+
|                   Aiven for Apache Kafka                    |
|          Topics: store.orders | store.inventory             |
+--------------+-------------------------------+--------------+
               | (3) Consume                   | (3) Consume
               v                               v
+------------------------------+ +----------------------------+
|  Consumer: Inventory Alerts  | |   Consumer: Search Sync    |
+------------------------------+ +----------------------------+
```

---

## Infrastructure and Technologies

| Component | Technology | Implementation Details |
|---|---|---|
| Database | Aiven for PostgreSQL 18.7 | ACID transactions, row-level locks, transactional outbox table, bcrypt credential storage. |
| Streaming | Aiven for Apache Kafka | SASL SCRAM-SHA-256 with SSL CA validation. Topics: `store.orders`, `store.inventory`. |
| Search | Aiven for OpenSearch 3.6.0 | Typo tolerance (`fuzziness: AUTO`), synonym analyzer (`atta`, `gehu`, `chawal`, `toor dal`, `bluetoth`). |
| Backend | Node.js, Express, TypeScript | REST endpoints, outbox polling relay, KafkaJS consumer group, Server-Sent Events (SSE). |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS | Client-side routing with separate customer and merchant portals, live stock indicators. |

---

## Routing and Endpoints

### Frontend Routes
- `/`: Customer storefront (search, product catalogue, cart, checkout).
- `/login`: Customer sign in and account registration.
- `/store/login`: Store manager and merchant authentication.
- `/store/dashboard`: Merchant console (stock adjustments, order status, event feed).

### Core API Endpoints
- `GET /api/health`: Health status of PostgreSQL, Kafka, and OpenSearch.
- `GET /api/products/search`: Search products via OpenSearch with fuzzy matching and filters.
- `POST /api/orders`: Atomic order checkout transaction with outbox record.
- `PUT /api/inventory/stock`: Direct inventory count override by storekeeper.
- `PUT /api/orders/:id/status`: Update order dispatch state.
- `POST /api/auth/register`: User registration with role assignment.
- `POST /api/auth/login`: User login with role enforcement.
- `POST /api/simulate-race`: Parallel checkout race condition test.
- `GET /api/events/live`: Server-Sent Events stream for real-time Kafka event display.

---

## Local Development

### Prerequisites
- Node.js (version 20 or higher) and npm
- Aiven service credentials (configured in `backend/.env`)

### 1. Backend Service
```bash
cd backend
npm install
npm run dev
```
The API server starts on `http://localhost:5000`.

### 2. Frontend Application
```bash
cd frontend
npm install
npm run dev
```
The client application starts on `http://localhost:3000`.

---

## Deployment Configuration

### Frontend (e.g., Vercel, Netlify)
1. Set repository root to `frontend`.
2. Configure build command: `npm run build`
3. Configure output directory: `dist`
4. Set environment variable: `VITE_API_BASE_URL` pointing to the deployed backend URL.

### Backend (e.g., Render, Railway)
1. Set repository root to `backend`.
2. Configure build command: `npm install && npm run build`
3. Configure start command: `npm start`
4. Set required environment variables from `backend/.env.example`.

---

## Demo Credentials

For evaluation and demonstration purposes:

- **Customer Account:** `shopper@nukkad.in` / `shopper123`
- **Storekeeper Account:** `store@nukkad.in` / `store123`

Both login views feature a single-click auto-fill option for testing.
