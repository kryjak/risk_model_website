import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X } from 'lucide-react';
import type { ScenarioInputSection } from '../types';

interface ScenarioInputsModalProps {
  sections: ScenarioInputSection[];
  isOpen: boolean;
  onClose: () => void;
}

export function ScenarioInputsModal({ sections, isOpen, onClose }: ScenarioInputsModalProps) {
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

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="scenario-inputs-modal-title"
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id="scenario-inputs-modal-title" className="text-xl font-serif font-medium text-safer-charcoal">
            Scenario Inputs
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
          {sections.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-gray-500">No scenario input data available for this model.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {sections.map((section, idx) => (
                <div key={idx}>
                  <h3 className="text-lg font-sans font-bold text-safer-charcoal mb-3">
                    {section.heading}
                  </h3>
                  <div className="text-sm text-gray-600 leading-relaxed">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ children, href, ...props }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-safer-blue underline underline-offset-2 font-medium hover:text-safer-blue/80"
                            {...props}
                          >
                            {children}
                          </a>
                        ),
                        ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5 my-2">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1.5 my-2">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        p: ({ children }) => <p className="mb-2">{children}</p>,
                        strong: ({ children }) => <strong className="font-bold text-safer-charcoal">{children}</strong>,
                        table: ({ children }) => <table className="w-full text-sm border-collapse my-3">{children}</table>,
                        th: ({ children }) => <th className="text-left py-2 px-3 border-b-2 border-gray-200 font-medium text-safer-charcoal">{children}</th>,
                        td: ({ children }) => <td className="py-2 px-3 border-b border-gray-100">{children}</td>,
                      }}
                    >
                      {section.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
