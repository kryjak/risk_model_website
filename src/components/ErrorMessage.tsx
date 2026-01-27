import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="bg-red-50 border border-safer-red/20 rounded-lg p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-safer-red flex-shrink-0" />
        <div className="flex-1">
          <h3 className="font-medium text-safer-charcoal mb-1">
            Error Loading Data
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            {message}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-safer-charcoal hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
