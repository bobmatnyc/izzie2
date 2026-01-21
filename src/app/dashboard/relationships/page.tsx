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
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearResult, setClearResult] = useState<{
    success: boolean;
    deletedCount?: number;
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
      params.set('_t', Date.now().toString());
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

  // Debug logging for graph data
  useEffect(() => {
    if (graphData) {
      console.log('[Relationships] Graph data loaded:', {
        nodeCount: graphData.nodes.length,
        edgeCount: graphData.edges.length,
        sampleNode: graphData.nodes[0],
        sampleNodeValue: graphData.nodes[0]?.value,
      });
    }
  }, [graphData]);

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

  // Helper to get ID from source/target (handles both string IDs and mutated node objects)
  const getEdgeNodeId = (sourceOrTarget: any): string => {
    if (typeof sourceOrTarget === 'string') return sourceOrTarget;
    if (sourceOrTarget && typeof sourceOrTarget === 'object' && sourceOrTarget.id) return sourceOrTarget.id;
    return '';
  };

  // Helper to get node value by ID
  const getNodeValue = (nodeId: string): string => {
    const node = graphData?.nodes.find(n => n.id === nodeId);
    return node?.value || 'Unknown';
  };

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

  const clearAllRelationships = useCallback(async () => {
    setIsClearing(true);
    setClearResult(null);
    setShowClearConfirm(false);
    try {
      const response = await fetch('/api/relationships?all=true', {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setClearResult({
          success: true,
          deletedCount: data.deletedCount,
        });
        await Promise.all([fetchGraph(), fetchStats()]);
      } else {
        setClearResult({
          success: false,
          error: data.error || 'Failed to clear relationships',
        });
      }
    } catch (err) {
      setClearResult({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to clear relationships',
      });
    } finally {
      setIsClearing(false);
    }
  }, [fetchGraph, fetchStats]);

  return (
    <div>
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: '#111' }}>Relationship Graph</h1>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>Explore relationships between extracted entities</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={runInference}
              disabled={isInferring}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: isInferring ? '#9ca3af' : '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: isInferring ? 'not-allowed' : 'pointer',
              }}
            >
              {isInferring ? (
                <>
                  <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  Analyzing...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                  Refresh Relationships
                </>
              )}
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={isClearing || !stats || stats.total === 0}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#fff',
                color: isClearing || !stats || stats.total === 0 ? '#9ca3af' : '#dc2626',
                border: `1px solid ${isClearing || !stats || stats.total === 0 ? '#d1d5db' : '#dc2626'}`,
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: isClearing || !stats || stats.total === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {isClearing ? (
                <>
                  <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #dc2626', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  Clearing...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Clear All
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem' }}>
        {/* Confirmation Dialog */}
        {showClearConfirm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}>
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111', marginBottom: '0.5rem' }}>
                Clear All Relationships?
              </h3>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
                This will permanently delete all {stats?.total || 0} relationships. This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#fff',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={clearAllRelationships}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  Delete All
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clear Result Message */}
        {clearResult && (
          <div style={{
            backgroundColor: clearResult.success ? '#f0fdf4' : '#fee2e2',
            border: `1px solid ${clearResult.success ? '#22c55e' : '#f87171'}`,
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              {clearResult.success ? (
                <p style={{ color: '#15803d', fontWeight: '600' }}>
                  Deleted {clearResult.deletedCount} relationships
                </p>
              ) : (
                <>
                  <p style={{ color: '#dc2626', fontWeight: '600' }}>
                    Failed to clear relationships
                  </p>
                  <p style={{ color: '#7f1d1d', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {clearResult.error}
                  </p>
                </>
              )}
            </div>
            <button
              onClick={() => setClearResult(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: clearResult.success ? '#15803d' : '#dc2626', fontSize: '1.25rem' }}
            >
              x
            </button>
          </div>
        )}

        {/* Inference Result Message */}
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
                    Inference complete!
                  </p>
                  <p style={{ color: '#166534', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    Found {inferenceResult.totalRelationships} relationships (cost: ${inferenceResult.totalCost?.toFixed(4) || '0.0000'})
                  </p>
                </>
              ) : (
                <>
                  <p style={{ color: '#dc2626', fontWeight: '600' }}>
                    Inference failed
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
              x
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
                    {getNodeEdges(selectedNode.id).map((edge, i) => {
                      const sourceId = getEdgeNodeId(edge.source);
                      const targetId = getEdgeNodeId(edge.target);
                      const otherNodeId = sourceId === selectedNode.id ? targetId : sourceId;
                      return (
                        <div key={i} style={{ padding: '0.5rem', backgroundColor: '#f9fafb', borderRadius: '6px', fontSize: '0.75rem' }}>
                          <span style={{ fontWeight: '600' }}>{edge.type}</span>
                          <span style={{ color: '#6b7280' }}>{' -> '}{getNodeValue(otherNodeId)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedEdge && (
                <div>
                  <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '600', backgroundColor: '#eff6ff', color: '#1e40af', marginBottom: '0.75rem' }}>
                    {selectedEdge.type}
                  </div>
                  <p style={{ fontSize: '0.875rem', color: '#374151', marginTop: '0.5rem' }}><strong>From:</strong> {getNodeValue(getEdgeNodeId(selectedEdge.source))}</p>
                  <p style={{ fontSize: '0.875rem', color: '#374151' }}><strong>To:</strong> {getNodeValue(getEdgeNodeId(selectedEdge.target))}</p>
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
