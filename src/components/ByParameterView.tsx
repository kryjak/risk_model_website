import { useState, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronDown, BarChart3, Info } from 'lucide-react';
import type { RiskModelsIndex, ParameterEstimate, RationaleNode } from '../types';
import type { SplitModelData } from '../hooks/useModelData';
import { formatValue } from '../utils/formatters';

interface ByParameterViewProps {
  index: RiskModelsIndex;
  loadedModels: Map<string, SplitModelData>;
  onShowDistribution: (estimate: ParameterEstimate) => void;
  onLoadModel: (modelId: string) => Promise<void>;
}

interface TreeNode {
  id: string;
  label: string;
  parameterName: string | null;
  children: TreeNode[];
  depth: number;
}

function buildTree(loadedModels: Map<string, SplitModelData>): TreeNode[] {
  const allNodes = new Map<string, RationaleNode>();
  const techniquesByTactic = new Map<string, Set<string>>();
  const tacticIdToName = new Map<string, string>();

  loadedModels.forEach(({ rationales }) => {
    if (!rationales) return;
    for (const node of rationales.nodes) {
      if (node.nodeType === 'probability') continue;
      if (!allNodes.has(node.name)) {
        allNodes.set(node.name, node);
      }
      if (node.parentTactic) {
        const tacticNode = rationales.nodes.find(n => n.id === node.parentTactic);
        if (tacticNode) {
          tacticIdToName.set(node.parentTactic, tacticNode.name);
          if (!techniquesByTactic.has(tacticNode.name)) {
            techniquesByTactic.set(tacticNode.name, new Set());
          }
          techniquesByTactic.get(tacticNode.name)!.add(node.name);
        }
      }
    }
  });

  const topLevelQuantity: TreeNode[] = [];
  const tactics: TreeNode[] = [];
  const impactChildren: TreeNode[] = [];

  for (const [name, node] of allNodes) {
    if (node.parentTactic) continue;

    if (node.nodeType === 'quantity') {
      const unit = node.unit || '';
      if (unit.includes('$')) {
        impactChildren.push({ id: `impact-${name}`, label: name, parameterName: name, children: [], depth: 2 });
      } else if (name !== 'Successful Attack Rate') {
        topLevelQuantity.push({ id: `top-${name}`, label: name, parameterName: name, children: [], depth: 0 });
      }
    } else if (node.nodeType === 'continuous') {
      const techniques = techniquesByTactic.get(name);
      const techChildren: TreeNode[] = [];
      if (techniques) {
        for (const techName of Array.from(techniques).sort()) {
          techChildren.push({ id: `tech-${techName}`, label: techName, parameterName: techName, children: [], depth: 2 });
        }
      }
      tactics.push({ id: `tactic-${name}`, label: name, parameterName: name, children: techChildren, depth: 1 });
    }
  }

  const tacticOrder = [
    'Reconnaissance', 'Resource Development', 'Initial Access',
    'Execution', 'Persistence', 'Privilege Escalation',
    'Defense Evasion', 'Credential Access', 'Discovery',
    'Lateral Movement', 'Collection', 'Command and Control',
    'Exfiltration', 'Impact',
  ];
  tactics.sort((a, b) => {
    const ai = tacticOrder.indexOf(a.label);
    const bi = tacticOrder.indexOf(b.label);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const tree: TreeNode[] = [
    ...topLevelQuantity.sort((a, b) => a.label.localeCompare(b.label)),
    {
      id: 'group-psuccess',
      label: 'P(Success)',
      parameterName: 'Successful Attack Rate',
      children: tactics,
      depth: 0,
    },
    {
      id: 'group-impact',
      label: 'Impact (Financial)',
      parameterName: null,
      children: impactChildren.sort((a, b) => a.label.localeCompare(b.label)),
      depth: 0,
    },
  ];

  return tree;
}

function TreeNodeItem({
  node,
  selectedParameter,
  expandedNodes,
  onSelect,
  onToggle,
  depth,
}: {
  node: TreeNode;
  selectedParameter: string | null;
  expandedNodes: Set<string>;
  onSelect: (paramName: string) => void;
  onToggle: (nodeId: string) => void;
  depth: number;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = node.parameterName !== null && node.parameterName === selectedParameter;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1.5 px-2 rounded-md transition-colors group ${
          isSelected
            ? 'bg-safer-blue/10 text-safer-blue font-medium'
            : 'hover:bg-gray-50'
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
            className="p-0.5 rounded hover:bg-gray-200 transition-colors flex-shrink-0"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded
              ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
          </button>
        ) : (
          <span className="w-4.5 flex-shrink-0" />
        )}

        {node.parameterName ? (
          <button
            onClick={() => onSelect(node.parameterName!)}
            className={`text-sm text-left truncate flex-1 ${
              isSelected ? 'text-safer-blue font-medium' : 'text-safer-charcoal hover:text-safer-blue'
            }`}
            title={node.label}
          >
            {node.label}
          </button>
        ) : (
          <span className="text-sm text-gray-500 italic truncate flex-1" title={node.label}>
            {node.label}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              selectedParameter={selectedParameter}
              expandedNodes={expandedNodes}
              onSelect={onSelect}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ByParameterView({
  index,
  loadedModels,
  onShowDistribution,
  onLoadModel,
}: ByParameterViewProps) {
  const [selectedParameter, setSelectedParameter] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['group-psuccess']));

  const tree = useMemo(() => buildTree(loadedModels), [loadedModels]);

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const parameterData = useMemo(() => {
    if (!selectedParameter) return [];

    const data: Array<{
      modelId: string;
      modelName: string;
      estimate: ParameterEstimate;
      isGranular: boolean;
    }> = [];

    loadedModels.forEach(({ rationales, percentiles, samples }, modelId) => {
      if (!rationales || !percentiles) return;

      const node = rationales.nodes.find((n) => n.name === selectedParameter);
      if (!node) return;

      const pctls = percentiles.nodes[node.id];
      if (!pctls) return;

      const hasSamples = !!(samples.baseline && samples.sota && samples.saturated);
      const baselineSamples = hasSamples ? (samples.baseline!.samples[node.id] || []) : [];
      const sotaSamples = hasSamples ? (samples.sota!.samples[node.id] || []) : [];
      const saturatedSamples = hasSamples ? (samples.saturated!.samples[node.id] || []) : [];

      const modelEntry = index.models.find((m) => m.id === modelId);

      const hasTechniqueChildren = rationales.nodes.some(
        (n) => n.parentTactic === node.id
      );

      data.push({
        modelId,
        modelName: modelEntry?.name || modelId,
        isGranular: hasTechniqueChildren,
        estimate: {
          nodeId: node.id,
          name: node.name,
          nodeType: node.nodeType,
          unit: node.unit,
          baseline: pctls.baseline,
          sota: pctls.sota,
          saturated: pctls.saturated,
          baselineSamples,
          sotaSamples,
          saturatedSamples,
          baselineRationale: node.baselineRationale || '',
          sotaRationale: node.sotaRationale || '',
          saturatedRationale: node.saturatedRationale || '',
          samplesAvailable: hasSamples,
        },
      });
    });

    return data;
  }, [selectedParameter, loadedModels, index]);

  const isTacticWithTechniques = useMemo(() => {
    if (!selectedParameter) return false;
    for (const [, { rationales }] of loadedModels) {
      if (!rationales) continue;
      const node = rationales.nodes.find((n) => n.name === selectedParameter);
      if (node) {
        const hasTech = rationales.nodes.some((n) => n.parentTactic === node.id);
        if (hasTech) return true;
      }
    }
    return false;
  }, [selectedParameter, loadedModels]);

  const format = (value: number, estimate: ParameterEstimate) => {
    if (estimate.nodeType === 'continuous') {
      return formatValue(value, undefined, 'continuous');
    }
    return formatValue(value, estimate.unit, estimate.nodeType);
  };

  const unloadedModels = index.models.filter((m) => !loadedModels.has(m.id));

  return (
    <div className="space-y-6">
      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Tree Selector */}
        <div className="card lg:w-72 flex-shrink-0">
          <h3 className="text-sm font-medium text-safer-charcoal uppercase tracking-wide mb-3">
            Parameters
          </h3>
          <div className="space-y-0.5 max-h-[60vh] overflow-y-auto -mx-2">
            {tree.map((node) => (
              <TreeNodeItem
                key={node.id}
                node={node}
                selectedParameter={selectedParameter}
                expandedNodes={expandedNodes}
                onSelect={setSelectedParameter}
                onToggle={toggleNode}
                depth={0}
              />
            ))}
          </div>

          {unloadedModels.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm font-medium text-safer-charcoal mb-2.5">Load more models</p>
              <div className="flex flex-wrap gap-2">
                {unloadedModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => onLoadModel(model.id)}
                    className="px-3 py-1.5 text-sm font-medium bg-safer-blue/10 text-safer-blue border border-safer-blue/20 rounded-lg hover:bg-safer-blue/20 hover:border-safer-blue/40 transition-colors"
                  >
                    {model.id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Comparison Table */}
        <div className="flex-1 min-w-0">
          {selectedParameter && parameterData.length > 0 && (
            <div className="card overflow-hidden">
              <h3 className="text-lg font-serif font-medium text-safer-charcoal mb-4 px-2">
                {selectedParameter} — Cross-Model Comparison
              </h3>

              {isTacticWithTechniques && (
                <div className="flex items-start gap-2 px-2 mb-4 p-3 bg-safer-blue/5 rounded-lg text-sm text-gray-600">
                  <Info className="w-4 h-4 text-safer-blue flex-shrink-0 mt-0.5" />
                  <p>
                    Some models evaluate this factor at a more granular level (individual
                    techniques). In those cases, the tactic-level estimate shown here is a
                    composite. Expand the tree node above to view technique-level estimates.
                  </p>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-safer-grey border-b border-gray-100">
                      <th rowSpan={2} className="text-left py-2 px-3 font-medium text-safer-charcoal align-bottom">
                        Risk Model
                      </th>
                      <th colSpan={3} className="text-center py-1.5 px-1 font-semibold text-safer-blue border-b border-safer-blue/20">
                        Baseline
                      </th>
                      <th colSpan={3} className="text-center py-1.5 px-1 font-semibold text-safer-purple border-b border-safer-purple/20">
                        SOTA
                      </th>
                      <th colSpan={3} className="text-center py-1.5 px-1 font-semibold text-safer-teal border-b border-safer-teal/20">
                        Saturated
                      </th>
                      <th rowSpan={2} className="text-center py-2 px-2 font-medium text-safer-charcoal align-bottom w-10">
                        Dist.
                      </th>
                    </tr>
                    <tr className="bg-safer-grey border-b border-gray-200">
                      <th className="text-right py-1.5 px-2 text-xs font-medium text-safer-blue/70">5th %</th>
                      <th className="text-right py-1.5 px-2 text-xs font-medium text-safer-blue/70">Mode</th>
                      <th className="text-right py-1.5 px-2 text-xs font-medium text-safer-blue/70">95th %</th>
                      <th className="text-right py-1.5 px-2 text-xs font-medium text-safer-purple/70">5th %</th>
                      <th className="text-right py-1.5 px-2 text-xs font-medium text-safer-purple/70">Mode</th>
                      <th className="text-right py-1.5 px-2 text-xs font-medium text-safer-purple/70">95th %</th>
                      <th className="text-right py-1.5 px-2 text-xs font-medium text-safer-teal/70">5th %</th>
                      <th className="text-right py-1.5 px-2 text-xs font-medium text-safer-teal/70">Mode</th>
                      <th className="text-right py-1.5 px-2 text-xs font-medium text-safer-teal/70">95th %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parameterData.map(({ modelId, modelName, estimate }) => (
                      <tr
                        key={modelId}
                        className="border-b border-gray-100 hover:bg-safer-grey/50 transition-colors"
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-safer-charcoal">{modelId}</div>
                          <div className="text-gray-400 text-xs truncate max-w-[160px]" title={modelName}>
                            {modelName}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right text-safer-blue">
                          {format(estimate.baseline.p5, estimate)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-safer-blue font-medium">
                          {format(estimate.baseline.p50, estimate)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-safer-blue">
                          {format(estimate.baseline.p95, estimate)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-safer-purple">
                          {format(estimate.sota.p5, estimate)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-safer-purple font-medium">
                          {format(estimate.sota.p50, estimate)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-safer-purple">
                          {format(estimate.sota.p95, estimate)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-safer-teal">
                          {format(estimate.saturated.p5, estimate)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-safer-teal font-medium">
                          {format(estimate.saturated.p50, estimate)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-safer-teal">
                          {format(estimate.saturated.p95, estimate)}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          {estimate.samplesAvailable && (
                            <button
                              onClick={() => onShowDistribution(estimate)}
                              className="p-1.5 hover:bg-safer-blue/10 rounded-lg transition-colors"
                              aria-label={`Show distribution for ${modelId}`}
                              title="View distribution"
                            >
                              <BarChart3 className="w-4 h-4 text-safer-blue" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedParameter && parameterData.length === 0 && (
            <div className="card text-center py-8">
              <p className="text-gray-500">
                No data available for "{selectedParameter}" in loaded models.
              </p>
            </div>
          )}

          {!selectedParameter && (
            <div className="card text-center py-12">
              <p className="text-gray-500">
                Select a parameter from the tree to compare values across risk models.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
