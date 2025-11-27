"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, MapPin, Sparkles, Users, Search } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/spots?search=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push("/spots");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white selection:bg-violet-500/30">
      {/* Hero Section with Background Image */}
      <section className="relative w-full h-screen flex items-center justify-center overflow-hidden">
        {/* Background Image with Overlay */}
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=2070&auto=format&fit=crop')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/90" />
        </div>

        <div className="container relative z-10 px-4 md:px-6 flex flex-col items-center text-center space-y-8">
          <div className="space-y-4 max-w-4xl animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm font-medium backdrop-blur-md mb-4">
              <Sparkles className="mr-2 h-4 w-4 text-violet-400" />
              <span className="text-violet-100">AI-Powered Travel Companion</span>
            </div>
            <h1 className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
              Discover the <br />
              <span className="text-violet-400">Hidden World</span>
            </h1>
            <p className="mx-auto max-w-[700px] text-gray-300 md:text-xl lg:text-2xl font-light leading-relaxed">
              Your local friend in every city. Find trendy alley spots, secret bars, and authentic experiences that guidebooks miss.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
            <Link href="/sign-up" className="flex-1">
              <Button size="lg" className="w-full h-12 rounded-full bg-violet-600 hover:bg-violet-700 text-lg shadow-[0_0_40px_-10px_rgba(124,58,237,0.5)] transition-all hover:scale-105">
                Start Exploring
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/spots" className="flex-1">
              <Button variant="outline" size="lg" className="w-full h-12 rounded-full border-white/20 bg-white/5 hover:bg-white/10 backdrop-blur-sm text-white hover:text-white text-lg transition-all hover:scale-105">
                Discover Spots
              </Button>
            </Link>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce text-white/50">
          <div className="w-6 h-10 rounded-full border-2 border-white/30 flex justify-center p-1">
            <div className="w-1 h-2 bg-white/50 rounded-full" />
          </div>
        </div>
      </section>

      {/* Floating Search Bar Section */}
      <div className="container relative z-20 -mt-8 px-4">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur-xl shadow-2xl hover:shadow-violet-500/20 transition-shadow duration-300">
          <form onSubmit={handleSearch} className="flex items-center gap-3 rounded-xl bg-white/5 px-5 py-4 focus-within:bg-white/10 transition-colors">
            <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Where do you want to go? (e.g. Tokyo, Seoul, Bangkok)"
              className="flex-1 bg-transparent text-lg text-white outline-none placeholder:text-gray-500 focus:placeholder:text-gray-400"
            />
            <Button
              type="submit"
              size="sm"
              className="rounded-lg bg-violet-600 hover:bg-violet-700 text-white px-6 transition-all hover:scale-105 shadow-lg shadow-violet-500/20"
            >
              Search
            </Button>
          </form>
        </div>
      </div>

      {/* Features Section */}
      <section className="w-full py-24 lg:py-32 bg-black relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-violet-900/20 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-indigo-900/20 rounded-full blur-[120px] translate-x-1/2 translate-y-1/2" />

        <div className="container px-4 md:px-6 relative z-10 max-w-7xl mx-auto">
          <div className="grid gap-8 lg:grid-cols-3 place-items-center lg:place-items-stretch">
            <div className="group relative rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all duration-300 hover:bg-white/10 hover:border-violet-500/30 hover:-translate-y-2 hover:shadow-2xl hover:shadow-violet-500/10 cursor-pointer">
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-400 group-hover:bg-violet-500/30 group-hover:scale-110 transition-all duration-300">
                <Sparkles className="h-8 w-8" />
              </div>
              <h2 className="mb-4 text-2xl font-bold text-white group-hover:text-violet-300 transition-colors">Hidden Gems</h2>
              <p className="text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors">
                Escape the tourist traps. Our AI analyzes millions of data points to find the secret spots where locals actually hang out.
              </p>
            </div>

            <div className="group relative rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all duration-300 hover:bg-white/10 hover:border-indigo-500/30 hover:-translate-y-2 hover:shadow-2xl hover:shadow-indigo-500/10 cursor-pointer">
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-400 group-hover:bg-indigo-500/30 group-hover:scale-110 transition-all duration-300">
                <Users className="h-8 w-8" />
              </div>
              <h2 className="mb-4 text-2xl font-bold text-white group-hover:text-indigo-300 transition-colors">Community Verified</h2>
              <p className="text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors">
                Real-time vibe checks. Know if a spot is &quot;chill&quot;, &quot;packed&quot;, or &quot;trending&quot; before you even leave your hotel.
              </p>
            </div>

            <div className="group relative rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all duration-300 hover:bg-white/10 hover:border-pink-500/30 hover:-translate-y-2 hover:shadow-2xl hover:shadow-pink-500/10 cursor-pointer">
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-pink-500/20 text-pink-400 group-hover:bg-pink-500/30 group-hover:scale-110 transition-all duration-300">
                <MapPin className="h-8 w-8" />
              </div>
              <h2 className="mb-4 text-2xl font-bold text-white group-hover:text-pink-300 transition-colors">Smart Itineraries</h2>
              <p className="text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors">
                Get a perfectly curated day plan in seconds. Customized to your vibe, budget, and travel style.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
