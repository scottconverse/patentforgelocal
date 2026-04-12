import { useState } from 'react';

const DISCLAIMER_KEY = 'patentforge_disclaimer_accepted';

export default function DisclaimerModal() {
  // Lazy initializer — reads localStorage once on mount, avoids a useEffect setState cycle
  const [show, setShow] = useState(() => !localStorage.getItem(DISCLAIMER_KEY));

  function handleAccept() {
    localStorage.setItem(DISCLAIMER_KEY, new Date().toISOString());
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
    >
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6">
        <h2 id="disclaimer-title" className="text-xl font-bold text-gray-100 mb-4">
          Terms of Use
        </h2>

        <div className="text-sm text-gray-300 space-y-3 mb-6 max-h-80 overflow-y-auto pr-2">
          <p className="font-semibold text-gray-100">
            PatentForge is a research and preparation tool. It is not a legal service.
          </p>

          <p>By using this software, you acknowledge and agree that:</p>

          <ul className="list-disc ml-5 space-y-2">
            <li>
              PatentForge <strong className="text-gray-100">does not provide legal advice</strong>, patent opinions, or
              attorney services. The output is AI-generated research intended to help you prepare for consultation with
              a registered patent attorney or patent agent.
            </li>
            <li>
              The AI-generated analysis <strong className="text-gray-100">may contain errors</strong>, miss relevant
              prior art, or mischaracterize legal requirements. All findings must be independently verified by a
              qualified patent professional before being relied upon.
            </li>
            <li>
              You are using <strong className="text-gray-100">your own third-party AI account</strong> (Anthropic API).
              PatentForge routes your requests to that service on your behalf. You are responsible for reviewing the AI
              provider's terms of service.
            </li>
            <li>
              Decisions about whether to file a patent application should{' '}
              <strong className="text-gray-100">always be made with qualified legal counsel</strong>.
            </li>
            <li>
              This software is provided <strong className="text-gray-100">"as is"</strong> without warranty of any kind,
              as described in the MIT License.
            </li>
          </ul>
        </div>

        <button
          onClick={handleAccept}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm"
        >
          I Understand and Agree
        </button>
      </div>
    </div>
  );
}
