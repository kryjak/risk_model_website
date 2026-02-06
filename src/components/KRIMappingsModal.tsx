import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { BenchmarkMappings } from '../types';

interface KRIMappingsModalProps {
  mappings: BenchmarkMappings;
  isOpen: boolean;
  onClose: () => void;
}

export function KRIMappingsModal({ mappings, isOpen, onClose }: KRIMappingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const benchmarkEntries = Object.entries(mappings);

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kri-modal-title"
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id="kri-modal-title" className="text-xl font-serif font-medium text-safer-charcoal">
            KRI / Benchmark Mappings
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 p-6 overflow-auto">
          {benchmarkEntries.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-gray-500">No benchmark mappings available for this model.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-safer-charcoal/10">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wide text-gray-500 font-medium">
                    Benchmark / KRI
                  </th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wide text-gray-500 font-medium">
                    Mapped Parameters
                  </th>
                </tr>
              </thead>
              <tbody className="table-zebra">
                {benchmarkEntries.map(([benchmark, parameters]) => (
                  <tr key={benchmark} className="border-b border-gray-100">
                    <td className="py-3 px-4 font-medium text-safer-charcoal align-top">
                      {benchmark}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1.5">
                        {parameters.map((param) => (
                          <span
                            key={param}
                            className="inline-block px-2 py-0.5 rounded-full text-xs bg-safer-light-purple text-safer-purple"
                          >
                            {param}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
