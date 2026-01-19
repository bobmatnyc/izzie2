/**
 * Relationship Graph Dashboard Page
 * Interactive visualization of entity relationships
 */

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import ForceGraph2D to avoid SSR issues (A-Frame not defined error)
// Use react-force-graph-2d directly instead of react-force-graph to avoid A-Frame dependency
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '500px' }}>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-block',
            width: '40px',
            height: '40px',
            border: '4px solid #f3f4f6',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <p style={{ marginTop: '1rem', color: '#6b7280' }}>Loading graph...</p>
      </div>
    </div>
  ),
});

interface GraphNode {
  id: string;
  type: string;
  value: string;
  normalized: string;
  connectionCount: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence: number;
  evidence?: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { nodeCount: number; edgeCount: number };
}

interface StatsData {
  byType: Record<string, number>;
  total: number;
  avgConfidence: number;
}

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  person: { bg: '#eff6ff', text: '#1e40af', border: '#3b82f6' },
  company: { bg: '#f0fdf4', text: '#15803d', border: '#22c55e' },
  project: { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' },
  action_item: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
  topic: { bg: '#f3e8ff', text: '#6b21a8', border: '#a855f7' },
  location: { bg: '#fce7f3', text: '#9f1239', border: '#ec4899' },
};

const RELATIONSHIP_TYPES = [
  'WORKS_WITH', 'REPORTS_TO', 'WORKS_FOR', 'LEADS', 'WORKS_ON', 'EXPERT_IN',
  'LOCATED_IN', 'PARTNERS_WITH', 'COMPETES_WITH', 'OWNS', 'RELATED_TO',
  'DEPENDS_ON', 'PART_OF', 'SUBTOPIC_OF', 'ASSOCIATED_WITH'
];

const ENTITY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'person', label: 'People' },
  { value: 'company', label: 'Companies' },
  { value: 'project', label: 'Projects' },
  { value: 'topic', label: 'Topics' },
  { value: 'location', label: 'Locations' },
];

export default function RelationshipsPage() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [selectedEntityType, setSelectedEntityType] = useState('');
  const [selectedRelType, setSelectedRelType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isInferring, setIsInferring] = useState(false);
  const [inferenceResult, setInferenceResult] = useState<{
    success: boolean;
    totalRelationships?: number;
    totalCost?: number;
    error?: string;
  } | null>(null);
  const graphRef = useRef<any>(null);

  const fetchGraph = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedEntityType) params.set('entityType', selectedEntityType);
      params.set('limit', '100');
      const response = await fetch(`/api/relationships/graph?` + params.toString(), { credentials: 'include' });
      if (response.ok) {
        setGraphData(await response.json());
      } else {
        const err = await response.json();
        setError(err.details || err.error || 'Failed to fetch graph');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch graph');
    } finally {
      setIsLoading(false);
    }
  }, [selectedEntityType]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/relationships/stats', { credentials: 'include' });
      if (response.ok) setStats(await response.json());
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  useEffect(() => { fetchGraph(); fetchStats(); }, [fetchGraph, fetchStats]);

  const filteredData = useMemo(() => {
    if (!graphData) return null;
    let nodes = graphData.nodes;
    let edges = graphData.edges;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      nodes = nodes.filter(n => n.value.toLowerCase().includes(q) || n.normalized.toLowerCase().includes(q));
      const ids = new Set(nodes.map(n => n.id));
      edges = edges.filter(e => ids.has(e.source as string) && ids.has(e.target as string));
    }
    if (selectedRelType) {
      edges = edges.filter(e => e.type === selectedRelType);
      const ids = new Set<string>();
      edges.forEach(e => { ids.add(e.source as string); ids.add(e.target as string); });
      nodes = nodes.filter(n => ids.has(n.id));
    }
    return { nodes, links: edges.map(e => ({ ...e, source: e.source, target: e.target })) };
  }, [graphData, searchQuery, selectedRelType]);

  const getNodeColor = (node: GraphNode) => TYPE_COLORS[node.type]?.border || '#9ca3af';
  const handleNodeClick = useCallback((node: any) => { setSelectedNode(node); setSelectedEdge(null); }, []);
  const handleLinkClick = useCallback((link: any) => { setSelectedEdge(link); setSelectedNode(null); }, []);
  const getNodeEdges = useCallback((nodeId: string) => graphData?.edges.filter(e => e.source === nodeId || e.target === nodeId) || [], [graphData]);

  const runInference = useCallback(async () => {
    setIsInferring(true);
    setInferenceResult(null);
    try {
      const response = await fetch('/api/relationships/bulk-infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          limit: 500,
          entityTypes: ['person', 'company', 'project'],
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setInferenceResult({
          success: true,
          totalRelationships: data.totalRelationships,
          totalCost: data.totalCost,
        });
        // Refresh the graph and stats
        await Promise.all([fetchGraph(), fetchStats()]);
      } else {
        setInferenceResult({
          success: false,
          error: data.error || data.details || 'Failed to run inference',
        });
      }
    } catch (err) {
      setInferenceResult({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to run inference',
      });
    } finally {
      setIsInferring(false);
    }
  }, [fetchGraph, fetchStats]);

  return (
    <div>
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.5rem 2rem' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: '#111' }}>Relationship Graph</h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>Explore relationships between extracted entities</p>
        </div>
      </div>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem' }}>
        {inferenceResult && (
          <div style={{
            backgroundColor: inferenceResult.success ? '#f0fdf4' : '#fee2e2',
            border: `1px solid ${inferenceResult.success ? '#22c55e' : '#f87171'}`,
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              {inferenceResult.success ? (
                <>
                  <p style={{ color: '#15803d', fontWeight: '600' }}>
                    ✓ Inference complete!
                  </p>
                  <p style={{ color: '#166534', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    Found {inferenceResult.totalRelationships} relationships (cost: ${inferenceResult.totalCost?.toFixed(4) || '0.0000'})
                  </p>
                </>
              ) : (
                <>
                  <p style={{ color: '#dc2626', fontWeight: '600' }}>
                    ✗ Inference failed
                  </p>
                  <p style={{ color: '#7f1d1d', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {inferenceResult.error}
                  </p>
                </>
              )}
            </div>
            <button
              onClick={() => setInferenceResult(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: inferenceResult.success ? '#15803d' : '#dc2626', fontSize: '1.25rem' }}
            >
              ×
            </button>
          </div>
        )}

        {stats && stats.byType && Object.keys(stats.byType).length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ backgroundColor: '#fff', border: '2px solid #3b82f6', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1e40af' }}>{stats.total}</div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Total</div>
            </div>
            {Object.entries(stats.byType).slice(0, 5).map(([type, count]) => (
              <button key={type} onClick={() => setSelectedRelType(selectedRelType === type ? '' : type)}
                style={{ backgroundColor: selectedRelType === type ? '#eff6ff' : '#fff', border: `2px solid ${selectedRelType === type ? '#3b82f6' : '#e5e7eb'}`, borderRadius: '8px', padding: '1rem', textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111' }}>{count}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{type.replace(/_/g, ' ')}</div>
              </button>
            ))}
          </div>
        )}

        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>Entity Type</label>
              <select value={selectedEntityType} onChange={(e) => setSelectedEntityType(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}>
                {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>Relationship Type</label>
              <select value={selectedRelType} onChange={(e) => setSelectedRelType(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}>
                <option value="">All Relationships</option>
                {RELATIONSHIP_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>Search</label>
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search entities..."
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }} />
            </div>
          </div>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', border: '1px solid #f87171', borderRadius: '8px', padding: '1rem', marginBottom: '2rem' }}>
            <p style={{ color: '#dc2626', fontWeight: '600' }}>Error loading graph</p>
            <p style={{ color: '#7f1d1d', fontSize: '0.875rem' }}>{error}</p>
          </div>
        )}

        {isLoading && (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div style={{ display: 'inline-block', width: '40px', height: '40px', border: '4px solid #f3f4f6', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <p style={{ marginTop: '1rem', color: '#6b7280' }}>Loading relationship graph...</p>
          </div>
        )}

        {!isLoading && !error && filteredData && filteredData.nodes.length === 0 && (
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '3rem', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', backgroundColor: '#f3f4f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                <circle cx="5" cy="6" r="3" />
                <circle cx="19" cy="6" r="3" />
                <circle cx="12" cy="18" r="3" />
                <line x1="5" y1="9" x2="12" y2="15" />
                <line x1="19" y1="9" x2="12" y2="15" />
              </svg>
            </div>
            <p style={{ fontSize: '1.125rem', fontWeight: '600', color: '#374151' }}>No relationships found</p>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem', maxWidth: '400px', margin: '0.5rem auto 1.5rem' }}>
              Run relationship inference to discover connections between your extracted entities using AI analysis.
            </p>
            <button
              onClick={runInference}
              disabled={isInferring}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                backgroundColor: isInferring ? '#9ca3af' : '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: isInferring ? 'not-allowed' : 'pointer',
              }}
            >
              {isInferring ? (
                <>
                  <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  Analyzing entities...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                  Run Relationship Inference
                </>
              )}
            </button>
          </div>
        )}

        {!isLoading && !error && filteredData && filteredData.nodes.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem' }}>
            <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', height: '600px' }}>
              <ForceGraph2D ref={graphRef} graphData={filteredData}
                nodeLabel={(node: any) => `${node.value} (${node.type})`}
                nodeColor={(node: any) => getNodeColor(node as GraphNode)}
                nodeRelSize={8}
                nodeVal={(node: any) => Math.max(4, (node as GraphNode).connectionCount * 2)}
                linkLabel={(link: any) => link.type}
                linkColor={() => '#94a3b8'}
                linkWidth={(link: any) => Math.max(1, (link as GraphEdge).confidence * 3)}
                linkDirectionalArrowLength={6}
                linkDirectionalArrowRelPos={1}
                onNodeClick={handleNodeClick}
                onLinkClick={handleLinkClick}
                cooldownTicks={100}
                onEngineStop={() => graphRef.current?.zoomToFit(400)} />
            </div>

            <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem', height: '600px', overflowY: 'auto' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>
                {selectedNode ? 'Node Details' : selectedEdge ? 'Relationship Details' : 'Select a node or edge'}
              </h3>

              {selectedNode && (
                <div>
                  <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '600',
                    backgroundColor: TYPE_COLORS[selectedNode.type]?.bg || '#f3f4f6', color: TYPE_COLORS[selectedNode.type]?.text || '#374151', marginBottom: '0.75rem' }}>
                    {selectedNode.type}
                  </div>
                  <p style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111' }}>{selectedNode.value}</p>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>{selectedNode.connectionCount} connections</p>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: '600', marginTop: '1.5rem', marginBottom: '0.5rem' }}>Relationships</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {getNodeEdges(selectedNode.id).map((edge, i) => (
                      <div key={i} style={{ padding: '0.5rem', backgroundColor: '#f9fafb', borderRadius: '6px', fontSize: '0.75rem' }}>
                        <span style={{ fontWeight: '600' }}>{edge.type}</span>
                        <span style={{ color: '#6b7280' }}>{' -> '}{edge.source === selectedNode.id
                          ? graphData?.nodes.find(n => n.id === edge.target)?.value
                          : graphData?.nodes.find(n => n.id === edge.source)?.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedEdge && (
                <div>
                  <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '600', backgroundColor: '#eff6ff', color: '#1e40af', marginBottom: '0.75rem' }}>
                    {selectedEdge.type}
                  </div>
                  <p style={{ fontSize: '0.875rem', color: '#374151', marginTop: '0.5rem' }}><strong>From:</strong> {graphData?.nodes.find(n => n.id === selectedEdge.source)?.value}</p>
                  <p style={{ fontSize: '0.875rem', color: '#374151' }}><strong>To:</strong> {graphData?.nodes.find(n => n.id === selectedEdge.target)?.value}</p>
                  <p style={{ fontSize: '0.875rem', color: '#374151', marginTop: '0.5rem' }}><strong>Confidence:</strong> {Math.round(selectedEdge.confidence * 100)}%</p>
                  {selectedEdge.evidence && (
                    <div style={{ marginTop: '1rem' }}>
                      <h4 style={{ fontSize: '0.875rem', fontWeight: '600' }}>Evidence</h4>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>{selectedEdge.evidence}</p>
                    </div>
                  )}
                </div>
              )}

              {!selectedNode && !selectedEdge && <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Click on a node or edge in the graph to see details.</p>}
            </div>
          </div>
        )}

        {!isLoading && filteredData && filteredData.nodes.length > 0 && (
          <div style={{ marginTop: '1.5rem', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.75rem' }}>Legend</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              {Object.entries(TYPE_COLORS).map(([type, colors]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: colors.border }} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'capitalize' }}>{type.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
