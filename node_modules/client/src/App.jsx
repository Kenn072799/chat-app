import { AuthProvider, useAuth } from './context/AuthContext';
import { Heart, LoaderCircle } from 'lucide-react';
import Auth from './components/Auth';
import Chat from './components/Chat';

function MainApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 text-sm text-pink-200">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10">
          <Heart className="h-5 w-5 text-rose-300" />
          <LoaderCircle className="absolute h-10 w-10 animate-spin text-rose-400/50" />
        </div>
        Opening your chat...
      </div>
    );
  }

  return user ? <Chat /> : <Auth />;
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
