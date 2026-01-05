# Admin UI Documentation

## Overview

The Admin UI provides monitoring and control capabilities for the Izzie2 ingestion pipeline. It allows administrators to:

- Monitor email and Drive sync status
- View knowledge graph statistics
- Manually trigger sync operations
- Reset sync state when needed

## Access

The admin dashboard is available at:
```
http://localhost:3300/admin/ingestion
```

**Authentication Required**: All `/admin` routes are protected and require authentication via the application's auth system.

## Features

### 1. Status Cards

Two status cards display real-time sync information:

#### Email Ingestion Card
- **Last Sync**: Timestamp of the most recent email sync
- **Items Processed**: Total number of emails processed
- **Status**: Active/Error/Not Started indicator
- **Errors**: Displays any recent errors with details

#### Drive Ingestion Card
- **Last Sync**: Timestamp of the most recent Drive sync
- **Items Processed**: Total number of files processed
- **Status**: Active/Error/Not Started indicator
- **Errors**: Displays any recent errors with details

### 2. Knowledge Graph Statistics

Displays metrics from the Neo4j graph database:

- **Total Nodes**: Count of all entities in the graph
- **Total Relationships**: Count of all connections between entities
- **Nodes by Type**: Breakdown of nodes (Person, Company, Project, Topic, etc.)
- **Relationships by Type**: Breakdown of relationships (WORKS_WITH, MENTIONED_IN, etc.)

### 3. Manual Controls

Three action buttons for pipeline control:

#### Sync Email Now
- Triggers immediate email sync from Gmail
- Processes new emails since last sync
- Uses incremental sync with history tokens
- Confirmation dialog required

#### Sync Drive Now
- Triggers immediate Drive file sync
- Processes new/modified files since last sync
- Uses page tokens for incremental sync
- Confirmation dialog required

#### Reset Sync State
- **Danger operation**: Clears all sync progress
- Forces full re-sync on next run
- Double confirmation required
- Use only when sync state is corrupted

### 4. Auto-Refresh

The dashboard automatically refreshes every 10 seconds to display:
- Updated sync status
- Latest graph statistics
- Current timestamp in top-right corner

## Architecture

### Components

```
src/
├── app/admin/ingestion/
│   └── page.tsx              # Main dashboard page
└── components/admin/
    ├── StatusCard.tsx        # Sync status display
    ├── GraphStats.tsx        # Graph statistics display
    └── ControlButton.tsx     # Action button with loading state
```

### API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ingestion/status` | GET | Fetch sync status for email and Drive |
| `/api/ingestion/sync-emails` | POST | Trigger manual email sync |
| `/api/ingestion/sync-drive` | POST | Trigger manual Drive sync |
| `/api/ingestion/reset` | POST | Reset sync state |
| `/api/graph/test` | GET | Fetch graph statistics |

### Data Flow

1. **Initial Load**:
   - Dashboard fetches ingestion status
   - Dashboard fetches graph statistics
   - Displays in UI with loading states

2. **Auto-Refresh**:
   - Every 10 seconds, re-fetch both status and stats
   - Update UI without full page reload
   - Display last update timestamp

3. **Manual Actions**:
   - User clicks action button
   - Show confirmation dialog
   - Make API call with loading state
   - Wait 2 seconds for processing
   - Refresh dashboard data
   - Show success/error alert

## Implementation Details

### Client-Side State Management

The dashboard uses React hooks for state:

```typescript
const [status, setStatus] = useState<IngestionStatus | null>(null);
const [graphStats, setGraphStats] = useState<GraphStatsData | null>(null);
const [isLoadingStatus, setIsLoadingStatus] = useState(true);
const [isLoadingStats, setIsLoadingStats] = useState(true);
const [isSyncingEmail, setIsSyncingEmail] = useState(false);
const [isSyncingDrive, setIsSyncingDrive] = useState(false);
const [isResetting, setIsResetting] = useState(false);
const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
```

### Polling Implementation

```typescript
useEffect(() => {
  const interval = setInterval(() => {
    fetchStatus();
    fetchGraphStats();
  }, 10000); // 10 seconds

  return () => clearInterval(interval);
}, []);
```

### Error Handling

- API errors are caught and logged to console
- User-facing errors shown via alert dialogs
- Status cards display error state with details
- Failed operations don't crash the UI

## Security

### Authentication

- All `/admin` routes protected via middleware
- Requires valid session from Better Auth
- Unauthenticated users redirected to sign-in
- Session checked on every request

### Authorization

Currently, all authenticated users can access admin features. For production:

**TODO**: Add role-based access control (RBAC)
- Check user role in middleware
- Only allow admin users to access `/admin` routes
- Display 403 Forbidden for non-admin users

### CSRF Protection

- POST requests should include CSRF tokens (future enhancement)
- Currently relies on same-origin policy

## Monitoring

### Success Indicators

- Status cards show "Active" badge
- Recent sync timestamps
- Growing item counts
- No errors displayed

### Warning Signs

- "Error" badge on status cards
- Stale sync timestamps (hours/days old)
- Zero items processed
- Error messages in status cards

### Common Issues

1. **Sync Not Running**
   - Check API endpoints are accessible
   - Verify Google OAuth credentials
   - Check console for errors

2. **Graph Stats Empty**
   - Verify Neo4j connection
   - Check graph database has data
   - Review graph build logs

3. **Auto-Refresh Not Working**
   - Check browser console for errors
   - Verify API endpoints responding
   - Try manual refresh

## Development

### Running Locally

```bash
# Start development server
npm run dev

# Navigate to admin dashboard
open http://localhost:3300/admin/ingestion
```

### Testing

```bash
# Test API endpoints manually
curl http://localhost:3300/api/ingestion/status

# Trigger sync
curl -X POST http://localhost:3300/api/ingestion/sync-emails

# Check graph stats
curl http://localhost:3300/api/graph/test
```

### Styling

The UI uses inline styles for simplicity:
- No Tailwind CSS dependency
- Self-contained components
- Responsive grid layouts
- Consistent color scheme

To customize:
- Modify inline styles in components
- Colors: Primary (#2563eb), Danger (#dc2626), Gray (#6b7280)
- Spacing: rem units for consistency

## Future Enhancements

### Phase 1 (Current)
- ✅ Basic status monitoring
- ✅ Manual sync controls
- ✅ Graph statistics
- ✅ Auto-refresh

### Phase 2
- [ ] Role-based access control
- [ ] Detailed error logs with stack traces
- [ ] Sync history timeline
- [ ] Performance metrics charts

### Phase 3
- [ ] Real-time updates via WebSockets/SSE
- [ ] Scheduled sync configuration
- [ ] Email notification on errors
- [ ] Advanced filtering and search

### Phase 4
- [ ] Multi-user support with permissions
- [ ] Audit logs for admin actions
- [ ] Export data to CSV/JSON
- [ ] Dashboard customization

## Related Documentation

- [Ingestion Pipeline](./INGESTION_PIPELINE.md)
- [API Reference](./API_REFERENCE.md)
- [Authentication](./AUTH.md)
- [Knowledge Graph](./KNOWLEDGE_GRAPH.md)

## Changelog

### 2025-01-05 - Initial Release
- Created admin dashboard
- Added status monitoring for email and Drive
- Implemented graph statistics display
- Added manual sync controls
- Protected admin routes with authentication
