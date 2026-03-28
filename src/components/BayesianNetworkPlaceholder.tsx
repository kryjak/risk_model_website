import { useState, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface BayesianNetworkPlaceholderProps {
  modelId: string;
}

export function BayesianNetworkPlaceholder({ modelId }: BayesianNetworkPlaceholderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  const networkImages: Record<string, string> = {
    'RM1': 'OC1_SME_Phishing_and_BEC_llm_network.png',
    'RM2': 'OC2_Data_Rich_Data_Breach_llm_network.png',
    'RM3': 'OC2_SME_Social_Eng_Initial_Access_Ransom_llm_network.png',
    'RM4': 'OC3_Ransomware_SME_target_llm_network.png',
    'RM4 (human)': 'OC3_Ransomware_SME_target_human_network.png',
    'RM5': 'OC3_Ransomware_Large_enterprise_target_llm_network.png',
    'RM6': 'OC3_Financial_DDoS_llm_network.png',
    'RM7': 'OC4_Infrastructure_small_Disruption_llm_network.png',
    'RM8': 'OC4_Infrastructure_large_Disruption_llm_network.png',
    'RM9': 'OC5_Espionage_Polymorphic_llm_network.png',
  };

  const imagePath = networkImages[modelId];
  const src = imagePath ? `/images/bayesian_networks/${imagePath}` : null;

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setZoom(1);
  }, []);

  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, closeModal]);

  const zoomIn = () => setZoom(z => Math.min(z + 0.25, 5));
  const zoomOut = () => setZoom(z => Math.max(z - 0.25, 0.25));
  const resetZoom = () => setZoom(1);

  return (
    <>
      <div className="card">
        <h3 className="text-xl font-serif font-medium text-safer-charcoal mb-4">
          Bayesian Network Structure
        </h3>
        <div
          data-network-container
          className="flex items-center justify-center rounded-lg border border-gray-300 bg-white"
          style={{ minHeight: '400px' }}
        >
          {src ? (
            <div className="relative w-full group cursor-zoom-in" onClick={() => setIsModalOpen(true)}>
              <img
                src={src}
                alt={`Bayesian network for ${modelId}`}
                className="max-w-full h-auto rounded-lg"
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 rounded-lg">
                <span className="bg-white/90 text-safer-charcoal text-sm font-medium px-3 py-1.5 rounded-full shadow">
                  🔍 Click to view full resolution
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center px-6">
              <svg className="mx-auto mb-3 w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
                />
              </svg>
              <p className="text-gray-400 text-sm">
                Network visualization will be inserted here
              </p>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && src && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 cursor-zoom-out"
          onClick={closeModal}
        >
          <div
            className="relative max-w-[95vw] max-h-[95vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              className="absolute -top-3 -right-3 z-10 bg-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg text-safer-charcoal hover:bg-gray-100 transition-colors text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>

            <div
              className="cursor-pointer"
              onClick={closeModal}
            >
              <img
                src={src}
                alt={`Bayesian network for ${modelId}`}
                className="rounded-lg shadow-2xl transition-transform duration-150 origin-center"
                style={{
                  transform: `scale(${zoom})`,
                  maxWidth: zoom <= 1 ? '95vw' : 'none',
                  maxHeight: zoom <= 1 ? '95vh' : 'none',
                  objectFit: 'contain',
                }}
              />
            </div>

            {/* Zoom controls — bottom-right corner */}
            <div
              className="fixed bottom-6 right-6 flex items-center gap-1 bg-white/95 backdrop-blur rounded-lg shadow-lg p-1 z-20"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={zoomOut}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-30"
                disabled={zoom <= 0.25}
                aria-label="Zoom out"
                title="Zoom out"
              >
                <ZoomOut className="w-5 h-5 text-safer-charcoal" />
              </button>
              <button
                onClick={resetZoom}
                className="px-2 py-1 text-sm font-medium text-safer-charcoal hover:bg-gray-100 rounded-md transition-colors min-w-[3.5rem] text-center"
                title="Reset zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={zoomIn}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-30"
                disabled={zoom >= 5}
                aria-label="Zoom in"
                title="Zoom in"
              >
                <ZoomIn className="w-5 h-5 text-safer-charcoal" />
              </button>
              <div className="w-px h-6 bg-gray-200 mx-0.5" />
              <button
                onClick={resetZoom}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                aria-label="Reset zoom"
                title="Reset to fit"
              >
                <RotateCcw className="w-4 h-4 text-safer-charcoal" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
