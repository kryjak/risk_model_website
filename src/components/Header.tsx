import { ArrowLeft } from 'lucide-react';

interface HeaderProps {
  showBack?: boolean;
  onBack?: () => void;
}

export function Header({ showBack, onBack }: HeaderProps) {
  return (
    <header className="bg-safer-charcoal text-white py-4 px-6 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center gap-4">
        {showBack && onBack && (
          <button
            onClick={onBack}
            className="p-1.5 -ml-1.5 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <a
          href="https://www.safer-ai.org/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="SaferAI website"
        >
          <img
            src="/images/SaferAI_Logo_White_RGB.svg"
            alt="SaferAI"
            className="h-10 w-auto"
          />
        </a>
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
