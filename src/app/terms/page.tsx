import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service - Izzie',
  description: 'Terms of Service for Izzie AI Personal Assistant',
};

/**
 * Terms of Service Page
 * Required for OAuth applications (Google, GitHub)
 */
export default function TermsOfServicePage() {
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
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
          <p className="text-slate-500">Last updated: {lastUpdated}</p>
        </div>

        {/* Content */}
        <div className="prose prose-slate max-w-none">
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">1. Agreement to Terms</h2>
            <p className="text-slate-600 mb-4">
              By accessing or using Izzie (&quot;the Service&quot;), you agree to be bound by these
              Terms of Service. If you do not agree to these terms, please do not use the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">2. Description of Service</h2>
            <p className="text-slate-600 mb-4">
              Izzie is a personal AI assistant that provides:
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-2">
              <li>AI-powered email analysis and summarization</li>
              <li>Intelligent information extraction and organization</li>
              <li>Natural language interaction for email management</li>
              <li>Integration with Google and GitHub services</li>
              <li>Personal knowledge management features</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">3. User Accounts</h2>
            <p className="text-slate-600 mb-4">
              To use the Service, you must:
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-2">
              <li>Sign in with a valid Google or GitHub account</li>
              <li>Provide accurate and complete information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Notify us immediately of any unauthorized access</li>
            </ul>
            <p className="text-slate-600 mt-4">
              You are responsible for all activities that occur under your account.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">4. User Responsibilities</h2>
            <p className="text-slate-600 mb-4">You agree to:</p>
            <ul className="list-disc list-inside text-slate-600 space-y-2">
              <li>Use the Service only for lawful purposes</li>
              <li>Not use the Service to send spam or unsolicited messages</li>
              <li>Not attempt to access other users&apos; accounts or data</li>
              <li>Not interfere with or disrupt the Service</li>
              <li>Not reverse engineer or attempt to extract source code</li>
              <li>Comply with all applicable laws and regulations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">5. Acceptable Use</h2>
            <p className="text-slate-600 mb-4">
              You may not use the Service to:
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-2">
              <li>Violate any laws or regulations</li>
              <li>Infringe on intellectual property rights</li>
              <li>Transmit malware or malicious content</li>
              <li>Harass, abuse, or harm others</li>
              <li>Generate content that is illegal, harmful, or offensive</li>
              <li>Attempt to bypass security measures or rate limits</li>
              <li>Use automated systems to access the Service excessively</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">6. AI Limitations and Disclaimers</h2>
            <p className="text-slate-600 mb-4">
              You acknowledge that:
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-2">
              <li>AI-generated content may contain errors or inaccuracies</li>
              <li>The Service should not be relied upon for critical decisions without verification</li>
              <li>AI responses are not professional advice (legal, medical, financial, etc.)</li>
              <li>We do not guarantee the accuracy, completeness, or reliability of AI outputs</li>
              <li>You are responsible for reviewing and verifying any AI-generated content before use</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">7. Intellectual Property</h2>
            <p className="text-slate-600 mb-4">
              The Service, including its original content, features, and functionality, is owned
              by Izzie and is protected by copyright, trademark, and other intellectual property laws.
            </p>
            <p className="text-slate-600 mb-4">
              You retain ownership of any content you provide to the Service. By using the Service,
              you grant us a limited license to process your content solely for the purpose of
              providing the Service to you.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">8. Privacy</h2>
            <p className="text-slate-600 mb-4">
              Your use of the Service is also governed by our{' '}
              <Link href="/privacy" className="text-blue-600 hover:underline">
                Privacy Policy
              </Link>
              , which describes how we collect, use, and protect your information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">9. Service Modifications</h2>
            <p className="text-slate-600 mb-4">
              We reserve the right to modify, suspend, or discontinue the Service at any time,
              with or without notice. We will not be liable to you or any third party for any
              modification, suspension, or discontinuation of the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">10. Disclaimer of Warranties</h2>
            <p className="text-slate-600 mb-4">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES
              OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES
              OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p className="text-slate-600 mb-4">
              We do not warrant that the Service will be uninterrupted, secure, or error-free,
              or that any defects will be corrected.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">11. Limitation of Liability</h2>
            <p className="text-slate-600 mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS
              OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE,
              GOODWILL, OR OTHER INTANGIBLE LOSSES RESULTING FROM YOUR USE OF THE SERVICE.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">12. Termination</h2>
            <p className="text-slate-600 mb-4">
              We may terminate or suspend your access to the Service immediately, without prior
              notice or liability, for any reason, including if you breach these Terms.
            </p>
            <p className="text-slate-600 mb-4">
              You may terminate your account at any time by disconnecting your OAuth accounts
              and requesting account deletion through your account settings.
            </p>
            <p className="text-slate-600 mb-4">
              Upon termination, your right to use the Service will cease immediately. Provisions
              of these Terms that by their nature should survive termination shall survive.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">13. Governing Law</h2>
            <p className="text-slate-600 mb-4">
              These Terms shall be governed by and construed in accordance with the laws of
              the jurisdiction in which we operate, without regard to conflict of law principles.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">14. Changes to Terms</h2>
            <p className="text-slate-600 mb-4">
              We reserve the right to modify these Terms at any time. We will provide notice of
              significant changes by posting the updated terms on this page and updating the
              &quot;Last updated&quot; date. Your continued use of the Service after changes
              constitutes acceptance of the modified terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">15. Contact Us</h2>
            <p className="text-slate-600 mb-4">
              If you have any questions about these Terms of Service, please contact us at:
            </p>
            <p className="text-slate-600">
              Email: <a href="mailto:legal@izzie.app" className="text-blue-600 hover:underline">legal@izzie.app</a>
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-slate-200">
          <div className="flex flex-wrap gap-4 text-sm text-slate-500">
            <Link href="/privacy" className="hover:text-slate-700 transition-colors">
              Privacy Policy
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
