import { useState } from "react";
import { useIdentity } from "../hooks/use-identity.js";
import { Spinner, ErrorBox, Button, Input } from "./ui.js";

export function LoginForm() {
  const { login, register, loading: authLoading } = useIdentity();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (authLoading) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <Spinner />
        <p className="mt-4 text-sm text-gray-500">Checking session...</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "register") {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto py-8 sm:py-16">
      <div className="text-center mb-8">
        <div className="w-14 h-14 bg-brand rounded-xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-2xl">V</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">
          {mode === "login" ? "Welcome back" : "Create an account"}
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          {mode === "login" ? "Sign in to continue." : "Join Votiverse to participate."}
        </p>
      </div>

      {error && <ErrorBox message={error} />}

      <form onSubmit={handleSubmit} className="space-y-4 mt-6">
        {mode === "register" && (
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>
        )}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
          />
        </div>
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? <Spinner /> : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        {mode === "login" ? (
          <>
            Don't have an account?{" "}
            <button onClick={() => { setMode("register"); setError(null); }} className="text-brand font-medium hover:underline">
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button onClick={() => { setMode("login"); setError(null); }} className="text-brand font-medium hover:underline">
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
