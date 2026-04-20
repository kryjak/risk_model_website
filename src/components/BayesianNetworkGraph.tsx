import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Handle,
  Position,
  useInternalNode,
  getStraightPath,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type NodeProps,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Map } from 'lucide-react';
import type {
  NetworkFile,
  NodeType,
  RiskModelIndexEntry,
  DisplayNameOverrides,
  BenchmarkState,
  BenchmarkStatesFile,
  ModelVariant,
} from '../types';

interface BayesianNetworkGraphProps {
  model: RiskModelIndexEntry | null;
  hasKRIMappings?: boolean;
  onShowKRIMappings?: () => void;
}

const X_SCALE = 1.4;
const Y_SCALE = 1.05;
const EDGE_STROKE = '#334155';

// Width rules: probability nodes are wider so benchmark/expert names aren't
// cramped; other nodes fit their text and wrap past MAX_WIDTH.
const PROB_NODE_WIDTH = 380;
const DEFAULT_NODE_MIN_WIDTH = 160;
const DEFAULT_NODE_MAX_WIDTH = 300;

const STRIPE_COLORS: Record<NodeType, string> = {
  continuous: '#2B6CB0',
  quantity: '#700C8C',
  probability: '#2D6A4F',
};

const BAR_FILL = '#2B6CB0';

interface BNNodeData extends Record<string, unknown> {
  label: string;
  unit: string | null;
  nodeType: NodeType;
  states: BenchmarkState[] | null;
}

function StateRow({ state }: { state: BenchmarkState }) {
  const pct = state.probability * 100;
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: 28,
          lineHeight: 1.2,
          color: '#374151',
          gap: 12,
        }}
      >
        <span
          style={{
            // wrap long state names (Expert) across lines instead of truncating
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            fontWeight: 400,
            flex: 1,
            minWidth: 0,
          }}
        >
          {state.name}
        </span>
        <span style={{ fontWeight: 500, color: '#6b7280', flexShrink: 0 }}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: '#e5e7eb',
          borderRadius: 3,
          marginTop: 5,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: BAR_FILL,
          }}
        />
      </div>
    </div>
  );
}

function BNNode({ data }: NodeProps) {
  const d = data as BNNodeData;
  const stripeColor = STRIPE_COLORS[d.nodeType];
  const isProb = d.nodeType === 'probability';
  const widthStyle = isProb
    ? { width: PROB_NODE_WIDTH }
    : {
        minWidth: DEFAULT_NODE_MIN_WIDTH,
        maxWidth: DEFAULT_NODE_MAX_WIDTH,
        width: 'fit-content' as const,
      };
  return (
    <div
      style={{
        ...widthStyle,
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderLeft: `10px solid ${stripeColor}`,
        borderRadius: 8,
        boxShadow: '0 2px 5px rgba(0,0,0,0.08)',
        padding: '16px 18px',
        fontSize: 32,
        fontWeight: 600,
        color: '#111827',
        lineHeight: 1.25,
        textAlign: 'left',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} isConnectable={false} />
      <div style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{d.label}</div>
      {d.unit && (
        <div style={{ marginTop: 8, fontSize: 28, fontWeight: 400, color: '#6b7280' }}>
          {d.unit}
        </div>
      )}
      {d.states && d.states.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {d.states.map(s => (
            <StateRow key={s.name} state={s} />
          ))}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { bn: BNNode };

// --- Floating edge ---

function getNodeIntersection(
  source: InternalNode,
  target: InternalNode,
): { x: number; y: number } {
  const sw = source.measured.width ?? DEFAULT_NODE_MIN_WIDTH;
  const sh = source.measured.height ?? 40;
  const tw = target.measured.width ?? DEFAULT_NODE_MIN_WIDTH;
  const th = target.measured.height ?? 40;
  const sx = source.internals.positionAbsolute.x + sw / 2;
  const sy = source.internals.positionAbsolute.y + sh / 2;
  const tx = target.internals.positionAbsolute.x + tw / 2;
  const ty = target.internals.positionAbsolute.y + th / 2;
  const w = sw / 2;
  const h = sh / 2;
  const xx1 = (tx - sx) / (2 * w) - (ty - sy) / (2 * h);
  const yy1 = (tx - sx) / (2 * w) + (ty - sy) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  return {
    x: w * (xx3 + yy3) + sx,
    y: h * (-xx3 + yy3) + sy,
  };
}

function FloatingEdge({ id, source, target, markerEnd, style }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;
  const s = getNodeIntersection(sourceNode, targetNode);
  const t = getNodeIntersection(targetNode, sourceNode);
  const [edgePath] = getStraightPath({
    sourceX: s.x,
    sourceY: s.y,
    targetX: t.x,
    targetY: t.y,
  });
  return (
    <path
      id={id}
      d={edgePath}
      style={style}
      markerEnd={markerEnd as string | undefined}
      className="react-flow__edge-path"
    />
  );
}

const edgeTypes = { floating: FloatingEdge };

// --- Bounds estimate from node positions + rough node heights ---
// This is synchronous and always available (doesn't wait for React Flow to
// measure rendered DOM), so container sizing reacts immediately to edits.

const STATE_ROW_HEIGHT = 56; // ~28px text + bar + margins
const PROB_NODE_BASE_HEIGHT = 100; // title + padding
// Height for non-probability nodes is computed from label length so
// multi-line wrapped labels get the vertical space they actually need.
const AVG_CHAR_WIDTH = 18; // empirical for 32px 600-weight sans-serif
const LINE_HEIGHT = 40;
const NODE_VERTICAL_PADDING = 34; // top+bottom padding + borders

function estimateNodeSize(d: BNNodeData): { width: number; height: number } {
  if (d.states) {
    return {
      width: PROB_NODE_WIDTH,
      height: PROB_NODE_BASE_HEIGHT + d.states.length * STATE_ROW_HEIGHT,
    };
  }
  const charsPerLine = Math.max(1, Math.floor(DEFAULT_NODE_MAX_WIDTH / AVG_CHAR_WIDTH));
  const labelLines = Math.max(1, Math.ceil(d.label.length / charsPerLine));
  const unitLines = d.unit ? 1 : 0;
  const height = (labelLines + unitLines) * LINE_HEIGHT + NODE_VERTICAL_PADDING;
  return { width: DEFAULT_NODE_MAX_WIDTH, height };
}

function estimateContentBounds(
  nodes: FlowNode[],
): { width: number; height: number } | null {
  if (nodes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const size = estimateNodeSize(n.data as BNNodeData);
    if (n.position.x < minX) minX = n.position.x;
    if (n.position.y < minY) minY = n.position.y;
    if (n.position.x + size.width > maxX) maxX = n.position.x + size.width;
    if (n.position.y + size.height > maxY) maxY = n.position.y + size.height;
  }
  return { width: maxX - minX, height: maxY - minY };
}

// Buffer zone around each node — no other node can cross within this many
// pixels. Overlap-resolution loop pushes pairs apart along the axis of least
// penetration until stable (or maxIters reached).
const NODE_BUFFER = 14;

function resolveOverlaps(nodes: FlowNode[], buffer: number, maxIters = 30): FlowNode[] {
  if (nodes.length === 0) return nodes;
  const sizes = nodes.map(n => estimateNodeSize(n.data as BNNodeData));
  const positions = nodes.map(n => ({ ...n.position }));

  for (let iter = 0; iter < maxIters; iter++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        // Rect A = positions[i] expanded by buffer; likewise B
        const ax = positions[i].x - buffer;
        const ay = positions[i].y - buffer;
        const aw = sizes[i].width + 2 * buffer;
        const ah = sizes[i].height + 2 * buffer;
        const bx = positions[j].x - buffer;
        const by = positions[j].y - buffer;
        const bw = sizes[j].width + 2 * buffer;
        const bh = sizes[j].height + 2 * buffer;
        const dx = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
        const dy = Math.min(ay + ah, by + bh) - Math.max(ay, by);
        if (dx <= 0 || dy <= 0) continue; // no overlap
        moved = true;
        // Push apart along axis of least penetration so we preserve as much
        // of the original layout as possible.
        if (dx < dy) {
          const shift = dx / 2;
          if (positions[i].x < positions[j].x) {
            positions[i].x -= shift;
            positions[j].x += shift;
          } else {
            positions[i].x += shift;
            positions[j].x -= shift;
          }
        } else {
          const shift = dy / 2;
          if (positions[i].y < positions[j].y) {
            positions[i].y -= shift;
            positions[j].y += shift;
          } else {
            positions[i].y += shift;
            positions[j].y -= shift;
          }
        }
      }
    }
    if (!moved) break;
  }

  return nodes.map((n, i) => ({ ...n, position: positions[i] }));
}

// --- Helpers ---

function buildReverseOverrides(
  overrides: DisplayNameOverrides | null,
  scenarioKey: string | null,
): Record<string, string> {
  if (!overrides || !scenarioKey) return {};
  const forScenario = overrides[scenarioKey];
  if (!forScenario) return {};
  const reversed: Record<string, string> = {};
  for (const [rationaleName, exportName] of Object.entries(forScenario)) {
    reversed[exportName] = rationaleName;
  }
  return reversed;
}

function stripUncertaintySuffix(name: string): string {
  return name.replace(/\s*-\s*Uncertainty$/, '').trim();
}

function scenarioKeyFromNetworkFile(networkFile: string | undefined): string | null {
  if (!networkFile) return null;
  const basename = networkFile.split('/').pop() ?? '';
  return basename.replace(/_network\.json$/, '') || null;
}

function variantFromScenarioKey(scenarioKey: string | null): ModelVariant {
  return scenarioKey && scenarioKey.endsWith('_human') ? 'human' : 'llm';
}

export function BayesianNetworkGraph({
  model,
  hasKRIMappings,
  onShowKRIMappings,
}: BayesianNetworkGraphProps) {
  const [network, setNetwork] = useState<NetworkFile | null>(null);
  const [overrides, setOverrides] = useState<DisplayNameOverrides | null>(null);
  const [benchmarkStates, setBenchmarkStates] = useState<BenchmarkStatesFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const networkFile = model?.networkFile;

  useEffect(() => {
    if (!networkFile) {
      setNetwork(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    Promise.all([
      fetch(`/data/${networkFile}`).then(r => {
        if (!r.ok) throw new Error(`Failed to load ${networkFile}`);
        return r.json() as Promise<NetworkFile>;
      }),
      fetch('/data/display_name_overrides.json').then(r =>
        r.ok ? (r.json() as Promise<DisplayNameOverrides>) : ({} as DisplayNameOverrides),
      ),
      fetch('/data/benchmark_states.json').then(r =>
        r.ok ? (r.json() as Promise<BenchmarkStatesFile>) : null,
      ),
    ])
      .then(([net, ov, bs]) => {
        if (cancelled) return;
        setNetwork(net);
        setOverrides(ov);
        setBenchmarkStates(bs);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message ?? String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [networkFile]);

  const scenarioKey = useMemo(() => scenarioKeyFromNetworkFile(networkFile), [networkFile]);
  const reverseOverrides = useMemo(
    () => buildReverseOverrides(overrides, scenarioKey),
    [overrides, scenarioKey],
  );
  const variant = useMemo(() => variantFromScenarioKey(scenarioKey), [scenarioKey]);

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!network) return { flowNodes: [] as FlowNode[], flowEdges: [] as FlowEdge[] };

    const stateLookup = benchmarkStates?.[variant] ?? {};

    const nodes: FlowNode[] = network.nodes.map(n => {
      const displayNameRaw = reverseOverrides[n.name] ?? n.name;
      const displayName = stripUncertaintySuffix(displayNameRaw);
      const unitLabel = n.nodeType === 'quantity' && n.unit ? n.unit : null;
      const states =
        n.nodeType === 'probability' && stateLookup[n.name] ? stateLookup[n.name] : null;
      return {
        id: n.id,
        position: { x: n.x * X_SCALE, y: n.y * Y_SCALE },
        data: {
          label: displayName,
          unit: unitLabel,
          nodeType: n.nodeType,
          states,
        } satisfies BNNodeData,
        type: 'bn',
        draggable: false,
        connectable: false,
        selectable: false,
      };
    });

    const edges: FlowEdge[] = network.edges.map((e, i) => ({
      id: `e-${i}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      type: 'floating',
      style: { stroke: EDGE_STROKE, strokeWidth: 1.75 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: EDGE_STROKE,
        width: 20,
        height: 20,
      },
    }));

    const spacedNodes = resolveOverlaps(nodes, NODE_BUFFER);
    return { flowNodes: spacedNodes, flowEdges: edges };
  }, [network, reverseOverrides, benchmarkStates, variant]);

  const header = (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-xl font-serif font-medium text-safer-charcoal">
        Bayesian Network Structure
      </h3>
      {hasKRIMappings && onShowKRIMappings && (
        <button
          onClick={onShowKRIMappings}
          className="flex items-center gap-1.5 text-sm font-medium text-safer-purple border border-safer-purple/30 rounded-lg px-3 py-1.5 hover:bg-safer-purple/5 transition-colors"
        >
          <Map className="w-4 h-4" />
          Show KRI Mappings
        </button>
      )}
    </div>
  );

  if (!networkFile) {
    return (
      <div className="card">
        {header}
        <div
          className="flex items-center justify-center rounded-lg border border-gray-300 bg-white"
          style={{ minHeight: '400px' }}
        >
          <div className="text-center px-6">
            <p className="text-gray-400 text-sm">
              Network visualization is not yet available for this model.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        {header}
        <div
          className="flex items-center justify-center rounded-lg border border-gray-300 bg-white"
          style={{ minHeight: '400px' }}
        >
          <p className="text-safer-red text-sm">Failed to load network: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {header}
      <NetworkFrame flowNodes={flowNodes} flowEdges={flowEdges} hasNetwork={!!network} />
    </div>
  );
}

// Wrapper that sizes the container to match the estimated content aspect ratio
// so there's no vertical void above/below the graph at fitView zoom.
// --- Tweak these three constants to taste ---
const FRAME_PADDING = 40; // extra pixels on top of the aspect-derived height
const FRAME_MIN_HEIGHT = 420;
const FRAME_MAX_HEIGHT = 900;

function NetworkFrame({
  flowNodes,
  flowEdges,
  hasNetwork,
}: {
  flowNodes: FlowNode[];
  flowEdges: FlowEdge[];
  hasNetwork: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setFrameWidth(e.contentRect.width);
    });
    ro.observe(el);
    setFrameWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const contentBounds = useMemo(() => estimateContentBounds(flowNodes), [flowNodes]);

  const frameHeight = useMemo(() => {
    if (!contentBounds || frameWidth === 0) return FRAME_MIN_HEIGHT;
    const aspect = contentBounds.height / contentBounds.width;
    const target = frameWidth * aspect + FRAME_PADDING;
    return Math.max(FRAME_MIN_HEIGHT, Math.min(target, FRAME_MAX_HEIGHT));
  }, [contentBounds, frameWidth]);

  return (
    <div
      ref={frameRef}
      className="rounded-lg border border-gray-300"
      style={{ height: frameHeight, background: 'rgba(242, 228, 201, 0.55)' }}
    >
      {hasNetwork ? (
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.04 }}
          minZoom={0.2}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll={false}
          zoomOnScroll={true}
        >
          <Background color="#b89a6a" gap={28} size={1.4} />
          <Controls showInteractive={false} />
        </ReactFlow>
      ) : (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-400 text-sm">Loading network…</p>
        </div>
      )}
    </div>
  );
}
