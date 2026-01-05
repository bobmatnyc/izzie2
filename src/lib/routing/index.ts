/**
 * Event Routing Module
 * Exports all routing functionality
 */

// Core types
export type {
  EventCategory,
  RouteConfig,
  RouteCondition,
  RoutingDecision,
  DispatchResult,
  EventHandler,
  HandlerResult,
  ClassifiedEvent,
} from './types';

// Registry
export {
  HandlerRegistry,
  defaultHandlers,
  getDefaultHandler,
  getRegistry,
  resetRegistry,
} from './registry';

// Rules engine
export {
  RoutingRules,
  DEFAULT_RULES,
  getHandlerForCategory,
} from './rules';

// Dispatcher
export {
  EventDispatcher,
  createDispatcher,
} from './dispatcher';

// Handlers
export {
  SchedulerHandler,
  NotifierHandler,
  OrchestratorHandler,
  createDefaultHandlers,
} from './handlers';
