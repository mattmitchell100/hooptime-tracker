import React, { useEffect, useState } from 'react';

type AuthModalProps = {
  isOpen: boolean;
  isEnabled: boolean;
  onClose: () => void;
  onGoogleSignIn: () => Promise<void>;
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (email: string, password: string) => Promise<void>;
};

type AuthMode = 'signIn' | 'signUp';

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
};

const GoogleLogo = () => (
  <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.72 1.22 9.22 3.6l6.84-6.84C35.9 2.38 30.3 0 24 0 14.6 0 6.49 5.38 2.56 13.22l7.98 6.19C12.43 13.22 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.5 24.5c0-1.64-.15-3.22-.43-4.75H24v9h12.68c-.55 2.97-2.2 5.49-4.68 7.18l7.25 5.63C43.3 37.3 46.5 31.4 46.5 24.5z"
    />
    <path
      fill="#FBBC05"
      d="M10.54 28.59c-.5-1.49-.78-3.08-.78-4.69s.28-3.2.78-4.69l-7.98-6.19C.92 16.45 0 20.12 0 24c0 3.88.92 7.55 2.56 10.98l7.98-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.3 0 11.6-2.08 15.46-5.63l-7.25-5.63c-2.02 1.36-4.6 2.16-8.21 2.16-6.26 0-11.57-3.72-13.46-8.91l-7.98 6.19C6.49 42.62 14.6 48 24 48z"
    />
  </svg>
);

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  isEnabled,
  onClose,
  onGoogleSignIn,
  onEmailSignIn,
  onEmailSignUp
}) => {
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMode('signIn');
    setEmail('');
    setPassword('');
    setErrorMessage(null);
    setIsWorking(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGoogle = async () => {
    if (!isEnabled || isWorking) return;
    setIsWorking(true);
    setErrorMessage(null);
    try {
      await onGoogleSignIn();
      onClose();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsWorking(false);
    }
  };

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isEnabled || isWorking) return;
    setIsWorking(true);
    setErrorMessage(null);
    try {
      if (mode === 'signIn') {
        await onEmailSignIn(email, password);
      } else {
        await onEmailSignUp(email, password);
      }
      onClose();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsWorking(false);
    }
  };

  const isSubmitDisabled = !email || !password || !isEnabled || isWorking;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-sm p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-oswald text-white uppercase italic">
              {mode === 'signIn' ? 'Sign In' : 'Create Account'}
            </h2>
            <p className="text-slate-400 text-sm">Sync past games across devices.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-200">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!isEnabled && (
          <div className="mb-6 rounded-2xl border border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-400">
            Add your Supabase keys to <span className="text-slate-200">.env.local</span> (VITE_SUPABASE_URL and
            VITE_SUPABASE_ANON_KEY) and restart the dev server to enable sign in.
          </div>
        )}

        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={!isEnabled || isWorking}
            className={`w-full py-3 rounded-xl font-bold uppercase tracking-wide text-sm transition-colors flex items-center justify-center gap-3 ${
              isEnabled ? 'bg-white text-slate-900 hover:bg-slate-200' : 'bg-slate-800 text-slate-500'
            }`}
          >
            <GoogleLogo />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-slate-500">
            <div className="flex-1 h-px bg-slate-700"></div>
            <span>or</span>
            <div className="flex-1 h-px bg-slate-700"></div>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@team.com"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-semibold outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-semibold outline-none focus:border-orange-500"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className={`w-full py-3 rounded-xl font-bold uppercase tracking-wide text-sm transition-colors ${
                isSubmitDisabled ? 'bg-slate-800 text-slate-500' : 'bg-orange-600 hover:bg-orange-500 text-white'
              }`}
            >
              {mode === 'signIn' ? 'Sign In with Email' : 'Create Account'}
            </button>
          </form>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        <div className="mt-6 text-center text-sm text-slate-400">
          {mode === 'signIn' ? 'Need an account?' : 'Already have an account?'}
          <button
            type="button"
            onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
            className="ml-2 text-orange-400 hover:text-orange-300 font-semibold uppercase tracking-wide text-xs"
          >
            {mode === 'signIn' ? 'Create one' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};
