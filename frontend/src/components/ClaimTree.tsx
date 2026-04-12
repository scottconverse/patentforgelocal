import { useMemo } from 'react';

interface ClaimNode {
  id: string;
  claimNumber: number;
  claimType: string;
  scopeLevel: string | null;
  statutoryType: string | null;
  parentClaimNumber: number | null;
  text: string;
}

interface ClaimTreeProps {
  claims: ClaimNode[];
  onClaimClick?: (claimId: string) => void;
}

// Layout constants
const NODE_W = 140;
const NODE_H = 48;
const H_GAP = 24; // horizontal gap between siblings
const V_GAP = 56; // vertical gap between levels
const PAD = 16; // SVG padding

interface LayoutNode {
  claim: ClaimNode;
  x: number;
  y: number;
  children: LayoutNode[];
}

function buildTree(claims: ClaimNode[]): LayoutNode[] {
  const independent = claims.filter((c) => c.claimType === 'INDEPENDENT').sort((a, b) => a.claimNumber - b.claimNumber);

  const dependent = claims.filter((c) => c.claimType === 'DEPENDENT').sort((a, b) => a.claimNumber - b.claimNumber);

  return independent.map((indep) => ({
    claim: indep,
    x: 0,
    y: 0,
    children: dependent
      .filter((d) => d.parentClaimNumber === indep.claimNumber)
      .map((d) => ({ claim: d, x: 0, y: 0, children: [] })),
  }));
}

function layoutTree(roots: LayoutNode[]): { nodes: LayoutNode[]; width: number; height: number } {
  if (roots.length === 0) return { nodes: [], width: 0, height: 0 };

  // Calculate width needed for each root subtree
  const subtreeWidths = roots.map((root) => {
    const childCount = Math.max(root.children.length, 1);
    return childCount * NODE_W + (childCount - 1) * H_GAP;
  });

  const totalWidth = subtreeWidths.reduce((a, b) => a + b, 0) + (roots.length - 1) * H_GAP * 2;
  const hasChildren = roots.some((r) => r.children.length > 0);
  const totalHeight = NODE_H + (hasChildren ? V_GAP + NODE_H : 0);

  // Position each root and its children
  let xOffset = PAD;
  const allNodes: LayoutNode[] = [];

  for (let i = 0; i < roots.length; i++) {
    const root = roots[i];
    const subtreeW = subtreeWidths[i];

    // Center root over its children
    root.x = xOffset + subtreeW / 2 - NODE_W / 2;
    root.y = PAD;
    allNodes.push(root);

    // Position children evenly
    if (root.children.length > 0) {
      const childrenTotalW = root.children.length * NODE_W + (root.children.length - 1) * H_GAP;
      let childX = xOffset + (subtreeW - childrenTotalW) / 2;

      for (const child of root.children) {
        child.x = childX;
        child.y = PAD + NODE_H + V_GAP;
        allNodes.push(child);
        childX += NODE_W + H_GAP;
      }
    }

    xOffset += subtreeW + H_GAP * 2;
  }

  return { nodes: allNodes, width: totalWidth + PAD * 2, height: totalHeight + PAD * 2 };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '\u2026';
}

export default function ClaimTree({ claims, onClaimClick }: ClaimTreeProps) {
  const { roots, layout } = useMemo(() => {
    const r = buildTree(claims);
    const l = layoutTree(r);
    return { roots: r, layout: l };
  }, [claims]);

  if (layout.nodes.length === 0) {
    return <div className="text-gray-500 text-sm text-center py-8">No claims to visualize.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="mx-auto"
      >
        {/* Connector lines */}
        {roots.map((root) =>
          root.children.map((child) => (
            <line
              key={`line-${root.claim.claimNumber}-${child.claim.claimNumber}`}
              x1={root.x + NODE_W / 2}
              y1={root.y + NODE_H}
              x2={child.x + NODE_W / 2}
              y2={child.y}
              stroke="#4b5563"
              strokeWidth={1.5}
            />
          )),
        )}

        {/* Nodes */}
        {layout.nodes.map((node) => {
          const isIndep = node.claim.claimType === 'INDEPENDENT';
          const fill = isIndep ? '#1e3a5f' : '#1f2937';
          const stroke = isIndep ? '#3b82f6' : '#4b5563';
          const label = `Claim ${node.claim.claimNumber}`;
          const subtitle = isIndep
            ? (node.claim.statutoryType ?? 'independent')
            : `dep. on ${node.claim.parentClaimNumber}`;

          return (
            <g
              key={node.claim.id}
              onClick={() => onClaimClick?.(node.claim.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClaimClick?.(node.claim.id);
                }
              }}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`Claim ${node.claim.claimNumber}`}
            >
              <rect
                x={node.x}
                y={node.y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={fill}
                stroke={stroke}
                strokeWidth={1.5}
              />
              {/* Hover highlight */}
              <rect
                x={node.x}
                y={node.y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill="transparent"
                className="hover:fill-white/5 transition-colors"
              />
              <text
                x={node.x + NODE_W / 2}
                y={node.y + 19}
                textAnchor="middle"
                className="text-xs font-semibold"
                fill={isIndep ? '#93c5fd' : '#d1d5db'}
              >
                {label}
              </text>
              <text x={node.x + NODE_W / 2} y={node.y + 35} textAnchor="middle" className="text-[10px]" fill="#9ca3af">
                {truncate(subtitle, 18)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
