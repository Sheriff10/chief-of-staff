/**
 * Agent workflow graph — JSON contract for backend + UI rendering.
 * Demo payload: `data/agent-trace-runs-demo.json`
 */

export const WORKFLOW_GRAPH_SCHEMA_VERSION = 1 as const;

/** Edge endpoints reference `nodes[].id` */
export interface AgentWorkflowEdgeJson {
  from: string;
  to: string;
}

export interface AgentWorkflowNodeJson {
  id: string;
  label: string;
  subtitle?: string;
}

/**
 * Wire format for LangGraph-style DAGs. Renderer lays out top-to-bottom by layer
 * (longest path from roots), spreads siblings horizontally, draws curved edges.
 */
export interface AgentWorkflowGraphJson {
  schema_version: typeof WORKFLOW_GRAPH_SCHEMA_VERSION;
  nodes: AgentWorkflowNodeJson[];
  edges: AgentWorkflowEdgeJson[];
}

export type AgentTraceRunStatusJson = "completed" | "running" | "failed";

/** One persisted agent run — matches rows the API may return */
export interface AgentTraceRunJson {
  id: string;
  title: string;
  preview: string;
  status: AgentTraceRunStatusJson;
  finished_label: string;
  output_label: string;
  workflow: AgentWorkflowGraphJson;
}

export interface AgentTraceRunsPayloadJson {
  schema_version: typeof WORKFLOW_GRAPH_SCHEMA_VERSION;
  runs: AgentTraceRunJson[];
}

/** Layout tuning — SVG space units */
const CANVAS_HORIZONTAL_PADDING_PX = 20;
const CANVAS_TOP_PADDING_PX = 18;
const CANVAS_BOTTOM_PADDING_PX = 22;
const NODE_WIDTH_PX = 232;
const NODE_HEIGHT_PX = 52;
const ROW_STEP_PX = NODE_HEIGHT_PX + 52;
const EDGE_CURVE_BULGE_PX = 38;

export interface WorkflowLayoutPoint {
  x: number;
  y: number;
}

export interface WorkflowLayoutResult {
  positions: Map<string, WorkflowLayoutPoint>;
  viewWidthPx: number;
  viewHeightPx: number;
}

function getLongestPathLevel(
  nodeIds: readonly string[],
  edges: readonly AgentWorkflowEdgeJson[],
): Map<string, number> {
  const idSet = new Set(nodeIds);
  const predecessors = new Map<string, Set<string>>();
  nodeIds.forEach((id) => predecessors.set(id, new Set()));

  edges.forEach((edge) => {
    if (!idSet.has(edge.from) || !idSet.has(edge.to)) {
      return;
    }
    predecessors.get(edge.to)?.add(edge.from);
  });

  const levelById = new Map<string, number>();

  const resolveLevel = (id: string): number => {
    const cached = levelById.get(id);
    if (cached !== undefined) {
      return cached;
    }

    const parents = predecessors.get(id);
    const parentList = parents ? [...parents] : [];

    if (parentList.length === 0) {
      levelById.set(id, 0);
      return 0;
    }

    let maxParentLevel = -1;
    for (const parentId of parentList) {
      maxParentLevel = Math.max(maxParentLevel, resolveLevel(parentId));
    }

    const nextLevel = maxParentLevel + 1;
    levelById.set(id, nextLevel);
    return nextLevel;
  };

  nodeIds.forEach((id) => {
    resolveLevel(id);
  });

  return levelById;
}

function groupIdsByLevel(levelById: Map<string, number>): Map<number, string[]> {
  const layers = new Map<number, string[]>();
  levelById.forEach((level, id) => {
    const bucket = layers.get(level);
    if (bucket) {
      bucket.push(id);
    } else {
      layers.set(level, [id]);
    }
  });
  layers.forEach((ids) => ids.sort((a, b) => a.localeCompare(b)));
  return layers;
}

export function layoutAgentWorkflowGraph(
  graph: AgentWorkflowGraphJson,
  canvasWidthPx: number,
): WorkflowLayoutResult {
  const nodeIds = graph.nodes.map((node) => node.id);
  const levelById = getLongestPathLevel(nodeIds, graph.edges);
  const layers = groupIdsByLevel(levelById);

  let maxLevel = 0;
  levelById.forEach((level) => {
    maxLevel = Math.max(maxLevel, level);
  });

  const innerWidth = Math.max(NODE_WIDTH_PX, canvasWidthPx - CANVAS_HORIZONTAL_PADDING_PX * 2);

  const positions = new Map<string, WorkflowLayoutPoint>();

  for (let level = 0; level <= maxLevel; level += 1) {
    const idsInLayer = layers.get(level) ?? [];
    const count = idsInLayer.length;
    if (count === 0) {
      continue;
    }

    const step = innerWidth / (count + 1);
    idsInLayer.forEach((id, index) => {
      const x = CANVAS_HORIZONTAL_PADDING_PX + step * (index + 1);
      const y = CANVAS_TOP_PADDING_PX + level * ROW_STEP_PX + NODE_HEIGHT_PX / 2;
      positions.set(id, { x, y });
    });
  }

  const viewWidthPx = canvasWidthPx;
  const viewHeightPx =
    CANVAS_TOP_PADDING_PX + maxLevel * ROW_STEP_PX + NODE_HEIGHT_PX / 2 + CANVAS_BOTTOM_PADDING_PX;

  return { positions, viewWidthPx, viewHeightPx };
}

export function buildCurvedEdgePathD(
  fromCenter: WorkflowLayoutPoint,
  toCenter: WorkflowLayoutPoint,
  edgeIndex: number,
): string {
  const sx = fromCenter.x;
  const syBottom = fromCenter.y + NODE_HEIGHT_PX / 2;
  const ex = toCenter.x;
  const eyTop = toCenter.y - NODE_HEIGHT_PX / 2;

  const waveDirection: 1 | -1 = edgeIndex % 2 === 0 ? 1 : -1;
  const bulge = EDGE_CURVE_BULGE_PX * waveDirection;

  const midY = (syBottom + eyTop) / 2;
  const c1y = syBottom + (midY - syBottom) * 0.62;
  const c2y = eyTop - (eyTop - midY) * 0.62;

  return `M ${sx} ${syBottom} C ${sx + bulge} ${c1y} ${ex - bulge} ${c2y} ${ex} ${eyTop}`;
}

export function getWorkflowLayoutConstants(): {
  nodeWidthPx: number;
  nodeHeightPx: number;
} {
  return { nodeWidthPx: NODE_WIDTH_PX, nodeHeightPx: NODE_HEIGHT_PX };
}
