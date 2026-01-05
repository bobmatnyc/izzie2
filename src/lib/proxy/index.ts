/**
 * Proxy Mode - Main Exports
 * Central export point for all proxy authorization functionality
 */

// Authorization service
export {
  grantAuthorization,
  checkAuthorization,
  revokeAuthorization,
  getUserAuthorizations,
  getAuthorization,
} from './authorization-service';

// Audit service
export {
  logProxyAction,
  getAuditLog,
  getAuditEntry,
  getAuditStats,
  getRecentFailures,
} from './audit-service';

// Middleware
export { withProxyAuthorization } from './middleware';
export type { ProxyActionParams, ProxyContext } from './middleware';

// Types
export type {
  OperatingMode,
  PersonaContext,
  AuthorizationScope,
  GrantMethod,
  ProxyActionClass,
  ActionType,
  AuthorizationConditions,
  GrantAuthorizationParams,
  CheckAuthorizationParams,
  CheckAuthorizationResult,
  LogProxyActionParams,
  ProxyActionRequest,
  AuditLogQueryOptions,
} from './types';

export {
  TOOL_ACCESS_MATRIX,
  CONFIDENCE_THRESHOLDS,
  REQUIRES_CONFIRMATION,
} from './types';
