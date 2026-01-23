import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - Izzie',
  description: 'Privacy Policy for Izzie AI Personal Assistant',
};

/**
 * Privacy Policy Page
 * Required for OAuth applications (Google, GitHub)
 */
export default function PrivacyPolicyPage() {
  const lastUpdated = 'January 23, 2026';

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-blue-50" />
      <div
        className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.3) 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }}
      />

      {/* Content */}
      <div className="relative z-10 max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-6"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Izzie
          </Link>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
          <p className="text-slate-500">Last updated: {lastUpdated}</p>
        </div>

        {/* Content */}
        <div className="prose prose-slate max-w-none">
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Introduction</h2>
            <p className="text-slate-600 mb-4">
              Izzie (&quot;we&quot;, &quot;our&quot;, or &quot;the Service&quot;) is a personal AI assistant
              that helps you manage your email and digital information. This Privacy Policy explains how
              we collect, use, and protect your information when you use our Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Information We Collect</h2>

            <h3 className="text-lg font-medium text-slate-800 mb-2">Account Information</h3>
            <p className="text-slate-600 mb-4">
              When you sign in with Google or GitHub OAuth, we receive your name, email address, and
              profile picture. We use this to create and manage your account.
            </p>

            <h3 className="text-lg font-medium text-slate-800 mb-2">Email Content</h3>
            <p className="text-slate-600 mb-4">
              With your permission, we access your Gmail messages to provide AI-powered email
              intelligence features. This includes reading email subjects, bodies, and metadata
              to help you organize, summarize, and respond to messages.
            </p>

            <h3 className="text-lg font-medium text-slate-800 mb-2">GitHub Data</h3>
            <p className="text-slate-600 mb-4">
              If you connect your GitHub account, we may access your repositories, issues, and
              notifications to provide integrated project management features.
            </p>

            <h3 className="text-lg font-medium text-slate-800 mb-2">Usage Data</h3>
            <p className="text-slate-600 mb-4">
              We collect information about how you use the Service, including features accessed,
              queries made, and interactions with the AI assistant.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">How We Use Your Information</h2>
            <ul className="list-disc list-inside text-slate-600 space-y-2">
              <li>To provide AI-powered email analysis and assistance</li>
              <li>To personalize your experience based on your preferences</li>
              <li>To extract and organize important information from your emails</li>
              <li>To generate insights and summaries for your review</li>
              <li>To improve our Service and develop new features</li>
              <li>To communicate with you about your account and updates</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Data Storage and Security</h2>
            <p className="text-slate-600 mb-4">
              Your data is stored securely using industry-standard encryption. We implement
              appropriate technical and organizational measures to protect your personal information
              against unauthorized access, alteration, disclosure, or destruction.
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-2">
              <li>All data is encrypted at rest and in transit</li>
              <li>Your data is stored separately from other users</li>
              <li>We use secure OAuth protocols for authentication</li>
              <li>Access to your data is strictly controlled and monitored</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Third-Party Services</h2>
            <p className="text-slate-600 mb-4">
              We use the following third-party services to provide our features:
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-2">
              <li><strong>Google OAuth:</strong> For secure authentication and Gmail access</li>
              <li><strong>GitHub OAuth:</strong> For authentication and repository access</li>
              <li><strong>OpenAI/Anthropic:</strong> For AI processing and natural language understanding</li>
            </ul>
            <p className="text-slate-600 mt-4">
              These services have their own privacy policies. When we send data to AI providers,
              we only send the minimum information necessary to provide the requested features.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Your Rights</h2>
            <p className="text-slate-600 mb-4">You have the right to:</p>
            <ul className="list-disc list-inside text-slate-600 space-y-2">
              <li><strong>Access:</strong> Request a copy of your personal data</li>
              <li><strong>Delete:</strong> Request deletion of your account and all associated data</li>
              <li><strong>Export:</strong> Download your data in a portable format</li>
              <li><strong>Revoke Access:</strong> Disconnect your Google or GitHub accounts at any time</li>
              <li><strong>Opt-out:</strong> Choose which features access your data</li>
            </ul>
            <p className="text-slate-600 mt-4">
              To exercise these rights, please contact us at the email address below or use the
              settings in your account dashboard.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Data Retention</h2>
            <p className="text-slate-600 mb-4">
              We retain your data for as long as your account is active. If you delete your account,
              we will delete your personal data within 30 days, except where we are required to
              retain it for legal purposes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Changes to This Policy</h2>
            <p className="text-slate-600 mb-4">
              We may update this Privacy Policy from time to time. We will notify you of any
              significant changes by posting the new policy on this page and updating the
              &quot;Last updated&quot; date.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Contact Us</h2>
            <p className="text-slate-600 mb-4">
              If you have any questions about this Privacy Policy or our data practices, please
              contact us at:
            </p>
            <p className="text-slate-600">
              Email: <a href="mailto:privacy@izzie.app" className="text-blue-600 hover:underline">privacy@izzie.app</a>
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-slate-200">
          <div className="flex flex-wrap gap-4 text-sm text-slate-500">
            <Link href="/terms" className="hover:text-slate-700 transition-colors">
              Terms of Service
            </Link>
            <span className="text-slate-300">|</span>
            <Link href="/" className="hover:text-slate-700 transition-colors">
              Back to Izzie
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
