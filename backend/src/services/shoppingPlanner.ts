import { pool } from '../config/db';

export interface Location {
  latitude: number;
  longitude: number;
}
interface Store {
  id: string;
  name: string;
  address: string;
  locality: string;
  city: string;
  pin: string | null;
  latitude: number | null;
  longitude: number | null;
}
export type NearbyStore = Store & { distance: number | null };
export interface ListItem { name: string; quantity: number }
export interface Listing {
  storeId: string;
  productId: string;
  name: string;
  catalogName: string;
  unit: string;
  price: number;
  stock: number;
  synonyms: string[];
}
export interface BasketItem { productId: string; name: string; unit: string; quantity: number; expectedPrice: number }
export interface Basket { store: NearbyStore; items: BasketItem[] }
export interface Plan { baskets: Basket[]; missing: ListItem[]; units: number; basketPrice: number; distance: number | null; score: number }

function normalize(text: string) {
  return text.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function singular(word: string) {
  if (word === 'loaves') return 'loaf';
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  return word.length > 3 && /[^s]s$/.test(word) ? word.slice(0, -1) : word;
}

function phrase(text: string) {
  return normalize(text).split(' ').map(singular).join(' ');
}

export function parseShoppingList(text: string): ListItem[] {
  const items = new Map<string, number>();
  for (const part of text.split(/[,;\n]+|\band\b|\s+\+\s+/i)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const leading = trimmed.match(/^(\d+)\s*(?:x\s+|\s+)(.+)$/i);
    const quantity = leading ? Number(leading[1]) : 1;
    const name = phrase((leading?.[2] ?? trimmed).replace(/^(?:loaves?|cartons?|bottles?|packs?|pieces?|units?|bags?)\s+of\s+/i, ''));
    if (!name || !quantity || quantity > 999) throw new Error('Enter between 1 and 999 units for each item.');
    items.set(name, (items.get(name) ?? 0) + quantity);
  }
  if (!items.size || items.size > 25 || [...items.values()].some(quantity => quantity > 999)) {
    throw new Error('Enter 1–25 different items with up to 999 units each.');
  }
  return [...items].map(([name, quantity]) => ({ name, quantity }));
}

export function straightLineKm(a: Location, b: Location) {
  const rad = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * rad;
  const lon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(lon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export async function nearbyStores(typed = '', gps?: Location) {
  const { rows } = await pool.query<Store>('SELECT id,name,address,locality,city,pin,latitude,longitude FROM stores WHERE is_active IS TRUE ORDER BY name,id');
  const measure = (origin: Location) => rows.flatMap(store => {
    if (store.latitude === null || store.longitude === null) return [];
    const distance = straightLineKm(origin, { latitude: store.latitude, longitude: store.longitude });
    return distance <= 10 ? [{ ...store, distance }] : [];
  }).sort((a, b) => a.distance - b.distance);
  if (gps) {
    const close = measure(gps);
    if (close.length) return close;
  }
  const text = normalize(typed);
  if (!text) return [];
  const matches = rows.filter(store => {
    const fields = [store.name, store.locality, store.city, store.pin, store.address].map(field => normalize(field ?? ''));
    return fields.some(field => field.includes(text)) ||
      text.split(' ').every(word => fields.some(field => field.includes(word)));
  });
  const anchor = matches.find(store => store.latitude !== null && store.longitude !== null &&
    [store.address, store.pin, store.locality, store.name].some(field => normalize(field ?? '') === text));
  if (!anchor) return matches.map(store => ({ ...store, distance: null }));
  const close: NearbyStore[] = measure({ latitude: anchor.latitude!, longitude: anchor.longitude! });
  return close.concat(matches.filter(store => store.latitude === null || store.longitude === null)
    .map(store => ({ ...store, distance: null })));
}

function matches(item: ListItem, listing: Listing) {
  return [listing.name, listing.catalogName, ...listing.synonyms].some(value => {
    const normalized = phrase(value);
    return ` ${normalized} `.includes(` ${item.name} `);
  });
}

interface Edge { to: number; reverse: number; capacity: number; cost: number }

// A minimum-cost maximum flow allocates each stock unit at most once, including overlapping aliases.
export function allocate(items: ListItem[], stores: NearbyStore[], listings: Listing[]): Plan {
  const source = 0;
  const firstListing = 1 + items.length;
  const sink = firstListing + listings.length;
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => []);
  const addEdge = (from: number, to: number, capacity: number, cost = 0) => {
    const edge = { to, reverse: graph[to].length, capacity, cost };
    graph[to].push({ to: from, reverse: graph[from].length, capacity: 0, cost: -cost });
    graph[from].push(edge);
    return edge;
  };

  const demand = items.map((item, i) => addEdge(source, i + 1, item.quantity));
  const allocations: { listing: Listing; edge: Edge }[] = [];
  listings.forEach((listing, i) => {
    const node = firstListing + i;
    addEdge(node, sink, listing.stock, Math.round(listing.price * 100));
    items.forEach((item, j) => {
      if (matches(item, listing)) allocations.push({ listing, edge: addEdge(j + 1, node, item.quantity) });
    });
  });

  let units = 0;
  for (;;) {
    const distances = graph.map(() => Infinity);
    const previous = graph.map(() => -1);
    const used: (Edge | undefined)[] = graph.map(() => undefined);
    const queue = [source];
    const queued = new Set(queue);
    distances[source] = 0;
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i];
      queued.delete(node);
      for (const edge of graph[node]) {
        const distance = distances[node] + edge.cost;
        if (edge.capacity <= 0 || distance >= distances[edge.to]) continue;
        distances[edge.to] = distance;
        previous[edge.to] = node;
        used[edge.to] = edge;
        if (!queued.has(edge.to)) {
          queue.push(edge.to);
          queued.add(edge.to);
        }
      }
    }
    if (!used[sink]) break;
    let quantity = Infinity;
    for (let node = sink; node !== source; node = previous[node]) quantity = Math.min(quantity, used[node]!.capacity);
    for (let node = sink; node !== source; node = previous[node]) {
      const edge = used[node]!;
      edge.capacity -= quantity;
      graph[node][edge.reverse].capacity += quantity;
    }
    units += quantity;
  }

  const baskets = stores.map(store => ({ store, items: new Map<string, BasketItem>() }));
  const basketByStore = new Map(baskets.map(basket => [basket.store.id, basket.items]));
  let paise = 0;
  for (const { listing, edge } of allocations) {
    const quantity = graph[edge.to][edge.reverse].capacity;
    if (!quantity) continue;
    const basket = basketByStore.get(listing.storeId)!;
    const existing = basket.get(listing.productId);
    basket.set(listing.productId, {
      productId: listing.productId, name: listing.name, unit: listing.unit, expectedPrice: listing.price,
      quantity: quantity + (existing?.quantity ?? 0)
    });
    paise += quantity * Math.round(listing.price * 100);
  }
  const stops = baskets.filter(basket => basket.items.size || stores.length === 1)
    .map(basket => ({ store: basket.store, items: [...basket.items.values()] }));
  const knownDistance = stops.reduce((sum, { store }) => sum + (store.distance ?? 0), 0);
  const distance = stops.length && stops.every(({ store }) => store.distance !== null) ? knownDistance : null;
  const basketPrice = paise / 100;
  return {
    baskets: stops, units, basketPrice, distance,
    missing: items.flatMap((item, i) => demand[i].capacity ? [{ name: item.name, quantity: demand[i].capacity }] : []),
    score: basketPrice + 8 * knownDistance + 25 * Math.max(0, stops.length - 1)
  };
}

export function recommend(items: ListItem[], stores: NearbyStore[], listings: Listing[]) {
  const byStore = new Map(stores.map(store => [store.id, listings.filter(listing =>
    listing.storeId === store.id && listing.stock > 0 && items.some(item => matches(item, listing)))]));
  const plan = (selection: NearbyStore[]) => allocate(items, selection, selection.flatMap(store => byStore.get(store.id)!));
  const compare = (a: Plan, b: Plan) => a.missing.length - b.missing.length || b.units - a.units || a.score - b.score;
  const singles = stores.map(store => plan([store])).sort(compare);
  let split: Plan | null = null;
  const candidates = stores.filter(store => byStore.get(store.id)!.length).slice(0, 12);
  const consider = (selection: NearbyStore[]) => {
    const candidate = plan(selection);
    if (!candidate.missing.length && candidate.baskets.length > 1 && (!split || compare(candidate, split) < 0)) split = candidate;
  };
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      consider([candidates[i], candidates[j]]);
      for (let k = j + 1; k < candidates.length; k++) consider([candidates[i], candidates[j], candidates[k]]);
    }
  }
  return { singles, split, unmatched: items.filter(item => !listings.some(listing => matches(item, listing))) };
}

export async function planShoppingList(text: string, typed: string, gps?: Location) {
  const items = parseShoppingList(text);
  const stores = await nearbyStores(typed, gps);
  const { rows } = await pool.query<Listing>(`
    SELECT si.store_id AS "storeId", p.id AS "productId", p.name AS "catalogName",
      COALESCE(si.listing_name,p.name) AS name, COALESCE(si.listing_unit,p.unit) AS unit,
      COALESCE(si.listing_price,p.price)::float8 AS price, si.stock, COALESCE(p.synonyms,'{}') AS synonyms
    FROM store_inventory si JOIN products p ON p.id=si.product_id
    WHERE si.listed AND si.store_id=ANY($1::text[]) ORDER BY si.store_id,p.id
  `, [stores.map(store => store.id)]);
  return { stores, items, ...recommend(items, stores, rows) };
}
