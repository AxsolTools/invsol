import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { APP_LOGO } from "@/const";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00D9FF]/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#8B5CF6]/5 rounded-full blur-[120px] pointer-events-none"></div>
      
      {/* Grid overlay */}
      <div className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 217, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 217, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px'
        }}
      ></div>

      <div className="relative z-10 text-center max-w-lg">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#00D9FF]/20 to-[#8B5CF6]/20 blur-2xl rounded-full scale-150"></div>
            <img 
              src={APP_LOGO} 
              alt="INVSOL" 
              className="w-24 h-24 rounded-2xl relative z-10 border border-[#1a1a2e] opacity-50"
            />
          </div>
        </div>

        {/* 404 Text */}
        <div className="relative mb-8">
          <h1 
            className="text-[120px] md:text-[180px] font-black leading-none gradient-text opacity-20"
            style={{ fontFamily: "'Orbitron', sans-serif" }}
          >
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <h2 
              className="text-4xl md:text-5xl font-bold text-white tracking-wider"
              style={{ fontFamily: "'Orbitron', sans-serif" }}
            >
              VOID <span className="text-[#00D9FF]">FOUND</span>
            </h2>
          </div>
        </div>

        {/* Description */}
        <p className="text-gray-500 mb-8 leading-relaxed max-w-md mx-auto">
          This location doesn't exist in our network. The page you're looking for has vanished into the void—or never existed.
        </p>

        {/* Glitch decoration */}
        <div className="flex justify-center gap-2 mb-8">
          {[...Array(5)].map((_, i) => (
            <div 
              key={i}
              className="w-2 h-2 rounded-full"
              style={{
                background: i % 2 === 0 ? '#00D9FF' : '#8B5CF6',
                opacity: 0.3 + (i * 0.15),
                animation: `pulse ${1 + i * 0.2}s ease-in-out infinite alternate`
              }}
            ></div>
          ))}
        </div>

        {/* CTA Button */}
        <Button
          onClick={handleGoHome}
          className="px-8 py-4 h-auto text-base font-bold tracking-wider bg-gradient-to-r from-[#00D9FF] to-[#0099b3] hover:from-[#00e5ff] hover:to-[#00b3cc] text-black shadow-lg shadow-[#00D9FF]/20 hover:shadow-[#00D9FF]/40 transition-all duration-300"
          style={{ fontFamily: "'Orbitron', sans-serif" }}
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          RETURN HOME
        </Button>

        {/* Footer text */}
        <p className="text-xs text-gray-700 mt-12 tracking-widest uppercase" style={{ fontFamily: "'Orbitron', sans-serif" }}>
          INV<span className="text-[#00D9FF]/50">SOL</span> • Invisible Solutions
        </p>
      </div>
    </div>
  );
}
