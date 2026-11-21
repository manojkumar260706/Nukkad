# Nukkad - Real-Time Retail Storefront

A real-time online retail platform built on Aiven for PostgreSQL, Apache Kafka, and OpenSearch.

Theme: Retail & E-commerce: Build the Online Store  
Team: LastMinute | College: Atria Institute of Technology

---

## Architecture Overview

Nukkad addresses catalogue and physical shelf drift by connecting customer orders, inventory updates, and product search via an event-driven architecture.

1. **Anti-Oversell Guarantee:** PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) ensure two customers cannot purchase the last physical unit.
2. **Transactional Outbox Pattern:** Stock holds, counter sales, payment confirmations and stock releases persist their events in the same transaction as their database changes.
3. **Event Streaming:** Apache Kafka streams `order.held`, `order.placed` and `inventory.restocked` events to asynchronous consumer workers.
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
- `POST /api/orders`: Authenticated checkout, atomic stock hold, and Razorpay Test Mode link.
- `GET /api/customer/orders`: Orders and fulfilment status for the signed-in customer.
- `POST /api/customer/orders/:id/payment`: Verify payment status or cancel an unpaid checkout.
- `POST /api/inventory/counter-sale`: Store-scoped counter sale against the same stock as online checkout.
- `PUT /api/inventory/stock`: Direct inventory count override by storekeeper.
- `PUT /api/orders/:id/status`: Update order dispatch state.
- `POST /api/auth/register`: Customer account registration.
- `POST /api/auth/login`: User login with role enforcement.
- `POST /api/simulate-race`: Private, merchant-only counter sale versus online checkout simulation.
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
The API server starts on `http://localhost:5001`.

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

For a private demo with the demo flags enabled:

- **Customer Account:** `shopper@nukkad.in` / `shopper123`
- **Storekeeper Account:** `store@nukkad.in` / `store123`

Both login views feature a single-click auto-fill option for testing.

## Checkout and fulfilment demo

1. Configure the database, Kafka and OpenSearch in `backend/.env`. Start with the seeded catalogue and merchant account on a demo database. The server applies the additive order migration on startup.
2. Set `RAZORPAY_KEY_ID` to a Razorpay Test Mode key ID and `RAZORPAY_KEY_SECRET` to its secret in the backend environment. Use `npm run dev` in both projects. Test Mode uses hosted Payment Links and does not move money.
3. For a private demo database, set `ENABLE_DEMO_ACCOUNTS=true` in `backend/.env` and `VITE_ENABLE_DEMO_ACCOUNTS=true` in `frontend/.env` to use the seeded customer and merchant accounts. Use private accounts and a unique `JWT_SECRET` on a shared deployment. Merchant accounts are provisioned by the administrator.
4. Sign in as a shopper. Choose pickup or local delivery. The demo serves the shop's own PIN code and adds ₹30 for delivery. Select **Continue to payment** to open Razorpay directly. After paying, return to **My orders** and select **Check payment** or wait for the next refresh.
5. In the merchant dashboard, use **Record counter sale** to sell one unit at the counter. To demo the last unit, set available stock to one and attempt to reserve and record the counter sale in separate tabs. Either path uses PostgreSQL's same locked stock row.
6. A paid pickup moves through **Preparing**, **Ready for pickup**, and **Collected**. The customer sees a two-hour collection window once the order is ready and presents their six-digit code to the merchant. Paid delivery moves through **Preparing**, **Out for delivery**, and **Delivered**.
7. Unpaid checkouts have a 20-minute hold. Cancel in **My orders** to test stock release without waiting. The backend checks Razorpay before releasing a payment hold. Merchant cancellation of a confirmed paid order restores stock and marks the payment **Refund pending** for manual handling.

The backend polls Razorpay while checkout is pending. Verify payment, cancellation, and stock release with your Test Mode account before the demo.

## Checkout demos and filtered search

Open **Database changes** in the merchant dashboard to see committed PostgreSQL changes from real actions. Customer order cards include **Database history**. Each entry shows the row and its before/after values. Entries start when the migration is applied. With both private demo flags enabled, **Run a checkout demo** exercises the checkout services on dedicated inventory and shows the committed rows. The demo uses simulated gateway responses and does not contact Razorpay.

Storefront search accepts phrases such as `earphones under 2k` and `rice at most ₹500`. Search uses the current catalogue. The manual price bounds, category, stock availability and price sort combine with the typed query.

### Three-device last-item demo

Deploy the Vite frontend on Vercel using the `frontend` directory. Deploy the long-running backend separately and set `VITE_API_BASE_URL` in Vercel to its HTTPS origin. Configure the backend with the same Aiven services used by the merchant dashboard and Razorpay Test Mode keys. Keep the seeded-demo account flags off on a public deployment. Use individual accounts and a private demo store or database.

1. Build and run the Xcode app on your phone with the same backend URL. See the iPhone app setup below.
2. On a second laptop, sign in to the same deployed site as another shopper. Add the same test product to both carts.
3. On the merchant laptop, select the same store, set the available stock of that product to 1, and open **Database changes**. Use a product with no outstanding holds.
4. Both shoppers tap **Continue to payment**. The backend locks the same inventory row. The winner receives a Razorpay link and the other shopper sees **Out of stock**. Complete the winning test payment. The merchant feed shows **Available stock 1 → 0** and then **Payment status → Paid**.

### iPhone app setup

1. From the repository root, run `npm ci --prefix frontend`, then `sh ios/build-storefront.sh`.
2. Open `ios/Nukkad.xcodeproj` in Xcode.
3. In **Signing & Capabilities**, select your Apple development team. Select your iPhone as the run destination and press **Run**.

The script bundles the storefront in the app and points it at the live Render API. To use a different backend, run `NUKKAD_API_URL=https://your-api.example.com sh ios/build-storefront.sh`. Vercel is optional. Rebuild the bundle and reinstall the app after frontend changes. The app still needs internet access for the API and Razorpay.

### Shopping-list pickup

The shopper can open **Plan a shopping list**, use GPS or type a locality, city, address or PIN, and compare baskets. GPS uses active stores within 10 km of the reported point. A typed match uses a matching store with coordinates as an approximate starting point when available. Without a known point, matching locations remain visible with distance unavailable.

Store-specific listings own price, name, unit, listing state, and available stock. Unlisting keeps historical orders and reservations. The list planner prices from PostgreSQL. Travel and extra-stop weights rank options and are not added to the amount payable. The split planner checks up to 12 nearby stores, comparing pairs and triples against current available quantities.

#### Run locally

1. In two terminals at the repository root, run `npm ci --prefix backend` and `npm ci --prefix frontend`.
2. For a fresh config, run `cp -n backend/.env.example backend/.env`. Set `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, and `PG_DATABASE`. Set `PG_SSL=false` for a local PostgreSQL instance without TLS. For the pickup-only walkthrough on a local database, set `KAFKA_ENABLED=false` and `OPENSEARCH_ENABLED=false`. For the original online checkout, use your Razorpay Test Mode keys and your existing Aiven settings.
3. Start the backend with `npm run dev --prefix backend`. Startup applies additive migrations. Start the frontend with `npm run dev --prefix frontend` and open the URL printed by Vite. Its default API proxy points to port 5001.
4. Run `TEST_DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:5432/DATABASE npm --prefix backend test` using a local PostgreSQL database where the user can create schemas. The integration test creates and removes its own schema. Without the variable, only the planner unit tests run.
5. For the iPhone app, rebuild its web assets with `NUKKAD_API_URL=https://YOUR-HTTPS-API sh ios/build-storefront.sh` and reinstall from Xcode. The default URL still targets the previously deployed API. Use an HTTPS API running this version to exercise the new features on iPhone.

#### Demo Lane walkthrough

1. Visit **Merchant sign in → Create a merchant account and store** in separate browser profiles for **Milk Shop** and **Bread Shop**. Give each the locality and address **Demo Lane**, city **Bengaluru**, PIN **560095**, and example demo coordinates **12.93, 77.62**. Sign up two separate shopper accounts.
2. Under **Shelf Stock Manager → Manage listings → Add a listing**, create Milk (carton, ₹40, quantity 2) in Milk Shop and Bread (loaf, ₹30, quantity 1) in Bread Shop. Keep both listed.
3. As a shopper, open **Plan a shopping list**, type `2 milk and bread` and `Demo Lane`, then click **Compare baskets**. Each single store shows a missing item and the complete split shows ₹110. Reserve the split.
4. Keep the shopper’s **My orders** open while each merchant opens **Incoming Orders**. Accept the Milk request, mark it ready, then collect it with the shopper’s six-digit code. Reject Bread or cancel it from My orders. Bread returns to available stock once. Collected Milk remains deducted.
5. To show the last-unit race, compare `bread` as both shoppers while one loaf is available, then submit both reservations. One succeeds. The test also covers price-change rollback, retrying the same request key, and cross-store order access.

#### Shopping chatbot and Buy from store

Set `XAI_API_KEY`, `XAI_MODEL` (defaults to `grok-4.3`), and `SARVAM_API_KEY` in the backend environment. Sign in as a shopper, open **Plan a shopping list**, enter your location or use GPS, and send a message. English mode sends the message directly to Grok. Automatic detection and the other language modes translate the message with Sarvam AI first. Enter an ordinary shopping list when the assistant is unavailable.

With Razorpay Test Mode configured, choose **Buy from [store]**, enter your phone number, and complete that store's payment for pickup. Return to the planner and choose **Check payment** before buying from the next store. **Cancel checkout** releases an unpaid hold through the existing checkout flow. **Reserve and pay at pickup** remains available as a separate option.
