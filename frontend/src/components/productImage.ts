import type { Product } from '../types';

const sampleImages: Record<string, string> = {
  bread: '/catalog/wheat-bread.jpg',
  milk: '/catalog/fresh-milk.jpg',
  'checkout demo item': '/nukkad-192.png',
  'ultra flash deal (concurrency demo)': '/nukkad-192.png'
};

export function productImage(product: Pick<Product, 'image_url' | 'name'>): string | undefined {
  const name = product.name.trim().toLowerCase();
  if (name === 'ultra flash deal (concurrency demo)') return sampleImages[name];
  const url = product.image_url?.trim();
  return url ? url.replace(/^(\/catalog\/[a-z0-9-]+)\.webp$/i, '$1.jpg') : sampleImages[name];
}
