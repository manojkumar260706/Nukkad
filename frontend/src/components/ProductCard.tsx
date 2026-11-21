import React from 'react';
import { Product } from '../types';
import { Plus, Minus } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  cartQuantity: number;
  onAddToCart: (product: Product) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  cartQuantity,
  onAddToCart,
  onUpdateQuantity
}) => {
  const isOutOfStock = product.stock <= 0;
  const isLowStock = product.stock > 0 && product.stock <= product.low_stock_threshold;
  const discountPercent = product.mrp > product.price
    ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
    : 0;

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden hover:border-nukkad-400 hover:shadow-md transition-all flex flex-col justify-between group">
      {/* Product Image & Badges */}
      <div className="relative p-4 pb-0 bg-stone-50/60 flex items-center justify-center min-h-[160px]">
        <img
          src={product.image_url}
          alt={product.name}
          className="h-32 w-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-200"
          loading="lazy"
        />

        {/* Unit badge (top right) */}
        <span className="absolute top-2.5 right-2.5 bg-white/90 backdrop-blur-xs border border-stone-200 text-stone-700 text-[11px] font-mono font-medium px-2 py-0.5 rounded-md shadow-xs">
          {product.unit}
        </span>

        {/* Stock Status Badge (top left) */}
        <div className="absolute top-2.5 left-2.5">
          {isOutOfStock ? (
            <span className="bg-stone-200 text-stone-700 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full tracking-wider">
              Out of stock
            </span>
          ) : isLowStock ? (
            <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse"></span>
              Only {product.stock} left
            </span>
          ) : (
            <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-semibold px-2 py-0.5 rounded-full">
              In stock ({product.stock})
            </span>
          )}
        </div>
      </div>

      {/* Product Information */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="text-[11px] font-medium text-stone-500 uppercase tracking-wider mb-0.5">
            {product.brand}
          </div>
          <h3 className="font-semibold text-stone-900 text-sm leading-snug line-clamp-2">
            {product.name}
          </h3>
          {product.store_name && <p className="mt-1 text-xs font-medium text-nukkad-800">{product.store_name}</p>}
          <p className="text-[11px] text-stone-500 line-clamp-1 mt-1">
            {product.description}
          </p>
        </div>

        {/* Price & Action Row */}
        <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-nukkad-950 font-sans">
                ₹{product.price}
              </span>
              {product.mrp > product.price && (
                <span className="text-xs text-stone-400 line-through">
                  ₹{product.mrp}
                </span>
              )}
            </div>
            {discountPercent > 0 && (
              <span className="text-[10px] font-bold text-emerald-700">
                {discountPercent}% OFF
              </span>
            )}
          </div>

          {/* Stepper or Add Button */}
          {isOutOfStock ? (
            <button
              disabled
              className="px-3 py-1.5 bg-stone-100 text-stone-400 rounded-lg text-xs font-medium cursor-not-allowed"
            >
              Sold out
            </button>
          ) : cartQuantity > 0 ? (
            <div className="flex items-center gap-2 bg-nukkad-800 text-white rounded-lg px-2 py-1 shadow-xs">
              <button
                onClick={() => onUpdateQuantity(product.product_id, cartQuantity - 1)}
                className="hover:text-emerald-200 transition-colors p-0.5"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-xs font-bold w-4 text-center">
                {cartQuantity}
              </span>
              <button
                onClick={() => onUpdateQuantity(product.product_id, cartQuantity + 1)}
                disabled={cartQuantity >= product.stock}
                className="hover:text-emerald-200 disabled:opacity-40 transition-colors p-0.5"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => onAddToCart(product)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cream hover:bg-nukkad-800 text-nukkad-900 hover:text-white border border-stone-300 hover:border-nukkad-800 text-xs font-semibold transition-all active:scale-95 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
