import React from 'react';
import { Search, Mic, X } from 'lucide-react';
import { Category } from '../types';

interface SearchBarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  categories: Category[];
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  isSearching: boolean;
  onSearchSubmit: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  setSearchQuery,
  categories,
  selectedCategory,
  setSelectedCategory,
  isSearching,
  onSearchSubmit
}) => {
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
            placeholder="Search atta, rice, oil, amul milk, tea, earphones..."
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

        {/* Clean Category Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pt-0.5 no-scrollbar">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-nukkad-900 text-white shadow-2xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900'
            }`}
          >
            All Items
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                selectedCategory === cat.id
                  ? 'bg-nukkad-900 text-white shadow-2xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
