import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronRight, Check, X as XIcon } from 'lucide-react';
import type { AttackStep } from '../types';

const markdownComponents = {
  a: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
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
  p: ({ children }: React.ComponentProps<'p'>) => <span>{children}</span>,
};

interface AttackStepsSectionProps {
  steps: AttackStep[];
}

function StepRow({ step }: { step: AttackStep }) {
  const [expanded, setExpanded] = useState(false);
  const hasExpandableContent = step.included && (step.breakdown || step.breakdownRationale || (step.techniques && step.techniques.length > 0));

  return (
    <>
      <tr className="border-b border-gray-100">
        {/* Step name — only this cell is clickable for expand/collapse */}
        <td
          className={`py-3 px-4 font-medium text-safer-charcoal align-top ${hasExpandableContent ? 'cursor-pointer hover:bg-gray-50' : ''}`}
          onClick={() => hasExpandableContent && setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            {hasExpandableContent && (
              expanded
                ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            )}
            {!hasExpandableContent && <span className="w-4 flex-shrink-0" />}
            {step.step}
          </div>
        </td>

        {/* Included badge */}
        <td className="py-3 px-4 align-top">
          {step.included ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium bg-green-50 text-green-700">
              <Check className="w-3.5 h-3.5" /> Yes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium bg-red-50 text-red-700">
              <XIcon className="w-3.5 h-3.5" /> No
            </span>
          )}
        </td>

        {/* Description — rendered as markdown for clickable links */}
        <td className="py-3 px-4 text-sm text-gray-600 align-top leading-relaxed">
          {step.description
            ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{step.description}</ReactMarkdown>
            : '—'}
        </td>

        {/* Failure mode — rendered as markdown for clickable links */}
        <td className="py-3 px-4 text-sm text-gray-600 align-top leading-relaxed">
          {step.failureMode
            ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{step.failureMode}</ReactMarkdown>
            : '—'}
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && hasExpandableContent && (
        <tr className="border-b border-gray-100 bg-gray-50/50">
          <td colSpan={4} className="px-4 py-3">
            <div className="ml-6 space-y-2">
              {step.breakdown && (
                <div className="flex items-start gap-2 text-sm">
                  <span className="font-medium text-safer-charcoal whitespace-nowrap">Breakdown:</span>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    step.breakdown === 'technique'
                      ? 'bg-safer-light-purple text-safer-purple'
                      : 'bg-blue-50 text-blue-700'
                  }`}>
                    {step.breakdown === 'technique' ? 'Technique level' : 'Tactic level'}
                  </span>
                </div>
              )}
              {step.breakdownRationale && (
                <div className="text-sm">
                  <span className="font-medium text-safer-charcoal">Rationale: </span>
                  <span className="text-gray-600 leading-relaxed">{step.breakdownRationale}</span>
                </div>
              )}
              {step.techniques && step.techniques.length > 0 && (
                <div className="text-sm">
                  <span className="font-medium text-safer-charcoal">Techniques: </span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {step.techniques.map((tech, i) => (
                      <span
                        key={i}
                        className="inline-block px-2 py-0.5 rounded-full text-xs bg-safer-light-purple text-safer-purple"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function AttackStepsSection({ steps }: AttackStepsSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  if (steps.length === 0) return null;

  return (
    <div className="card">
      <button
        className="w-full flex items-center justify-start gap-2"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <ChevronRight
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '' : 'rotate-90'}`}
        />
        <h3 className="text-xl font-serif font-medium text-safer-charcoal">
          Tactic and Technique Selection
        </h3>
      </button>

      {!isCollapsed && (
        <div className="mt-4 overflow-x-auto">
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            This table summarises which MITRE ATT&CK tactics are included in the scenario
            and whether they are estimated at the tactic or technique level. Click on an
            included step to see the breakdown rationale and relevant techniques.
          </p>
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[8%]" />
              <col className="w-[42%]" />
              <col className="w-[35%]" />
            </colgroup>
            <thead>
              <tr className="border-b-2 border-safer-charcoal/10">
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wide text-gray-500">
                  Step
                </th>
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wide text-gray-500">
                  Included
                </th>
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wide text-gray-500">
                  Description
                </th>
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wide text-gray-500">
                  Failure Mode
                </th>
              </tr>
            </thead>
            <tbody className="table-zebra">
              {steps.map((step, idx) => (
                <StepRow key={idx} step={step} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
