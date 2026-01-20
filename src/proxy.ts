/**
 * Next.js Proxy (formerly Middleware)
 * Protects routes that require authentication
 * Redirects authenticated users away from auth pages
 *
 * Migrated from middleware.ts to proxy.ts for Next.js 16 compatibility
 * Reference: https://nextjs.org/docs/messages/middleware-to-proxy
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * Protected route patterns - require authentication
 */
const PROTECTED_ROUTES = ['/dashboard', '/calendar', '/profile', '/admin'];

/**
 * Auth routes - redirect to dashboard if already authenticated
 */
const AUTH_ROUTES = ['/login', '/sign-in', '/sign-up'];

/**
 * Public routes that bypass auth checks entirely
 */
const PUBLIC_ROUTES = ['/api/auth'];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Allow API auth routes without checks
  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    pathname.startsWith(route)
  );
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Check if route is protected or auth route
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route);

  // If neither protected nor auth route, allow through
  if (!isProtectedRoute && !isAuthRoute) {
    return NextResponse.next();
  }

  // Check authentication
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    const isAuthenticated = !!session?.user;

    // Protected routes: redirect to login if not authenticated
    if (isProtectedRoute && !isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackURL', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Auth routes: redirect to dashboard if already authenticated
    if (isAuthRoute && isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Allow access
    return NextResponse.next();
  } catch (error) {
    console.error('Auth proxy error:', error);
    // On error for protected routes, redirect to login
    if (isProtectedRoute) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackURL', pathname);
      return NextResponse.redirect(loginUrl);
    }
    // For auth routes on error, allow through (let client handle)
    return NextResponse.next();
  }
}

/**
 * Configure which routes to run proxy on
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
