/**
 * Next.js Middleware
 * Protects routes that require authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * Protected route patterns
 * Add any routes that require authentication
 */
const PROTECTED_ROUTES = ['/dashboard', '/calendar', '/profile'];

/**
 * Public routes that should not be protected
 */
const PUBLIC_ROUTES = ['/', '/api/auth', '/sign-in', '/sign-up'];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check if route is protected
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Check if route is public
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route)
  );

  // Allow public routes
  if (isPublicRoute || !isProtectedRoute) {
    return NextResponse.next();
  }

  // Check authentication for protected routes
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      // Not authenticated - redirect to sign-in
      const signInUrl = new URL('/api/auth/sign-in/google', request.url);
      signInUrl.searchParams.set('callbackURL', pathname);
      return NextResponse.redirect(signInUrl);
    }

    // Authenticated - allow access
    return NextResponse.next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    // On error, redirect to sign-in
    const signInUrl = new URL('/api/auth/sign-in/google', request.url);
    signInUrl.searchParams.set('callbackURL', pathname);
    return NextResponse.redirect(signInUrl);
  }
}

/**
 * Configure which routes to run middleware on
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
