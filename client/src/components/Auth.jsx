import { useState } from 'react';

import {
  ArrowRight,
  CheckCircle,
  Eye,
  EyeOff,
  Heart,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Sparkles,
  User,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';

export default function Auth() {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { login, register } = useAuth();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      if (isRegister) {
        await register(username, password);
        setSuccess('Account created. You can now sign in.');
        setIsRegister(false);
        setPassword('');
      } else {
        await login(username, password);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-[max(2rem,env(safe-area-inset-top))] md:px-6">
      <div className="relative w-full max-w-md overflow-hidden rounded-[2.25rem] border border-rose-900/50 bg-[#1a0509]/90 p-5 shadow-2xl shadow-black/25 backdrop-blur-xl md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.16),transparent_28%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-400/80 to-transparent" />
        <div className="absolute left-5 top-5 text-rose-300/60">
          <Heart className="h-4 w-4" />
        </div>
        <div className="absolute right-5 top-5 text-pink-300/60">
          <Sparkles className="h-4 w-4" />
        </div>

        <div className="relative mb-7 text-center md:mb-8">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-[1.8rem] border border-rose-300/30 bg-gradient-to-br from-rose-500 via-pink-500 to-red-500 text-white shadow-lg shadow-rose-900/30">
            <MessageCircle className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-rose-50 md:text-4xl">Just Us</h1>
          <p className="mt-2 text-sm text-rose-100/75">
            {isRegister
              ? 'Create your account for this private little space'
              : 'Your cozy place to stay close, wherever you are'}
          </p>
        </div>

        {success ? (
          <div className="mb-6 flex items-start gap-2 rounded-[1.2rem] border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-50">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="mb-6 rounded-[1.2rem] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-50">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="relative space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-rose-100/75">
              Username
            </span>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-rose-200/60" />
              <input
                type="text"
                required
                minLength={isRegister ? 3 : undefined}
                maxLength={isRegister ? 24 : undefined}
                pattern={isRegister ? '[A-Za-z0-9_]+' : undefined}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter username"
                className="w-full rounded-[1.2rem] border border-rose-900/50 bg-[#24070d] py-3 pl-10 pr-4 text-sm text-rose-50 outline-none transition placeholder:text-rose-200/40 focus:border-rose-400/60 focus:bg-[#2a0910] focus:ring-1 focus:ring-rose-400/20"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-rose-100/75">
              Password
            </span>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-rose-200/60" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={isRegister ? 8 : undefined}
                maxLength={128}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="w-full rounded-[1.2rem] border border-rose-900/50 bg-[#24070d] py-3 pl-10 pr-11 text-sm text-rose-50 outline-none transition placeholder:text-rose-200/40 focus:border-rose-400/60 focus:bg-[#2a0910] focus:ring-1 focus:ring-rose-400/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-rose-100/60 transition hover:bg-rose-500/10 hover:text-rose-50"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {isRegister ? (
              <span className="mt-2 block text-xs text-rose-100/50">
                Use 8 or more characters. Usernames can use letters, numbers, and underscores.
              </span>
            ) : null}
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-gradient-to-r from-rose-500 via-pink-500 to-red-500 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-rose-900/30 transition hover:scale-[1.01] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" /> Please wait...
              </>
            ) : (
              <>
                {isRegister ? 'Create account' : 'Sign in'}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="relative mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setIsRegister((current) => !current);
              setError('');
              setSuccess('');
            }}
            className="text-sm font-semibold text-rose-100/75 transition hover:text-rose-50"
          >
            {isRegister ? 'Already have an account? Sign in' : 'Don\'t have an account? Register here'}
          </button>
        </div>
      </div>
    </div>
  );
}
