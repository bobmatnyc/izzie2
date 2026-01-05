# Admin Components

Reusable UI components for the admin dashboard.

## Components

### StatusCard

Displays sync status for email or Drive ingestion.

**Props:**
```typescript
interface StatusCardProps {
  title: string;                 // Card title
  source: 'gmail' | 'drive';    // Data source
  status: {                     // Status data
    lastSyncTime?: Date | string | null;
    itemsProcessed?: number | null;
    lastError?: string | null;
    updatedAt?: Date | string | null;
  } | null;
  isLoading?: boolean;           // Loading state
}
```

**Usage:**
```tsx
<StatusCard
  title="Email Ingestion"
  source="gmail"
  status={gmailStatus}
  isLoading={isLoading}
/>
```

**Features:**
- Status badge (Active/Error/Not Started)
- Last sync timestamp with relative time
- Items processed count
- Error display with styling
- Loading state

### GraphStats

Displays Neo4j knowledge graph statistics.

**Props:**
```typescript
interface GraphStatsProps {
  stats: {
    nodeCount: number;
    relationshipCount: number;
    nodesByType: Record<string, number>;
    relationshipsByType: Record<string, number>;
  } | null;
  isLoading?: boolean;
}
```

**Usage:**
```tsx
<GraphStats stats={graphStats} isLoading={isLoading} />
```

**Features:**
- Total nodes and relationships
- Breakdown by type
- Sorted by count (descending)
- Loading state

### ControlButton

Action button with loading state and variants.

**Props:**
```typescript
interface ControlButtonProps {
  children: React.ReactNode;      // Button content
  onClick: () => void;            // Click handler
  isLoading?: boolean;            // Loading state
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;             // Disabled state
}
```

**Usage:**
```tsx
<ControlButton
  onClick={handleSync}
  isLoading={isSyncing}
  variant="primary"
>
  Sync Now
</ControlButton>
```

**Features:**
- Three color variants
- Loading spinner
- Disabled state
- Hover effects

## Styling

Components use inline styles for:
- No external dependencies
- Self-contained components
- Easy customization
- Consistent theming

**Color Palette:**
- Primary: `#2563eb` (Blue)
- Danger: `#dc2626` (Red)
- Success: `#166534` (Green)
- Gray: `#6b7280`
- Light Gray: `#f3f4f6`

## Development

### Adding New Components

1. Create component file in `src/components/admin/`
2. Export from component file
3. Document props interface
4. Add usage example
5. Update this README

### Testing

Components are client-side ("use client"):
```tsx
'use client';

export function MyComponent() {
  // Component code
}
```

### Best Practices

- Keep components small and focused
- Use TypeScript interfaces for props
- Include loading states
- Handle null/undefined data
- Provide clear error states
