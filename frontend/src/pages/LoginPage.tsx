import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Phone, Lock, Droplets, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { InstallAppButton } from '../components/PWAInstall';
import { registerPushNotifications } from '../utils/registerPush';

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  if (user) { return <Navigate to={`/${user.role}`} replace />; }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(phone, password);
      // Register for background push (mobile notification panel when app is closed)
      registerPushNotifications(true).catch(() => {});
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-gradient-to-br from-brand-800 via-brand-700 to-aqua-600 p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-white/3" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
            <Droplets className="w-6 h-6 text-white" />
          </div>
          <span className="text-white font-bold text-xl">Swara Aqua</span>
        </div>

        <div className="relative z-10">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }}>
            <p className="text-white/60 text-sm font-medium mb-3 uppercase tracking-widest">Trusted by 10,000+ customers</p>
            <h2 className="text-4xl font-bold text-white leading-tight mb-4">
              Pure water,<br />delivered to<br />your door.
            </h2>
            <p className="text-white/60 text-base leading-relaxed max-w-xs">
              Manage your water delivery orders, track deliveries in real-time, and stay hydrated effortlessly.
            </p>
          </motion.div>
        </div>

        <div className="relative z-10 flex items-center gap-4">
          {['Fast Delivery', 'Pure Quality', '24/7 Support'].map((t) => (
            <div key={t} className="flex items-center gap-1.5 bg-white/10 rounded-xl px-3 py-2">
              <div className="w-1.5 h-1.5 bg-aqua-400 rounded-full" />
              <span className="text-white/80 text-xs font-medium">{t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 bg-gradient-aqua rounded-xl flex items-center justify-center shadow-brand">
              <Droplets className="w-5 h-5 text-white" />
            </div>
            <span className="text-slate-900 font-bold text-lg">Swara Aqua</span>
          </div>

          <div className="mb-8 flex flex-col items-center text-center">
            <img 
              src="/sarvam.jpg" 
              alt="Logo" 
              className="mb-4 object-contain max-h-32 w-auto" 
              style={{
                WebkitMaskImage: 'radial-gradient(ellipse at center, black 60%, rgba(0,0,0,0) 100%)',
                maskImage: 'radial-gradient(ellipse at center, black 60%, rgba(0,0,0,0) 100%)'
              }}
            />
            <p className="text-slate-500 text-sm">Sign in to your account to continue</p>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="mb-5 flex items-center gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Phone Number"
              type="tel"
              placeholder="Enter your phone number"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              icon={<Phone className="w-4 h-4" />}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              icon={<Lock className="w-4 h-4" />}
              required
            />

            <Button type="submit" loading={loading} size="lg" className="w-full mt-2" icon={<ArrowRight className="w-4 h-4" />}>
              Sign In
            </Button>
            {/* Forgot Password */}
            <div className="text-center pt-1">
              <button type="button" onClick={() => setShowForgot(f => !f)}
                className="text-sm text-slate-400 hover:text-brand-600 transition-colors hover:underline underline-offset-2">
                Forgot your password?
              </button>
            </div>
          </form>
          {showForgot && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-4">
              <p className="text-sm font-semibold text-blue-800 mb-1">Need a password reset?</p>
              <p className="text-xs text-blue-600 mb-3 leading-relaxed">
                Contact Swara Aqua support. Admin will reset your password and give you a temporary one over the phone.
              </p>
              <a href="tel:+919999999999"
                className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm">
                <Phone className="w-4 h-4" /> Call Support
              </a>
            </motion.div>
          )}

          <div className="mt-6 pt-6 border-t border-slate-100">
            <InstallAppButton />
          </div>

          <p className="text-center text-sm text-slate-500 mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="text-brand-600 font-semibold hover:text-brand-700 transition-colors">
              Request access
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
