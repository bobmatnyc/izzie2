# Relationship Visualization Analysis

**Date**: 2025-01-21
**Project**: izzie2
**Type**: Informational Research

## Executive Summary

This document analyzes the current relationship visualization in the izzie2 project and provides recommendations for improving the display of entity names, relationship types, and visual distinction between different relationship categories.

---

## 1. Current State of Visualization

### 1.1 File Location
`/src/app/dashboard/relationships/page.tsx`

### 1.2 How Nodes Are Currently Rendered

The visualization uses `react-force-graph-2d` with custom canvas rendering via `paintNode` callback:

**Node Structure:**
- **Shape**: Circular nodes with border
- **Size**: Dynamic based on connection count: `radius = sqrt(max(4, connectionCount * 2)) * 4`
- **Colors**: Type-based coloring (defined in `TYPE_COLORS`):
  - Person: Blue (#3b82f6)
  - Company: Green (#22c55e)
  - Project: Yellow (#fbbf24)
  - Action Item: Red (#ef4444)
  - Topic: Purple (#a855f7)
  - Location: Pink (#ec4899)

**Node Content:**
- **Type Icon**: Single letter inside node (P, C, J, T, L, !)
- **Entity Name**: Shown BELOW node, truncated to 15 characters
- **Level of Detail**: Labels only visible when `globalScale > 0.8` (zoom level)

**Current `paintNode` Implementation (lines 140-196):**
```typescript
// Draw type letter inside node (always visible)
const fontSize = Math.max(radius * 0.8, 8);
ctx.fillText(typeIcon, x, y);

// Level-of-detail: show labels when zoomed in (globalScale > 0.8)
if (globalScale > 0.8) {
  const label = truncateLabel(graphNode.value);
  // Draw white background for label
  // Draw label text below node
}
```

### 1.3 What Information Is Shown on Hover

**Tooltip Content:**
- Node tooltip (via `nodeLabel`): `"${node.value} (${node.type})"`
- Link tooltip (via `linkLabel`): `link.type` (relationship type)

**Sidebar Details Panel (when clicked):**
- For Nodes:
  - Entity type badge
  - Full entity value (name)
  - Connection count
  - List of relationships with format: `RELATIONSHIP_TYPE -> OtherEntityName`
- For Edges:
  - Relationship type badge
  - From/To entity names
  - Confidence percentage
  - Evidence text (if available)

### 1.4 How Relationship Links Are Styled

**Current Link Styling (lines 884-892):**
- **Color**: Static gray (`#94a3b8`)
- **Width**: Based on confidence: `max(1, confidence * 3)`
- **Arrows**: Directional arrows at link end (`linkDirectionalArrowLength={6}`)

**No Visual Distinction** between relationship types (all use same color/style).

---

## 2. Relationship Types Available

### 2.1 Defined Relationship Types

From `/src/lib/relationships/types.ts`:

**Person Relationships:**
| Type | Direction | Description |
|------|-----------|-------------|
| `WORKS_WITH` | Bidirectional | Colleagues |
| `REPORTS_TO` | Directional | Hierarchy |
| `WORKS_FOR` | Directional | Person → Company |
| `LEADS` | Directional | Person → Project |
| `WORKS_ON` | Directional | Person → Project |
| `EXPERT_IN` | Directional | Person → Topic |
| `LOCATED_IN` | Directional | Person/Company → Location |

**Company Relationships:**
| Type | Direction | Description |
|------|-----------|-------------|
| `PARTNERS_WITH` | Bidirectional | Business partnership |
| `COMPETES_WITH` | Bidirectional | Competition |
| `OWNS` | Directional | Company → Project |

**Project Relationships:**
| Type | Direction | Description |
|------|-----------|-------------|
| `RELATED_TO` | Bidirectional | General relation |
| `DEPENDS_ON` | Directional | Dependency |
| `PART_OF` | Directional | Parent project |

**Topic Relationships:**
| Type | Direction | Description |
|------|-----------|-------------|
| `SUBTOPIC_OF` | Directional | Hierarchy |
| `ASSOCIATED_WITH` | Bidirectional | General relation |

### 2.2 Relationship Categories

**Not Currently Categorized.** Relationships could be grouped into:

| Category | Relationship Types | Suggested Color |
|----------|-------------------|-----------------|
| **Professional/Work** | WORKS_WITH, REPORTS_TO, WORKS_FOR, LEADS, WORKS_ON, EXPERT_IN | Blue (#3b82f6) |
| **Business** | PARTNERS_WITH, COMPETES_WITH, OWNS | Green (#22c55e) |
| **Structural** | RELATED_TO, DEPENDS_ON, PART_OF, SUBTOPIC_OF, ASSOCIATED_WITH | Gray (#6b7280) |
| **Geographic** | LOCATED_IN | Purple (#a855f7) |

### 2.3 Data Structure in Weaviate

**Relationship Collection Properties:**
- `fromEntityType`: Text (person, company, etc.)
- `fromEntityValue`: Text (normalized entity value)
- `toEntityType`: Text
- `toEntityValue`: Text
- `relationshipType`: Text (WORKS_WITH, etc.)
- `confidence`: Number (0-1)
- `evidence`: Text (supporting context)
- `sourceId`: Text (email/event ID)
- `userId`: Text
- `inferredAt`: Text (ISO timestamp)

**Entity Properties (common):**
- `value`: Original entity value
- `normalized`: Normalized form
- `confidence`: 0-1 score
- `source`: metadata, body, or subject
- `sourceId`: Email/event ID
- `userId`: Owner
- `extractedAt`: Timestamp
- `context`: Surrounding text

---

## 3. Best Practices Research

### 3.1 Node Label Strategies

From [yFiles Knowledge Graph Guide](https://www.yfiles.com/resources/how-to/guide-to-visualizing-knowledge-graphs) and [Datavid KG Guide](https://datavid.com/blog/knowledge-graph-visualization):

1. **Prefer readable labels** over IDs at render time
2. **Use level-of-detail (LOD)**: Show labels at appropriate zoom levels
3. **Truncate with ellipsis**: Display full label on hover
4. **Labels as organization**: Group similar nodes visually
5. **Multi-line labels**: Use tspan elements for long names

### 3.2 Relationship Visual Encoding

From [Microsoft GraphRAG Guide](https://microsoft.github.io/graphrag/visualization_guide/) and [Highcharts Network Graph Tutorial](https://www.highcharts.com/blog/tutorials/network-graph-visualization-exploring-data-relationships/):

1. **Edge direction**: Arrows for directional relationships
2. **Edge thickness**: Encode relationship strength/confidence
3. **Edge color**: Group by predicate family/category
4. **Line styles**: Solid for explicit, dashed for inferred
5. **Edge labels**: Show predicate names (abbreviate if long)
6. **Badges**: Show qualifiers (confidence, validity)

### 3.3 Distinguishing Relationship Categories

From [MyHeritage Relationship Diagrams](https://education.myheritage.com/article/visualizing-family-relationships-with-relationship-diagrams-and-color-coding/):

1. **Color coding**: Different colors for different categories
2. **Line styles**: Solid vs dashed vs dotted
3. **Combine channels**: Use both color AND style for accessibility
4. **Color inheritance**: Child nodes inherit parent colors

### 3.4 General Principles

From [FalkorDB KG Visualization](https://www.falkordb.com/blog/knowledge-graph-visualization-insights/):

1. **Consistency**: Same colors for same types everywhere
2. **Simplicity**: Limit palette to 2-3 shapes max
3. **Hierarchy**: Large nodes = important, bright colors = primary
4. **Gestalt principles**:
   - Proximity: Close objects seen as groups
   - Similarity: Same colors/shapes mentally grouped
   - Continuation: Eyes follow smooth paths

---

## 4. Recommendations

### 4.1 Entity Names on Bubbles

**Current Issue:** Names only show when zoomed in (globalScale > 0.8), and only below the node.

**Recommendations:**

| Strategy | Implementation | Trade-off |
|----------|----------------|-----------|
| **Always show truncated name** | Remove zoom threshold | More visual clutter at low zoom |
| **Fit name inside node** | For larger nodes, place 2-3 word truncation inside | Requires larger minimum node size |
| **Smart truncation** | First name only for persons, acronym for companies | More readable, some info loss |
| **Two-tier approach** | Icon inside, short label below (current) | Good balance |

**Recommended Truncation Strategy:**
```typescript
const truncateForBubble = (value: string, type: string): string => {
  if (type === 'person') {
    // "John Smith" -> "John S."
    const parts = value.split(' ');
    if (parts.length > 1) {
      return `${parts[0]} ${parts[1][0]}.`;
    }
    return value.slice(0, 10);
  }
  // Default: 12 chars max
  return value.length > 12 ? value.slice(0, 11) + '...' : value;
};
```

**Node Size Adjustment:**
- Increase minimum radius from current `sqrt(4) * 4 = 8` to `12-15px` to accommodate text
- Consider `radius = Math.sqrt(Math.max(6, connectionCount * 2)) * 5`

### 4.2 Tooltip Content on Hover

**Current Issue:** Basic tooltip shows "Name (type)". Sidebar requires click.

**Recommended Tooltip Content:**
```typescript
const getTooltipContent = (node: GraphNode) => {
  const connections = getNodeEdges(node.id);
  const topRelationships = connections.slice(0, 3)
    .map(e => e.type.replace(/_/g, ' '));

  return `
    ${node.value}
    Type: ${node.type}
    Connections: ${node.connectionCount}
    ${topRelationships.length ? `Top: ${topRelationships.join(', ')}` : ''}
  `;
};
```

**Alternative: HTML Tooltip (Knowledge Card)**
- Use a small overlay card on hover
- Show entity name, type icon, connection count, top 3 relationships
- Similar to GitHub user hover cards

### 4.3 Visual Distinction for Relationship Types

**Recommendation: Category-based Color + Style Encoding**

```typescript
const RELATIONSHIP_CATEGORIES = {
  professional: {
    types: ['WORKS_WITH', 'REPORTS_TO', 'WORKS_FOR', 'LEADS', 'WORKS_ON', 'EXPERT_IN'],
    color: '#3b82f6',  // Blue
    style: 'solid',
    dashArray: undefined,
  },
  business: {
    types: ['PARTNERS_WITH', 'COMPETES_WITH', 'OWNS'],
    color: '#22c55e',  // Green
    style: 'solid',
    dashArray: undefined,
  },
  structural: {
    types: ['RELATED_TO', 'DEPENDS_ON', 'PART_OF', 'SUBTOPIC_OF', 'ASSOCIATED_WITH'],
    color: '#6b7280',  // Gray
    style: 'dashed',
    dashArray: '5,5',
  },
  geographic: {
    types: ['LOCATED_IN'],
    color: '#a855f7',  // Purple
    style: 'dotted',
    dashArray: '2,3',
  },
};

const getRelationshipCategory = (type: string) => {
  for (const [category, config] of Object.entries(RELATIONSHIP_CATEGORIES)) {
    if (config.types.includes(type)) return { category, ...config };
  }
  return { category: 'other', color: '#9ca3af', style: 'solid' };
};
```

**Link Rendering Update:**
```typescript
// In ForceGraph2D props:
linkColor={(link: any) => getRelationshipCategory(link.type).color}
linkLineDash={(link: any) => getRelationshipCategory(link.type).dashArray}
```

**Alternative: Hierarchical vs Peer Distinction**
- Solid lines: Hierarchical (REPORTS_TO, LEADS, PART_OF, SUBTOPIC_OF)
- Dashed lines: Peer relationships (WORKS_WITH, PARTNERS_WITH, RELATED_TO)
- Dotted lines: Weak/inferred (ASSOCIATED_WITH, EXPERT_IN)

### 4.4 Additional Recommendations

1. **Add Legend for Relationship Types**: Extend current entity type legend to include relationship line styles/colors

2. **Interactive Filtering**: Allow clicking relationship type in legend to highlight/filter those edges

3. **Confidence Encoding**:
   - Current: Line width based on confidence
   - Enhanced: Add opacity (low confidence = more transparent)

4. **Edge Labels**: Option to show relationship type on edge midpoint (toggle-able to reduce clutter)

---

## 5. Implementation Priority

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| **High** | Relationship type coloring | Low | High |
| **High** | Improved truncation for names | Low | Medium |
| **Medium** | Enhanced tooltips | Medium | Medium |
| **Medium** | Relationship legend | Low | Medium |
| **Low** | HTML knowledge cards | High | High |
| **Low** | Edge labels | Medium | Low |

---

## Sources

- [yFiles: Guide to Visualizing Knowledge Graphs](https://www.yfiles.com/resources/how-to/guide-to-visualizing-knowledge-graphs)
- [Datavid: Knowledge Graph Visualization Guide](https://datavid.com/blog/knowledge-graph-visualization)
- [Microsoft GraphRAG: Visualization Guide](https://microsoft.github.io/graphrag/visualization_guide/)
- [FalkorDB: Knowledge Graph Visualization Insights](https://www.falkordb.com/blog/knowledge-graph-visualization-insights/)
- [Highcharts: Network Graph Visualization Tutorial](https://www.highcharts.com/blog/tutorials/network-graph-visualization-exploring-data-relationships/)
- [MyHeritage: Relationship Diagrams and Color Coding](https://education.myheritage.com/article/visualizing-family-relationships-with-relationship-diagrams-and-color-coding/)
- [Cambridge Intelligence: Customize Graph Visualization with D3](https://cambridge-intelligence.com/customize-graph-visualization-d3-keylines/)
