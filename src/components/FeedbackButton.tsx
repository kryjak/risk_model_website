import { MessageSquare } from 'lucide-react';

const FEEDBACK_URL = 'https://forms.gle/rGr99QezryNVrnyH7';

export function FeedbackButton() {
  return (
    <a
      href={FEEDBACK_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-center gap-1.5 bg-safer-purple text-white px-2.5 py-3 rounded-l-lg shadow-lg hover:bg-safer-purple/90 transition-colors origin-right hover:scale-105 transform"
      title="Send us feedback"
    >
      <MessageSquare className="w-4 h-4" />
      <span className="text-xs font-medium tracking-wide [writing-mode:vertical-lr] rotate-180">
        Feedback
      </span>
    </a>
  );
}
