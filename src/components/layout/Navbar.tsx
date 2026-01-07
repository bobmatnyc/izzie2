/**
 * Navigation Bar Component
 * Main navigation for authenticated dashboard pages
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { useState } from 'react';

interface NavbarProps {
  user?: {
    name?: string;
    email?: string;
  };
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', exact: true },
    { href: '/dashboard/entities', label: 'Entities' },
    { href: '/dashboard/chat', label: 'Chat' },
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <nav
      style={{
        backgroundColor: '#fff',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '0 1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            height: '64px',
          }}
        >
          {/* Logo */}
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '1.25rem',
              fontWeight: '700',
              color: '#111',
              textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>🤖</span>
            <span>Izzie</span>
          </Link>

          {/* Desktop Navigation */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2rem',
            }}
            className="desktop-nav"
          >
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link ${isActive(link.href, link.exact) ? 'nav-link-active' : ''}`}
                style={{
                  fontSize: '0.875rem',
                  fontWeight: isActive(link.href, link.exact) ? '600' : '500',
                  color: isActive(link.href, link.exact) ? '#6366f1' : '#6b7280',
                  textDecoration: 'none',
                  padding: '0.5rem 0',
                  borderBottom: isActive(link.href, link.exact)
                    ? '2px solid #6366f1'
                    : '2px solid transparent',
                  transition: 'color 0.2s, border-color 0.2s',
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* User Menu */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}
            className="desktop-nav"
          >
            {user && (
              <div
                style={{
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  textAlign: 'right',
                }}
              >
                <div style={{ fontWeight: '500', color: '#374151' }}>
                  {user.name || user.email}
                </div>
              </div>
            )}
            <SignOutButton variant="minimal" />
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              display: 'none',
              padding: '0.5rem',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              fontSize: '1.5rem',
              color: '#374151',
            }}
            className="mobile-menu-button"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div
            style={{
              display: 'none',
              paddingBottom: '1rem',
              borderTop: '1px solid #e5e7eb',
              marginTop: '-1px',
            }}
            className="mobile-nav"
          >
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  display: 'block',
                  padding: '0.75rem 0',
                  fontSize: '0.875rem',
                  fontWeight: isActive(link.href, link.exact) ? '600' : '500',
                  color: isActive(link.href, link.exact) ? '#6366f1' : '#6b7280',
                  textDecoration: 'none',
                  borderLeft: isActive(link.href, link.exact)
                    ? '3px solid #6366f1'
                    : '3px solid transparent',
                  paddingLeft: '1rem',
                }}
              >
                {link.label}
              </Link>
            ))}
            <div
              style={{
                paddingTop: '0.75rem',
                marginTop: '0.75rem',
                borderTop: '1px solid #e5e7eb',
              }}
            >
              {user && (
                <div
                  style={{
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    marginBottom: '0.75rem',
                  }}
                >
                  {user.name || user.email}
                </div>
              )}
              <SignOutButton variant="minimal" />
            </div>
          </div>
        )}
      </div>

      {/* Responsive Styles */}
      <style jsx global>{`
        /* Hover effect for nav links (only when not active) */
        .nav-link:not(.nav-link-active):hover {
          color: #374151 !important;
        }

        @media (min-width: 768px) {
          .desktop-nav {
            display: flex !important;
          }
          .mobile-menu-button {
            display: none !important;
          }
          .mobile-nav {
            display: none !important;
          }
        }
        @media (max-width: 767px) {
          .desktop-nav {
            display: none !important;
          }
          .mobile-menu-button {
            display: block !important;
          }
          .mobile-nav {
            display: block !important;
          }
        }
      `}</style>
    </nav>
  );
}
