import { useState, useEffect } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

const GIPHY_API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY || "Gc7131jiJuvI7IdN0HZ1D7nh0ow5BU6g";

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
}

export function GifPicker({ onSelect }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchTrending = async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20`);
        const data = await res.json();
        if (data.data) {
          setGifs(data.data);
        }
      } catch (err) {
        console.error("Failed to fetch trending GIFs", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTrending();
  }, []);

  useEffect(() => {
    if (!query.trim()) return;
    
    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20`);
        const data = await res.json();
        if (data.data) {
          setGifs(data.data);
        }
      } catch (err) {
        console.error("Failed to search GIFs", err);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  return (
    <div className="flex h-80 flex-col">
      <div className="relative mb-2 px-1">
        <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search GIFs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-full rounded-xl bg-muted pl-9 text-sm"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        {loading && gifs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif.images.original.url)}
                className="relative aspect-square overflow-hidden rounded-lg bg-muted transition-transform hover:scale-95 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <img
                  src={gif.images.fixed_width.url}
                  alt={gif.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-1 text-center text-[10px] text-muted-foreground">
        Powered by GIPHY
      </div>
    </div>
  );
}
