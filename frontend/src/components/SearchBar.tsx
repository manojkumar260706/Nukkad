import React, { useState } from 'react';
import { Search, Mic, X, SlidersHorizontal } from 'lucide-react';
import { Category } from '../types';

export interface SearchFilters {
  minPrice: string;
  maxPrice: string;
  inStockOnly: boolean;
  sort: '' | 'price-asc' | 'price-desc';
}

export const defaultSearchFilters: SearchFilters = { minPrice: '', maxPrice: '', inStockOnly: false, sort: '' };

interface SearchBarProps {
  filters: SearchFilters;
  setFilters: (filters: SearchFilters) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  categories: Category[];
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  isSearching: boolean;
  onSearchSubmit: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  filters,
  setFilters,
  searchQuery,
  setSearchQuery,
  categories,
  selectedCategory,
  setSelectedCategory,
  isSearching,
  onSearchSubmit
}) => {
  const [showFilters, setShowFilters] = useState(false);
  const [draft, setDraft] = useState(defaultSearchFilters);
  const [draftCategory, setDraftCategory] = useState('all');
  const filterCount = [filters.minPrice !== '', filters.maxPrice !== '', filters.inStockOnly,
    filters.sort !== '', selectedCategory !== 'all'].filter(Boolean).length;

  // Voice search using Web Speech API
  const handleVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice search is not supported in this browser. Try Chrome/Edge.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const speechText = event.results[0][0].transcript;
      setSearchQuery(speechText);
    };
    recognition.start();
  };

  return (
    <div className="w-full bg-white border-b border-stone-200 py-3.5 px-4 sm:px-6 shadow-2xs">
      <div className="max-w-7xl mx-auto space-y-3">
        {/* Clean, Focused Search Input */}
        <div className="relative flex items-center">
          <div className="absolute left-4 text-stone-400 pointer-events-none">
            <Search className={`w-4 h-4 ${isSearching ? 'animate-spin text-nukkad-600' : ''}`} />
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearchSubmit()}
            placeholder="Try “earphones under 2k”"
            className="w-full pl-11 pr-20 py-2.5 bg-chalk border border-stone-300 rounded-xl text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-nukkad-700/20 focus:border-nukkad-700 transition-all font-sans"
          />

          <div className="absolute right-3 flex items-center gap-1">
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-1 rounded-full hover:bg-stone-200 text-stone-400 hover:text-stone-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={handleVoiceSearch}
              title="Voice Search"
              className="p-1.5 rounded-lg text-stone-500 hover:text-nukkad-800 hover:bg-nukkad-50 transition-colors"
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-expanded={showFilters} aria-controls="product-filters"
          className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold"
          onClick={() => {
            if (!showFilters) {
              setDraft(filters);
              setDraftCategory(selectedCategory);
            }
            setShowFilters(!showFilters);
          }}>
          <SlidersHorizontal className="h-4 w-4" /> Filters {filterCount > 0 && `(${filterCount})`}
        </button>

          <div aria-label="Browse categories" className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
            {[{ id: 'all', name: 'All' }, ...categories].map(category =>
              <button key={category.id} type="button" aria-pressed={selectedCategory === category.id} onClick={() => {
                setSelectedCategory(category.id);
                setDraftCategory(category.id);
              }} className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${selectedCategory === category.id
                ? 'border-nukkad-900 bg-nukkad-900 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-nukkad-600'}`}>
                {category.name}
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <form id="product-filters" className="grid gap-4 rounded-xl border border-stone-200 bg-stone-50 p-4"
            onSubmit={event => {
              event.preventDefault();
              setFilters(draft);
              setSelectedCategory(draftCategory);
              setShowFilters(false);
            }}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-sm">Category
                <select className="rounded-lg border bg-white p-2" value={draftCategory} onChange={event => setDraftCategory(event.target.value)}>
                  <option value="all">All categories</option>
                  {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">Minimum price (₹)
                <input className="min-w-0 rounded-lg border p-2" type="number" min="0" step="0.01" value={draft.minPrice}
                  onChange={event => setDraft({ ...draft, minPrice: event.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">Maximum price (₹)
                <input className="min-w-0 rounded-lg border p-2" type="number" min={draft.minPrice || '0'} step="0.01" value={draft.maxPrice}
                  onChange={event => setDraft({ ...draft, maxPrice: event.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">Sort by
                <select className="rounded-lg border bg-white p-2" value={draft.sort}
                  onChange={event => setDraft({ ...draft, sort: event.target.value as SearchFilters['sort'] })}>
                  <option value="">Recommended</option>
                  <option value="price-asc">Price low to high</option>
                  <option value="price-desc">Price high to low</option>
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.inStockOnly}
                onChange={event => setDraft({ ...draft, inStockOnly: event.target.checked })} /> In stock only
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <button type="submit" className="rounded-lg bg-nukkad-900 px-4 py-2 text-sm font-semibold text-white">Apply filters</button>
              <button type="button" className="text-sm underline" onClick={() => {
                setDraft(defaultSearchFilters);
                setDraftCategory('all');
              }}>Clear selection</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
