export function Header() {
  return (
    <header className="bg-safer-charcoal text-white py-4 px-6 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center gap-4">
        <img 
          src="/images/SaferAI_Logo_White_RGB.svg" 
          alt="SaferAI" 
          className="h-10 w-auto"
        />
        <div className="border-l border-white/20 pl-4">
          <h1 className="text-xl font-sans font-medium tracking-tight">
            Risk Dashboard
          </h1>
          <p className="text-xs text-gray-300 font-sans">
            Quantitative risk modeling for AI cyber threats
          </p>
        </div>
      </div>
    </header>
  );
}
