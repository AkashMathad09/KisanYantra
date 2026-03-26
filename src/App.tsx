import React, { useState, useEffect, createContext, useContext } from 'react';
import { 
  onAuthStateChanged, 
  signOut,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  fetchSignInMethodsForEmail
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  getDocs,
  setDoc, 
  collection, 
  query, 
  where, 
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  increment,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, Machine, Booking, UserRole } from './types';
import { translations } from './translations';
import { 
  Tractor, 
  Search, 
  Calendar, 
  User as UserIcon, 
  LogOut, 
  Plus, 
  Trash2,
  Bell,
  MapPin, 
  Phone, 
  Globe,
  CheckCircle,
  XCircle,
  Clock,
  ChevronRight,
  Menu,
  X,
  Mic,
  MicOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types & Helpers ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  alert(`Error: ${errInfo.error}`);
  throw new Error(JSON.stringify(errInfo));
}

// --- Contexts ---
const LanguageContext = createContext({
  lang: 'en',
  setLang: (l: string) => {},
  t: (key: string) => ''
});

const AuthContext = createContext<{
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}>({
  user: null,
  profile: null,
  loading: true
});

// --- Components ---

const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState(localStorage.getItem('lang') || 'en');
  
  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  const t = (key: string) => {
    return translations[lang]?.[key] || translations['en']?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (u) {
        // Use onSnapshot for faster initial load (from cache) and real-time updates
        unsubProfile = onSnapshot(doc(db, 'users', u.uid), (docSnap) => {
          if (!docSnap.exists()) {
            // Profile should already exist from registration — create minimal fallback
            const isAdminEmail = u.email === 'akashmathad0@gmail.com';
            setDoc(doc(db, 'users', u.uid), {
              uid: u.uid,
              email: u.email,
              name: u.email?.split('@')[0] || 'User',
              role: isAdminEmail ? 'admin' : 'user',
              status: 'active',
              language: localStorage.getItem('lang') || 'en',
              createdAt: new Date().toISOString()
            });
          } else if (u.email === 'akashmathad0@gmail.com' && docSnap.data()?.role !== 'admin') {
            // Ensure admin email always has admin role
            updateDoc(doc(db, 'users', u.uid), { role: 'admin' });
          } else if (u.email !== 'akashmathad0@gmail.com' && docSnap.data()?.role === 'admin') {
            // Demote unauthorized admins
            updateDoc(doc(db, 'users', u.uid), { role: 'user' });
          }
          setProfile(docSnap.exists() ? (docSnap.data() as UserProfile) : null);
          setLoading(false);
        }, (err) => {
          console.error("Profile fetch error:", err);
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// --- Main App ---

export default function App() {
  const [hash, setHash] = React.useState(window.location.hash);

  React.useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Hidden admin route: yourapp.com/#admin
  if (hash === '#admin') {
    return (
      <LanguageProvider>
        <AuthProvider>
          <AdminLoginPage />
        </AuthProvider>
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider>
      <AuthProvider>
        <KisanYantraApp />
      </AuthProvider>
    </LanguageProvider>
  );
}

function AdminLoginPage() {
  const { user, profile, loading } = useContext(AuthContext);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // ✅ OPTION C: Add your admin email(s) here — only these can register/login as admin
  const ADMIN_WHITELIST = [
    'akashmathad0@gmail.com',
    // Add more admin emails here if needed:
    // 'another@example.com',
  ];

  // If already logged in as admin, go to main app
  useEffect(() => {
    if (!loading && user && profile) {
      if (profile.role === 'admin') {
        window.location.hash = '';
      } else {
        setError('This account does not have admin privileges.');
        signOut(auth);
      }
    }
  }, [user, profile, loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1a0e]">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
          <Tractor className="w-10 h-10 text-[#9A9A60]" />
        </motion.div>
      </div>
    );
  }

  // --- Admin Login ---
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    // Check email is in the whitelist before even trying Firebase
    if (!ADMIN_WHITELIST.includes(loginEmail.trim().toLowerCase())) {
      setError('This email is not authorised as an admin account.');
      return;
    }
    setIsLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
      if (!userDoc.exists() || userDoc.data()?.role !== 'admin') {
        await signOut(auth);
        setError('This account does not have admin privileges.'); return;
      }
      window.location.hash = '';
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes.');
      } else {
        setError('Login failed: ' + (err.message || 'Please try again.'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // --- Admin Register ---
  const handleAdminRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    // Only whitelisted emails can register as admin
    if (!ADMIN_WHITELIST.includes(regEmail.trim().toLowerCase())) {
      setError('This email is not in the admin whitelist. Contact the system owner to be added.');
      return;
    }
    if (!regName.trim()) { setError('Please enter your name.'); return; }
    if (regPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (regPassword !== regConfirm) { setError('Passwords do not match.'); return; }
    setIsLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, regEmail, regPassword);
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        name: regName.trim(),
        email: regEmail,
        role: 'admin',
        status: 'active',
        language: 'en',
        createdAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'login_lookups', cred.user.uid), {
        email: regEmail,
      });
      // Account created — useEffect will redirect once profile loads
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please login instead.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password too weak. Use at least 6 characters.');
      } else {
        setError('Registration failed: ' + (err.message || 'Please try again.'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = "w-full p-3 bg-[#1a1a0e] border border-[#3a3a20] text-white rounded-xl focus:outline-none focus:border-[#5A5A40] focus:ring-1 focus:ring-[#5A5A40] placeholder-[#3a3a30] text-sm";
  const labelClass = "block text-[10px] font-bold text-[#6a6a50] mb-1.5 uppercase tracking-widest";

  return (
    <div className="min-h-screen bg-[#1a1a0e] flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#252515] border border-[#3a3a20] p-8 md:p-10 rounded-[40px] shadow-2xl max-w-sm w-full"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className="bg-[#5A5A40] w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#5A5A40]/30">
            <Tractor className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">KisanYantra</h1>
          <div className="inline-flex items-center gap-1.5 bg-[#5A5A40]/20 border border-[#5A5A40]/40 text-[#9A9A60] text-xs font-bold px-3 py-1 rounded-full mt-2 uppercase tracking-widest">
            <span>⬡</span> Admin Portal
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-[#1a1a0e] border border-[#3a3a20] p-1 rounded-2xl mb-6">
          <button
            onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold tracking-wide transition-all ${mode === 'login' ? 'bg-[#5A5A40] text-white shadow' : 'text-[#6a6a50] hover:text-[#9A9A60]'}`}
          >
            Login
          </button>
          <button
            onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold tracking-wide transition-all ${mode === 'register' ? 'bg-[#5A5A40] text-white shadow' : 'text-[#6a6a50] hover:text-[#9A9A60]'}`}
          >
            Register
          </button>
        </div>

        {/* Error / Success */}
        {error && (
          <div className="bg-red-900/30 border border-red-500/40 text-red-400 rounded-xl px-4 py-3 text-sm mb-4 text-center">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-900/30 border border-green-500/40 text-green-400 rounded-xl px-4 py-3 text-sm mb-4 text-center">
            {success}
          </div>
        )}

        {/* ===== LOGIN ===== */}
        {mode === 'login' && (
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className={labelClass}>Admin Email</label>
              <input type="email" required value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="admin@example.com" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <div className="relative">
                <input type={showLoginPass ? 'text' : 'password'} required value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••" className={inputClass + ' pr-14'} />
                <button type="button" onClick={() => setShowLoginPass(!showLoginPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A5A40] text-[10px] font-bold tracking-widest">
                  {showLoginPass ? 'HIDE' : 'SHOW'}
                </button>
              </div>
            </div>

            <button type="submit" disabled={isLoading}
              className={`w-full bg-[#5A5A40] hover:bg-[#6a6a50] text-white py-3.5 rounded-xl text-sm font-bold tracking-wide shadow-lg transition-all mt-1 ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}>
              {isLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Access Admin Panel →'}
            </button>
          </form>
        )}

        {/* ===== REGISTER ===== */}
        {mode === 'register' && (
          <form onSubmit={handleAdminRegister} className="space-y-3">
            <div>
              <label className={labelClass}>Full Name</label>
              <input type="text" required value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="Admin name" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" required value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="admin@example.com" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <div className="relative">
                <input type={showRegPass ? 'text' : 'password'} required value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Min. 6 characters" className={inputClass + ' pr-14'} />
                <button type="button" onClick={() => setShowRegPass(!showRegPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A5A40] text-[10px] font-bold tracking-widest">
                  {showRegPass ? 'HIDE' : 'SHOW'}
                </button>
              </div>
            </div>
            <div>
              <label className={labelClass}>Confirm Password</label>
              <input type={showRegPass ? 'text' : 'password'} required value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                placeholder="Re-enter password" className={inputClass} />
            </div>

            <button type="submit" disabled={isLoading}
              className={`w-full bg-[#5A5A40] hover:bg-[#6a6a50] text-white py-3.5 rounded-xl text-sm font-bold tracking-wide shadow-lg transition-all mt-1 ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}>
              {isLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Create Admin Account →'}
            </button>
          </form>
        )}

        <button
          onClick={() => { window.location.hash = ''; }}
          className="w-full mt-5 text-[#3a3a30] hover:text-[#6a6a50] text-xs font-medium transition-colors text-center"
        >
          ← Back to main app
        </button>
      </motion.div>

      <p className="mt-6 text-[#2a2a18] text-[10px] font-bold uppercase tracking-widest select-none">
        Restricted Access — Authorised Personnel Only
      </p>
    </div>
  );
}

function SupportPage() {
  const { t } = useContext(LanguageContext);
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 text-center">
        <div className="w-20 h-20 bg-[#5A5A40]/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Phone className="w-10 h-10 text-[#5A5A40]" />
        </div>
        <h2 className="text-3xl font-bold text-[#5A5A40] mb-4 serif">{t('support')}</h2>
        <p className="text-gray-600 mb-8 text-lg">{t('supportTagline')}</p>
        
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-2">{t('callSupport')}</h3>
            <p className="text-[#5A5A40] text-xl font-bold">+91 98765 43210</p>
            <p className="text-sm text-gray-500 mt-2">Available 24/7</p>
          </div>
          <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-2">Email Support</h3>
            <p className="text-[#5A5A40] text-xl font-bold">support@kisanyantra.com</p>
            <p className="text-sm text-gray-500 mt-2">Response within 2 hours</p>
          </div>
        </div>

        <button 
          onClick={() => window.location.href = 'tel:+919876543210'}
          className="w-full md:w-auto px-12 py-4 bg-[#5A5A40] text-white rounded-2xl font-bold hover:bg-[#4A4A30] transition-all shadow-lg shadow-[#5A5A40]/20"
        >
          {t('callSupport')}
        </button>
      </div>
    </div>
  );
}

function AdminPanel() {
  const { t } = useContext(LanguageContext);
  const [activeTab, setActiveTab] = useState<'users' | 'machines' | 'bookings' | 'stats' | 'settings'>('stats');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [platformFee, setPlatformFee] = useState(10);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'user' | 'machine', id: string } | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile)));
    });
    const unsubMachines = onSnapshot(collection(db, 'machines'), (snap) => {
      setMachines(snap.docs.map(d => ({ ...d.data(), id: d.id } as Machine)));
    });
    const unsubBookings = onSnapshot(collection(db, 'bookings'), (snap) => {
      setBookings(snap.docs.map(d => ({ ...d.data(), id: d.id } as Booking)));
    });
    const unsubSettings = onSnapshot(doc(db, 'settings', 'platform'), (docSnap) => {
      if (docSnap.exists()) {
        setPlatformFee(docSnap.data().fee || 10);
      }
    });
    return () => { unsubUsers(); unsubMachines(); unsubBookings(); unsubSettings(); };
  }, []);

  const toggleUserStatus = async (userId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'active' ? 'restricted' : 'active';
      await updateDoc(doc(db, 'users', userId), { status: newStatus });
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const updateMachineStatus = async (machineId: string, status: 'approved' | 'rejected') => {
    try {
      console.log(`Updating machine ${machineId} status to ${status}`);
      await updateDoc(doc(db, 'machines', machineId), { status });
      console.log(`Machine ${machineId} status updated successfully`);
    } catch (error: any) {
      console.error(`Error updating machine ${machineId} status:`, error);
      handleFirestoreError(error, OperationType.UPDATE, `machines/${machineId}`);
    }
  };

  const saveSettings = async () => {
    try {
      await setDoc(doc(db, 'settings', 'platform'), { fee: platformFee });
      alert("Settings saved successfully!");
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/platform');
    }
  };

  const removeUser = async (userId: string) => {
    try {
      await deleteDoc(doc(db, 'users', userId));
      setConfirmDelete(null);
      if (selectedUser?.uid === userId) setSelectedUser(null);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
    }
  };

  const removeMachine = async (machineId: string) => {
    try {
      await deleteDoc(doc(db, 'machines', machineId));
      setConfirmDelete(null);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `machines/${machineId}`);
    }
  };

  const stats = {
    totalUsers: users.length,
    totalMachines: machines.length,
    totalBookings: bookings.length,
    totalRevenue: bookings.reduce((acc, b) => acc + (b.renterFee || 0) + (b.ownerFee || 0), 0),
    renterRevenue: bookings.reduce((acc, b) => acc + (b.renterFee || 0), 0),
    ownerRevenue: bookings.reduce((acc, b) => acc + (b.ownerFee || 0), 0)
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <h2 className="text-3xl font-bold text-[#5A5A40] serif">{t('adminPanel')}</h2>
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
          {(['stats', 'users', 'machines', 'bookings', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-xl font-medium transition-all whitespace-nowrap ${activeTab === tab ? 'bg-[#5A5A40] text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {tab === 'stats' ? t('platformStats') : tab === 'users' ? t('users') : tab === 'machines' ? t('allMachines') : tab === 'bookings' ? t('allBookings') : 'Settings'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'stats' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500 mb-1">{t('activeUsers')}</p>
            <p className="text-3xl font-bold text-[#5A5A40]">{stats.totalUsers}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500 mb-1">{t('allMachines')}</p>
            <p className="text-3xl font-bold text-[#5A5A40]">{stats.totalMachines}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500 mb-1">{t('allBookings')}</p>
            <p className="text-3xl font-bold text-[#5A5A40]">{stats.totalBookings}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500 mb-1">Renter Fees</p>
            <p className="text-2xl font-bold text-blue-600">₹{stats.renterRevenue.toFixed(2)}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500 mb-1">Owner Fees</p>
            <p className="text-2xl font-bold text-orange-600">₹{stats.ownerRevenue.toFixed(2)}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500 mb-1">{t('totalRevenue')}</p>
            <p className="text-3xl font-bold text-green-600">₹{stats.totalRevenue.toFixed(2)}</p>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Desktop View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-bottom border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-sm font-bold text-gray-600 uppercase tracking-wider">{t('name')}</th>
                  <th className="px-6 py-4 text-sm font-bold text-gray-600 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-sm font-bold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-sm font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.uid} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-800">{u.name}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : u.role === 'provider' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setSelectedUser(u)}
                          className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                        >
                          <UserIcon className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => toggleUserStatus(u.uid, u.status)}
                          className={`p-2 rounded-lg transition-colors ${u.status === 'active' ? 'bg-orange-50 text-orange-600 hover:bg-orange-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                        >
                          {u.status === 'active' ? <XCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                        </button>
                        <button 
                          onClick={() => setConfirmDelete({ type: 'user', id: u.uid })}
                          className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile View */}
          <div className="md:hidden divide-y divide-gray-100">
            {users.map((u) => (
              <div key={u.uid} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-gray-800">{u.name}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : u.role === 'provider' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                    {u.role}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.status}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedUser(u)} className="p-2 bg-blue-50 text-blue-600 rounded-lg"><UserIcon className="w-4 h-4" /></button>
                    <button onClick={() => toggleUserStatus(u.uid, u.status)} className={`p-2 rounded-lg ${u.status === 'active' ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'}`}>
                      {u.status === 'active' ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setConfirmDelete({ type: 'user', id: u.uid })} className="p-2 bg-red-50 text-red-600 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'machines' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {machines.map((m) => (
            <div key={m.id} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100">
              <img src={m.image || 'https://picsum.photos/seed/tractor/400/300'} alt={m.name} className="w-full h-48 object-cover" referrerPolicy="no-referrer" />
              <div className="p-6">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-xl text-gray-800">{m.name}</h3>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${m.status === 'approved' ? 'bg-green-100 text-green-700' : m.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                    {m.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-4">{m.description}</p>
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
                  <MapPin className="w-3 h-3" />
                  {m.location}
                </div>
                <div className="flex gap-2">
                  {m.status !== 'approved' && (
                    <button 
                      onClick={() => updateMachineStatus(m.id, 'approved')}
                      className="flex-1 py-3 bg-green-50 text-green-600 rounded-xl font-bold hover:bg-green-100 transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                  )}
                  {m.status !== 'rejected' && (
                    <button 
                      onClick={() => updateMachineStatus(m.id, 'rejected')}
                      className="flex-1 py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  )}
                </div>
                <button 
                  onClick={() => setConfirmDelete({ type: 'machine', id: m.id })}
                  className="w-full mt-2 py-3 bg-gray-50 text-gray-400 rounded-xl font-bold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('remove')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'bookings' && (
        <div className="space-y-4">
          {bookings.map((b) => (
            <div key={b.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-lg text-gray-800">{b.machineName}</h3>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${b.status === 'completed' ? 'bg-green-100 text-green-700' : b.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                    {t(b.status)}
                  </span>
                </div>
                <div className="text-sm text-gray-500">
                  {t('roleRenter')}: <span className="font-medium text-gray-700">{b.renterName}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {b.bookingDate}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-[#5A5A40]">₹{b.renterTotal?.toFixed(2) || b.basePrice?.toFixed(2)}</div>
                <div className="text-xs text-gray-400">Platform Earned: ₹{((b.renterFee || 0) + (b.ownerFee || 0)).toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-md">
          <h3 className="text-xl font-bold text-[#5A5A40] mb-6">System Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Platform Fee (%)</label>
              <div className="flex gap-4">
                <input 
                  type="number" 
                  value={platformFee} 
                  onChange={(e) => setPlatformFee(Number(e.target.value))}
                  className="flex-1 p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#5A5A40]"
                />
                <button 
                  onClick={saveSettings}
                  className="px-8 bg-[#5A5A40] text-white rounded-2xl font-bold shadow-md hover:bg-[#4A4A30]"
                >
                  {t('save')}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">This fee is applied to both renters and owners.</p>
            </div>
          </div>
        </div>
      )}

      {selectedUser && (
        <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[40px] p-8 max-w-md w-full"
          >
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-2xl font-bold text-[#5A5A40] serif">{t('userDetails')}</h3>
              <button onClick={() => setSelectedUser(null)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase font-bold">{t('name')}</p>
                  <p className="font-medium">{selectedUser.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-bold">Role</p>
                  <p className="font-medium uppercase">{selectedUser.role}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold">{t('email')}</p>
                <p className="font-medium">{selectedUser.email}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold">{t('phone')}</p>
                <p className="font-medium">{selectedUser.phone || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold">{t('location')}</p>
                <p className="font-medium">{selectedUser.location || 'N/A'}</p>
              </div>
              {selectedUser.role === 'provider' && (
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-xs text-gray-400 uppercase font-bold mb-2">Bank Details</p>
                  <p className="text-sm">Account: {selectedUser.bankAccount || 'N/A'}</p>
                  <p className="text-sm">IFSC: {selectedUser.ifscCode || 'N/A'}</p>
                </div>
              )}
              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => { toggleUserStatus(selectedUser.uid, selectedUser.status); setSelectedUser(null); }}
                  className={`flex-1 py-3 rounded-xl font-bold transition-all ${selectedUser.status === 'active' ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'}`}
                >
                  {selectedUser.status === 'active' ? t('restrict') : t('unrestrict')}
                </button>
                <button 
                  onClick={() => setConfirmDelete({ type: 'user', id: selectedUser.uid })}
                  className="flex-1 py-3 bg-red-50 text-red-600 rounded-xl font-bold"
                >
                  {t('remove')}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[40px] p-8 max-w-sm w-full text-center"
          >
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Are you sure?</h3>
            <p className="text-gray-500 mb-6">This action is irreversible and will permanently delete the {confirmDelete.type}.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={() => confirmDelete.type === 'user' ? removeUser(confirmDelete.id) : removeMachine(confirmDelete.id)}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg"
              >
                {t('remove')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function MyBookings() {
  const { user, profile } = useContext(AuthContext);
  const { t } = useContext(LanguageContext);
  const [bookings, setBookings] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = profile?.role === 'provider' 
      ? query(collection(db, 'bookings'), where('ownerId', '==', user.uid))
      : query(collection(db, 'bookings'), where('renterId', '==', user.uid));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setBookings(docs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    });
    return unsubscribe;
  }, [user, profile]);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-[#5A5A40] serif">{t('myBookings')}</h2>
      {bookings.length === 0 ? (
        <div className="bg-white p-12 rounded-[32px] text-center shadow-sm">
          <Calendar className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500">{t('status')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {bookings.map((b) => (
            <div key={b.id} className="bg-white p-6 rounded-[32px] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-[#5A5A40]/10 p-4 rounded-2xl text-[#5A5A40]">
                  <Tractor className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-[#5A5A40]">{b.machineName}</h3>
                  <p className="text-sm text-gray-500">{new Date(b.date).toLocaleDateString()} • {b.status}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500 mb-1">{t('totalPaid')}: <span className="font-bold text-[#5A5A40]">₹{b.renterTotal?.toFixed(2) || b.totalPrice?.toFixed(2)}</span></div>
                <div className="text-xs text-green-600 font-medium">{t('netToOwner')}: ₹{b.ownerNet?.toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KisanYantraApp() {
  const { user, profile, loading } = useContext(AuthContext);
  const { t, lang, setLang } = useContext(LanguageContext);
  const [view, setView] = useState<'browse' | 'my-machines' | 'bookings' | 'profile' | 'register' | 'notifications' | 'admin' | 'support'>('browse');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (profile && !loading) {
      if (profile.role === 'admin' && (view === 'browse' || view === 'my-machines')) {
        setView('admin');
      } else if (profile.role === 'user' && view === 'admin') {
        setView('browse');
      }
    }
  }, [profile, loading, view]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid), where('read', '==', false));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadNotifications(snapshot.size);
    });
    return unsubscribe;
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0]">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Tractor className="w-12 h-12 text-[#5A5A40]" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-md w-full text-center">
          <div className="w-20 h-20 bg-[#5A5A40]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <UserIcon className="w-10 h-10 text-[#5A5A40]" />
          </div>
          <h2 className="text-3xl font-bold text-[#5A5A40] mb-4 serif">{t('welcome')}!</h2>
          <p className="text-gray-600 mb-8">{t('completeProfile')}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-[#4A4A30]"
          >
            {t('continue')}
          </button>
          <button 
            onClick={() => signOut(auth)}
            className="mt-4 text-gray-400 hover:text-gray-600"
          >
            {t('logout')}
          </button>
        </div>
      </div>
    );
  }

  if (profile?.status === 'restricted') {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center p-6 text-center">
        <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-md w-full">
          <XCircle className="w-20 h-20 text-red-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-red-600 mb-4 serif">{t('restrictedMessage')}</h1>
          <button 
            onClick={() => setView('support')}
            className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl text-xl font-bold shadow-lg hover:bg-[#4A4A30] transition-all"
          >
            {t('support')}
          </button>
          <button 
            onClick={() => signOut(auth)}
            className="mt-4 text-gray-500 font-medium hover:underline"
          >
            {t('logout')}
          </button>
        </div>
      </div>
    );
  }

  const handleLogout = () => signOut(auth);

  const NavItem = ({ icon: Icon, label, active, onClick }: any) => (
    <button 
      onClick={() => { onClick(); setIsMenuOpen(false); }}
      className={`flex items-center space-x-3 p-3 sm:p-3 rounded-xl transition-all w-full text-left ${
        active ? 'bg-[#5A5A40] text-white' : 'text-[#5A5A40] hover:bg-[#5A5A40]/10'
      }`}
    >
      <Icon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
      <span className="font-medium text-sm sm:text-base truncate">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex flex-col md:flex-row">
      {/* Sidebar / Mobile Nav */}
      <nav className={`
        fixed inset-y-0 left-0 z-50 w-64 sm:w-72 md:w-80 bg-white shadow-xl transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-4 sm:p-6 flex flex-col h-full">
          <div className="flex items-center space-x-3 mb-6 sm:mb-10">
            <div className="bg-[#5A5A40] p-2 rounded-lg">
              <Tractor className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-[#5A5A40] serif">{t('appName')}</h1>
          </div>

          <div className="flex-1 space-y-2">
            {profile?.role === 'admin' ? (
              <>
                <NavItem icon={Plus} label={t('adminPanel')} active={view === 'admin'} onClick={() => setView('admin')} />
                <NavItem icon={UserIcon} label={t('name')} active={view === 'profile'} onClick={() => setView('profile')} />
              </>
            ) : (
              <>
                <NavItem icon={Search} label={t('browse')} active={view === 'browse'} onClick={() => setView('browse')} />
                <NavItem icon={Tractor} label={t('myMachines')} active={view === 'my-machines'} onClick={() => setView('my-machines')} />
                <NavItem icon={Calendar} label={t('myBookings')} active={view === 'bookings'} onClick={() => setView('bookings')} />
                <div className="relative">
                  <NavItem icon={Clock} label={t('notifications')} active={view === 'notifications'} onClick={() => setView('notifications')} />
                  {unreadNotifications > 0 && (
                    <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {unreadNotifications}
                    </span>
                  )}
                </div>
                <NavItem icon={Phone} label={t('support')} active={view === 'support'} onClick={() => setView('support')} />
                <NavItem icon={UserIcon} label={t('name')} active={view === 'profile'} onClick={() => setView('profile')} />
              </>
            )}
          </div>

          <div className="mt-auto pt-6 border-t border-gray-100 space-y-4">
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Globe className="w-4 h-4" />
              <select 
                value={lang} 
                onChange={(e) => setLang(e.target.value)}
                className="bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
                <option value="kn">ಕನ್ನಡ</option>
                <option value="te">తెలుగు</option>
              </select>
            </div>
            <button 
              onClick={handleLogout}
              className="flex items-center space-x-3 p-3 w-full text-red-600 hover:bg-red-50 rounded-xl transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">{t('logout')}</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Header */}
      <div className="md:hidden bg-white p-3 sm:p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2">
          <Tractor className="w-5 h-5 sm:w-6 sm:h-6 text-[#5A5A40]" />
          <span className="font-bold text-[#5A5A40] text-sm sm:text-base">{t('appName')}</span>
        </div>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2">
          {isMenuOpen ? <X className="w-5 h-5 sm:w-6 sm:h-6" /> : <Menu className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {view === 'browse' && <BrowseMachines />}
            {view === 'my-machines' && <MyMachines />}
            {view === 'bookings' && <BookingsList />}
            {view === 'profile' && <ProfilePage />}
            {view === 'notifications' && <NotificationsList />}
            {view === 'admin' && <AdminPanel />}
            {view === 'support' && <SupportPage />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Sub-Pages ---

function LandingPage() {
  const { t, setLang } = useContext(LanguageContext);

  // Steps: 'details' | 'otp' | 'captcha' | 'password' for register
  //        'login' for login
  type RegStep = 'details' | 'otp' | 'captcha' | 'password';
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [step, setStep] = useState<RegStep>('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Registration form state
  const [regData, setRegData] = useState({
    name: '',
    email: '',
    phone: '',
    location: '',
    bankAccount: '',
    ifscCode: '',
  });
  const [otp, setOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [showOtpPopup, setShowOtpPopup] = useState(false);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState({ a: 0, b: 0, op: '+', answer: 0 });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Login state
  const [loginId, setLoginId] = useState(''); // email or phone
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);

  // --- Registration Steps ---

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const { name, email, phone, location } = regData;
    if (!name.trim() || !email.trim() || !phone.trim() || !location.trim()) {
      setError('Please fill all required fields.'); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.'); return;
    }
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) {
      setError('Please enter a valid 10-digit phone number.'); return;
    }
    // Check if email already registered
    setLoading(true);
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      if (methods.length > 0) {
        setError('This email is already registered. Please login instead.');
        setLoading(false); return;
      }
    } catch (_) {}
    setLoading(false);
    // Generate 6-digit OTP (demo)
    const demoOtp = String(Math.floor(100000 + Math.random() * 900000));
    setGeneratedOtp(demoOtp);
    setShowOtpPopup(true); // Show OTP popup instead of console
    setStep('otp');
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (otp.trim() !== generatedOtp) {
      setError('Incorrect OTP. Please check and try again.'); return;
    }
    // Generate captcha
    const nums = [
      Math.floor(Math.random() * 9) + 1,
      Math.floor(Math.random() * 9) + 1,
    ];
    const ops = ['+', '-', '*'] as const;
    const op = ops[Math.floor(Math.random() * ops.length)];
    let ans = op === '+' ? nums[0] + nums[1] : op === '-' ? nums[0] - nums[1] : nums[0] * nums[1];
    setCaptchaQuestion({ a: nums[0], b: nums[1], op, answer: ans });
    setCaptchaAnswer('');
    setStep('captcha');
  };

  const handleCaptchaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (parseInt(captchaAnswer, 10) !== captchaQuestion.answer) {
      setError('Wrong answer. Please try again.');
      // Refresh captcha
      const nums = [Math.floor(Math.random() * 9) + 1, Math.floor(Math.random() * 9) + 1];
      const ops = ['+', '-', '*'] as const;
      const op = ops[Math.floor(Math.random() * ops.length)];
      const ans = op === '+' ? nums[0] + nums[1] : op === '-' ? nums[0] - nums[1] : nums[0] * nums[1];
      setCaptchaQuestion({ a: nums[0], b: nums[1], op, answer: ans });
      setCaptchaAnswer('');
      return;
    }
    setPassword(''); setConfirmPassword('');
    setStep('password');
  };

  const DEMO_PASSWORD = 'demo123';

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, regData.email, DEMO_PASSWORD);
      const isAdmin = regData.email === 'akashmathad0@gmail.com';
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        name: regData.name,
        email: regData.email,
        phone: regData.phone,
        phoneVerified: true,
        location: regData.location,
        bankAccount: regData.bankAccount || '',
        ifscCode: regData.ifscCode || '',
        role: isAdmin ? 'admin' : 'user',
        status: 'active',
        language: localStorage.getItem('lang') || 'en',
        createdAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'login_lookups', cred.user.uid), {
        email: regData.email,
        phone: regData.phone,
      });
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Email already registered. Please login.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password too weak. Use at least 6 characters.');
      } else {
        setError('Registration failed: ' + (err.message || 'Please try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  // --- Login ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!loginId.trim() || !loginPassword) { setError('Please enter your email/phone and password.'); return; }
    setLoading(true);
    try {
      // Determine if loginId is email or phone
      let emailToUse = loginId.trim();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToUse);

      if (!isEmail) {
        // It's a phone number — look up the email from Firestore
        const digits = loginId.replace(/\D/g, '');
        const q = query(collection(db, 'login_lookups'), where('phone', '==', digits));
        const snap = await getDocs(q);
        if (snap.empty) {
          setError('No account found with this phone number. Please register first.'); setLoading(false); return;
        }
        emailToUse = snap.docs[0].data().email;
      } else {
        // Check if this email exists in Firestore before trying Firebase Auth
        const q = query(collection(db, 'login_lookups'), where('email', '==', emailToUse));
        const snap = await getDocs(q);
        if (snap.empty) {
          setError('No account found with this email. Please register first.'); setLoading(false); return;
        }
      }

      await signInWithEmailAndPassword(auth, emailToUse, loginPassword);
    } catch (err: any) {
      console.error('Login error code:', err.code, err.message);
      if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-email'
      ) {
        setError('Wrong password. Please try again. (Demo password: demo123)');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please wait a few minutes.');
      } else {
        setError('Login failed: ' + (err.message || 'Please try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const resetToDetails = () => { setStep('details'); setOtp(''); setGeneratedOtp(''); setCaptchaAnswer(''); setError(''); setShowOtpPopup(false); };

  // Step indicator for register
  const steps = ['Details', 'OTP', 'Captcha', 'Password'];
  const stepIndex = { details: 0, otp: 1, captcha: 2, password: 3 };

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex flex-col items-center justify-center p-4 md:p-6">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white p-6 md:p-10 rounded-[40px] shadow-2xl max-w-md w-full"
      >
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="bg-[#5A5A40] w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Tractor className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[#5A5A40] serif">{t('appName')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('tagline')}</p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-gray-100 p-1 rounded-2xl mb-6">
          <button
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 py-2 rounded-xl font-bold transition-all ${mode === 'login' ? 'bg-white text-[#5A5A40] shadow-sm' : 'text-gray-500'}`}
          >
            {t('login')}
          </button>
          <button
            onClick={() => { setMode('register'); setStep('details'); setError(''); }}
            className={`flex-1 py-2 rounded-xl font-bold transition-all ${mode === 'register' ? 'bg-white text-[#5A5A40] shadow-sm' : 'text-gray-500'}`}
          >
            {t('register')}
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4 text-center">
            {error}
          </div>
        )}

        {/* ===== LOGIN ===== */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Email or Phone Number</label>
              <input
                type="text" required value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="email@example.com or 9876543210"
                className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">
                Password <span className="text-[#5A5A40] normal-case font-normal">(demo: demo123)</span>
              </label>
              <div className="relative">
                <input
                  type={showLoginPass ? 'text' : 'password'} required value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="demo123"
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] pr-12"
                />
                <button type="button" onClick={() => setShowLoginPass(!showLoginPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">
                  {showLoginPass ? 'HIDE' : 'SHOW'}
                </button>
              </div>
            </div>
            <button
              type="submit" disabled={loading}
              className={`w-full bg-[#5A5A40] text-white py-4 rounded-2xl text-lg font-bold shadow-lg transition-all ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#4A4A30]'}`}
            >
              {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Login'}
            </button>
          </form>
        )}

        {/* ===== REGISTER ===== */}
        {mode === 'register' && (
          <>
            {/* Step progress */}
            <div className="flex items-center justify-between mb-6 px-1">
              {steps.map((s, i) => (
                <React.Fragment key={s}>
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      i < stepIndex[step] ? 'bg-[#5A5A40] text-white' :
                      i === stepIndex[step] ? 'bg-[#5A5A40] text-white ring-4 ring-[#5A5A40]/20' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {i < stepIndex[step] ? '✓' : i + 1}
                    </div>
                    <span className="text-[10px] mt-1 text-gray-400 font-semibold">{s}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 mb-4 transition-all ${i < stepIndex[step] ? 'bg-[#5A5A40]' : 'bg-gray-100'}`} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* STEP 1: Details */}
            {step === 'details' && (
              <form onSubmit={handleDetailsSubmit} className="space-y-3 text-left">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">{t('name')} *</label>
                  <input type="text" required value={regData.name}
                    onChange={(e) => setRegData({...regData, name: e.target.value})}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40]"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Email *</label>
                  <input type="email" required value={regData.email}
                    onChange={(e) => setRegData({...regData, email: e.target.value})}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40]"
                    placeholder="email@example.com"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">{t('phone')} *</label>
                    <input type="tel" required value={regData.phone}
                      onChange={(e) => setRegData({...regData, phone: e.target.value})}
                      className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40]"
                      placeholder="9876543210"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">{t('location')} *</label>
                    <input type="text" required value={regData.location}
                      onChange={(e) => setRegData({...regData, location: e.target.value})}
                      className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40]"
                      placeholder="City / Village"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">{t('bankAccount')} <span className="text-gray-300 normal-case font-normal">(opt)</span></label>
                    <input type="text" value={regData.bankAccount}
                      onChange={(e) => setRegData({...regData, bankAccount: e.target.value})}
                      className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">{t('ifscCode')} <span className="text-gray-300 normal-case font-normal">(opt)</span></label>
                    <input type="text" value={regData.ifscCode}
                      onChange={(e) => setRegData({...regData, ifscCode: e.target.value})}
                      className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40]"
                    />
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className={`w-full bg-[#5A5A40] text-white py-4 rounded-2xl text-lg font-bold shadow-lg transition-all mt-2 ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#4A4A30]'}`}>
                  {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Verify Phone Number →'}
                </button>
              </form>
            )}

            {/* STEP 2: OTP */}
            {step === 'otp' && (
              <form onSubmit={handleOtpSubmit} className="space-y-4 text-center">
                <div className="bg-green-50 rounded-2xl p-4 mb-2">
                  <p className="text-sm text-green-700 font-semibold">✅ OTP sent to your phone!</p>
                  <p className="text-xs text-green-600 mt-1">Enter the 6-digit code below</p>
                  <p className="text-xs text-green-500 mt-1">(In production this would be sent via SMS)</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Enter 6-digit OTP</label>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                    value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="• • • • • •"
                    className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-center text-2xl tracking-[0.5em] font-bold focus:outline-none focus:ring-2 focus:ring-[#5A5A40]"
                    autoFocus
                  />
                </div>
                <button type="submit" disabled={loading || otp.length < 6}
                  className={`w-full bg-[#5A5A40] text-white py-4 rounded-2xl text-lg font-bold shadow-lg transition-all ${loading || otp.length < 6 ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#4A4A30]'}`}>
                  Verify OTP →
                </button>
                <button type="button" onClick={resetToDetails} className="text-sm text-gray-400 hover:text-gray-600 hover:underline">
                  ← Back
                </button>
              </form>
            )}

            {/* STEP 3: Captcha */}
            {step === 'captcha' && (
              <form onSubmit={handleCaptchaSubmit} className="space-y-4 text-center">
                <div className="bg-[#5A5A40]/5 rounded-2xl p-6">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Security Check</p>
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-4xl font-black text-[#5A5A40]">{captchaQuestion.a}</span>
                    <span className="text-3xl font-black text-gray-400">{captchaQuestion.op}</span>
                    <span className="text-4xl font-black text-[#5A5A40]">{captchaQuestion.b}</span>
                    <span className="text-3xl font-black text-gray-400">=</span>
                    <span className="text-3xl font-black text-gray-300">?</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Your Answer</label>
                  <input
                    type="number" required value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    placeholder="Type your answer"
                    className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-[#5A5A40]"
                    autoFocus
                  />
                </div>
                <button type="submit" disabled={!captchaAnswer}
                  className={`w-full bg-[#5A5A40] text-white py-4 rounded-2xl text-lg font-bold shadow-lg transition-all ${!captchaAnswer ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#4A4A30]'}`}>
                  Confirm →
                </button>
              </form>
            )}

            {/* STEP 4: Create Password */}
            {step === 'password' && (
              <form onSubmit={handlePasswordSubmit} className="space-y-4 text-center">
                <p className="text-sm text-gray-500">Almost done! Your account will use a demo password.</p>
                <div className="bg-[#5A5A40]/5 border-2 border-dashed border-[#5A5A40]/30 rounded-2xl p-5">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Your Demo Password</p>
                  <p className="text-4xl font-black text-[#5A5A40] tracking-widest">demo123</p>
                  <p className="text-xs text-gray-400 mt-2">Use this to login every time</p>
                </div>
                <button type="submit" disabled={loading}
                  className={`w-full bg-[#5A5A40] text-white py-4 rounded-2xl text-lg font-bold shadow-lg transition-all ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#4A4A30]'}`}>
                  {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Create Account 🎉'}
                </button>
              </form>
            )}
          </>
        )}

        {/* Language switcher */}
        <div className="grid grid-cols-4 gap-2 mt-6">
          {['en', 'hi', 'kn', 'te'].map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className="p-2 border border-gray-100 rounded-xl hover:border-[#5A5A40] hover:bg-[#5A5A40]/5 transition-all text-[10px] font-bold uppercase">
              {l}
            </button>
          ))}
        </div>
      </motion.div>

      {/* OTP Popup Modal */}
      {showOtpPopup && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[32px] p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl"
          >
            <div className="bg-[#5A5A40]/10 w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-[#5A5A40]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-[#5A5A40] mb-2">Your OTP Code</h3>
            <p className="text-sm text-gray-600 mb-6">Click below to auto-fill this code</p>
            
            <div 
              className="bg-gray-50 rounded-2xl p-4 sm:p-6 mb-6 border-2 border-[#5A5A40]/20 cursor-pointer hover:bg-[#5A5A40]/5 transition-colors"
              onClick={() => {
                navigator.clipboard.writeText(generatedOtp);
                // Could add a toast notification here
              }}
            >
              <div className="text-3xl sm:text-4xl font-black text-[#5A5A40] tracking-wider font-mono select-all">
                {generatedOtp}
              </div>
              <p className="text-xs text-[#5A5A40]/60 mt-2 font-medium">Click to copy or use auto-fill</p>
            </div>
            
            <div className="flex space-x-3">
              <button 
                onClick={() => {
                  setOtp(generatedOtp);
                  setShowOtpPopup(false);
                  // Focus on OTP input after a short delay
                  setTimeout(() => {
                    const otpInput = document.querySelector('input[pattern="[0-9]{6}"]') as HTMLInputElement;
                    if (otpInput) otpInput.focus();
                  }, 100);
                }}
                className="flex-1 bg-[#5A5A40] text-white py-3 sm:py-4 rounded-2xl font-bold shadow-lg hover:bg-[#4A4A30] transition-all"
              >
                Auto-fill OTP ✨
              </button>
            </div>
            
            <p className="text-xs text-gray-400 mt-4">
              This is a demo OTP. In production, this would be sent via SMS.
            </p>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function BrowseMachines() {
  const { t, lang } = useContext(LanguageContext);
  const { profile, user } = useContext(AuthContext);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [search, setSearch] = useState('');
  const [isListening, setIsListening] = useState(false);

  const startVoiceSearch = () => {
    console.log("Starting voice search...");
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("SpeechRecognition not supported");
      alert("Voice search is not supported in your browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = lang === 'hi' ? 'hi-IN' : lang === 'kn' ? 'kn-IN' : lang === 'te' ? 'te-IN' : 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        console.log("Voice recognition started");
        setIsListening(true);
      };
      recognition.onend = () => {
        console.log("Voice recognition ended");
        setIsListening(false);
      };
      recognition.onerror = (event: any) => {
        console.error("Voice recognition error:", event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          alert("Microphone access was denied. Please check your browser settings.");
        }
      };
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        console.log("Voice transcript:", transcript);
        setSearch(transcript);
      };

      recognition.start();
    } catch (error) {
      console.error("Error starting speech recognition:", error);
      setIsListening(false);
    }
  };
  const [bookingDate, setBookingDate] = useState('');
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'machines'), where('available', '==', true), where('status', '==', 'approved'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Machine));
      setMachines(docs);
    });
    return unsubscribe;
  }, []);

  const handleBook = async () => {
    if (!user || !selectedMachine || !bookingDate) return;
    
    // Fetch current platform fee
    const settingsSnap = await getDoc(doc(db, 'settings', 'platform'));
    const currentFeePercent = settingsSnap.exists() ? settingsSnap.data().fee : 10;
    const feeMultiplier = currentFeePercent / 100;

    const date = new Date().toISOString();
    const basePrice = selectedMachine.price;
    const renterFee = basePrice * feeMultiplier;
    const renterTotal = basePrice + renterFee;
    const ownerFee = basePrice * feeMultiplier;
    const ownerNet = basePrice - ownerFee;

    await addDoc(collection(db, 'bookings'), {
      renterId: user.uid,
      renterName: profile?.name || 'Farmer',
      machineId: selectedMachine.id,
      machineName: selectedMachine.name,
      ownerId: selectedMachine.ownerId,
      date,
      bookingDate,
      status: 'pending',
      work_done: false,
      basePrice,
      renterFee,
      renterTotal,
      ownerFee,
      ownerNet,
      totalPrice: basePrice
    });
    setSelectedMachine(null);
    setBookingDate('');
    alert(t('confirmBooking'));
  };

  const filtered = machines.filter(m => 
    m.name.toLowerCase().includes(search.toLowerCase()) || 
    m.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#5A5A40] serif">{t('browse')}</h2>
        <div className="relative w-full lg:w-96 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
            <input 
              type="text" 
              placeholder={t('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 sm:pl-12 pr-4 py-2 sm:py-3 bg-white rounded-2xl border-none shadow-sm focus:ring-2 focus:ring-[#5A5A40] text-sm sm:text-base"
            />
          </div>
          <button 
            onClick={startVoiceSearch}
            className={`p-2 sm:p-3 rounded-2xl shadow-sm transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-[#5A5A40] hover:bg-gray-50'}`}
            title={t('voiceSearch')}
          >
            {isListening ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        {filtered.map(machine => (
          <motion.div 
            layout
            key={machine.id} 
            className="bg-white rounded-[24px] sm:rounded-[32px] overflow-hidden shadow-sm hover:shadow-md transition-all"
          >
            <img 
              src={machine.image || `https://picsum.photos/seed/${machine.type}/400/300`} 
              alt={machine.name} 
              className="w-full h-40 sm:h-48 object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="p-4 sm:p-6">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-[#5A5A40]">{machine.name}</h3>
                  <p className="text-sm text-gray-500">{machine.type}</p>
                </div>
                <div className="bg-[#5A5A40]/10 px-2 sm:px-3 py-1 rounded-full text-[#5A5A40] font-bold text-xs sm:text-sm">
                  ₹{machine.price}/{t(machine.priceUnit === 'hr' ? 'perHr' : 'perAcre')}
                </div>
              </div>
              <div className="flex items-center text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">
                <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                {machine.location}
              </div>
              <button 
                onClick={() => setSelectedMachine(machine)}
                className="w-full bg-[#5A5A40] text-white py-2 sm:py-3 rounded-xl font-bold hover:bg-[#4A4A30] transition-all text-sm sm:text-base"
              >
                {t('bookNow')}
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {selectedMachine && (
        <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-8 max-w-sm sm:max-w-md w-full mx-4"
          >
            <h3 className="text-xl sm:text-2xl font-bold text-[#5A5A40] mb-4 sm:mb-6 serif">{t('confirmBooking')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('bookingDate')}</label>
                <input 
                  type="date" 
                  required 
                  min={new Date().toISOString().split('T')[0]}
                  value={bookingDate} 
                  onChange={(e) => setBookingDate(e.target.value)}
                  className="w-full p-3 sm:p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#5A5A40] text-sm sm:text-base"
                />
              </div>
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
                <button 
                  onClick={() => setSelectedMachine(null)}
                  className="flex-1 py-3 sm:py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-50 text-sm sm:text-base"
                >
                  {t('cancel')}
                </button>
                <button 
                  onClick={handleBook}
                  disabled={!bookingDate}
                  className="flex-1 bg-[#5A5A40] text-white py-3 sm:py-4 rounded-2xl font-bold shadow-lg hover:bg-[#4A4A30] disabled:opacity-50 text-sm sm:text-base"
                >
                  {t('confirmBooking')}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      {filtered.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <Tractor className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p>{t('noMachines')}</p>
        </div>
      )}
    </div>
  );
}

function MyMachines() {
  const { t } = useContext(LanguageContext);
  const { user } = useContext(AuthContext);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'machines'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Machine));
      setMachines(docs);
    });
    return unsubscribe;
  }, [user]);

  const deleteMachine = async (id: string) => {
    await deleteDoc(doc(db, 'machines', id));
    setConfirmDeleteId(null);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#5A5A40] serif">{t('myMachines')}</h2>
        <button 
          onClick={() => setShowAdd(true)}
          className="bg-[#5A5A40] text-white px-4 sm:px-6 py-2 sm:py-3 rounded-2xl font-bold flex items-center space-x-2 shadow-lg text-sm sm:text-base"
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
          <span>{t('addMachine')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        {machines.map(machine => (
          <div key={machine.id} className="bg-white rounded-[32px] overflow-hidden shadow-sm group relative">
            <button 
              onClick={() => setConfirmDeleteId(machine.id)}
              className="absolute top-4 right-4 bg-red-500 text-white p-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <img 
              src={machine.image || `https://picsum.photos/seed/${machine.type}/400/300`} 
              alt={machine.name} 
              className="w-full h-48 object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="p-6">
              <h3 className="text-xl font-bold text-[#5A5A40] mb-1">{machine.name}</h3>
              <p className="text-sm text-gray-500 mb-4">{machine.type}</p>
              <div className="flex justify-between items-center">
                <span className="font-bold text-[#5A5A40]">₹{machine.price}/{t(machine.priceUnit === 'hr' ? 'perHr' : 'perAcre')}</span>
                <div className="flex flex-col items-end gap-1">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${machine.status === 'approved' ? 'bg-green-100 text-green-700' : machine.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                    {machine.status}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${machine.available ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {machine.available ? t('available') : t('cancelled')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {machines.length === 0 && (
        <div className="text-center py-20 bg-white rounded-[32px] border-2 border-dashed border-gray-100">
          <Tractor className="w-16 h-16 mx-auto mb-4 text-gray-200" />
          <p className="text-gray-400 italic">{t('noMachines')}</p>
        </div>
      )}

      {showAdd && <AddMachineModal onClose={() => setShowAdd(false)} />}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[40px] p-8 max-w-sm w-full text-center"
          >
            <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-xl font-bold text-[#5A5A40] mb-2">{t('confirmDelete')}</h3>
            <div className="flex space-x-4 mt-6">
              <button 
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-3 rounded-2xl font-bold text-gray-500 hover:bg-gray-50 transition-all"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={() => deleteMachine(confirmDeleteId)}
                className="flex-1 bg-red-600 text-white py-3 rounded-2xl font-bold shadow-lg hover:bg-red-700 transition-all"
              >
                {t('confirmDelete')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function AddMachineModal({ onClose }: { onClose: () => void }) {
  const { t } = useContext(LanguageContext);
  const { user, profile } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'Tractor',
    price: '',
    priceUnit: 'hr' as 'hr' | 'acre',
    description: '',
    location: profile?.location || '',
    image: ''
  });

  const compressImage = (base64: string): Promise<string> => {
    return new Promise((resolve) => {
      console.log("Starting image compression...");
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        // Use quality 0.7 to keep size small
        const compressed = canvas.toDataURL('image/jpeg', 0.7);
        console.log("Image compressed. Original size:", base64.length, "Compressed size:", compressed.length);
        resolve(compressed);
      };
      img.onerror = (e) => {
        console.error("Image load error during compression:", e);
        resolve(base64);
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || loading) return;
    
    // Basic validation
    if (!formData.name || !formData.price || !formData.location) {
      alert("Please fill all required fields");
      return;
    }

    setLoading(true);
    try {
      let finalImage = formData.image;
      
      // Compress if it's a base64 string
      if (finalImage.startsWith('data:')) {
        finalImage = await compressImage(finalImage);
      }
      
      const machineData = {
        ...formData,
        price: Number(formData.price),
        ownerId: user.uid,
        available: true,
        status: 'pending',
        image: finalImage || `https://picsum.photos/seed/${formData.type}/800/600`
      };
      
      console.log("Submitting machine data:", machineData);
      await addDoc(collection(db, 'machines'), machineData);
      onClose();
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'machines');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[40px] p-8 max-w-md w-full max-h-[90vh] overflow-y-auto relative"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
        <h3 className="text-2xl font-bold text-[#5A5A40] mb-6 serif">{t('addMachine')}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formData.image && (
            <div className="mb-4 rounded-2xl overflow-hidden h-40 bg-gray-100">
              <img src={formData.image} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('machineName')}</label>
            <input 
              type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#5A5A40]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('machineType')}</label>
            <select 
              value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})}
              className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#5A5A40]"
            >
              <option value="Tractor">{t('tractor')}</option>
              <option value="Harvester">{t('harvester')}</option>
              <option value="Sprayer">{t('sprayer')}</option>
              <option value="Plough">{t('plough')}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('price')}</label>
              <input 
                type="number" required value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})}
                className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#5A5A40]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('status')}</label>
              <select 
                value={formData.priceUnit} onChange={(e) => setFormData({...formData, priceUnit: e.target.value as any})}
                className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#5A5A40]"
              >
                <option value="hr">{t('perHr')}</option>
                <option value="acre">{t('perAcre')}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('location')}</label>
            <input 
              type="text" required value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})}
              className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#5A5A40]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('machineImage')}</label>
            <div className="flex flex-col gap-3">
              <input 
                type="file" 
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setFormData({...formData, image: reader.result as string});
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className="hidden"
                id="machine-image-upload"
              />
              <label 
                htmlFor="machine-image-upload"
                className="w-full p-4 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-100 transition-all text-gray-500"
              >
                <Plus className="w-5 h-5" />
                <span>{formData.image ? 'Change Image' : 'Upload from Gallery/Camera'}</span>
              </label>
              <input 
                type="url" 
                placeholder="Or enter image URL" 
                value={formData.image.startsWith('data:') ? '' : formData.image} 
                onChange={(e) => setFormData({...formData, image: e.target.value})}
                className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#5A5A40]"
              />
            </div>
          </div>
          <div className="flex space-x-4 pt-4">
            <button 
              type="button" onClick={onClose}
              className="flex-1 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-50 transition-all"
            >
              {t('cancel')}
            </button>
            <button 
              type="submit"
              disabled={loading}
              className={`flex-1 bg-[#5A5A40] text-white py-4 rounded-2xl font-bold shadow-lg transition-all ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#4A4A30]'}`}
            >
              {loading ? 'Saving...' : t('save')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function BookingsList() {
  const { t } = useContext(LanguageContext);
  const { user, profile } = useContext(AuthContext);
  const [bookings, setBookings] = useState<any[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);

  useEffect(() => {
    if (!user || !profile) return;
    
    // For admin, show all bookings (optional, but good for admin)
    if (profile.role === 'admin') {
      const q = collection(db, 'bookings');
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
        setBookings(docs);
      });
      return unsubscribe;
    }

    // For regular users, they can be either renter or owner
    const qRenter = query(collection(db, 'bookings'), where('renterId', '==', user.uid));
    const qOwner = query(collection(db, 'bookings'), where('ownerId', '==', user.uid));

    let renterBookings: any[] = [];
    let ownerBookings: any[] = [];

    const updateBookings = () => {
      const combined = [...renterBookings, ...ownerBookings];
      // Remove duplicates (if any, though unlikely)
      const unique = combined.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
      setBookings(unique);
    };

    const unsubRenter = onSnapshot(qRenter, (snapshot) => {
      renterBookings = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
      updateBookings();
    });

    const unsubOwner = onSnapshot(qOwner, (snapshot) => {
      ownerBookings = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any))
        .filter(b => b.status !== 'cancelled'); // Owners don't see cancelled requests
      updateBookings();
    });

    return () => {
      unsubRenter();
      unsubOwner();
    };
  }, [user, profile]);

  const updateStatus = async (booking: any, status: 'confirmed' | 'cancelled') => {
    try {
      await updateDoc(doc(db, 'bookings', booking.id), { status });
      
      // Create notification for the farmer
      await addDoc(collection(db, 'notifications'), {
        userId: booking.renterId,
        message: status === 'confirmed' ? t('bookingAccepted') : t('bookingCancelled'),
        date: new Date().toISOString(),
        read: false,
        type: status === 'confirmed' ? 'success' : 'warning'
      });
    } catch (error: any) {
      console.error("Error updating booking status:", error);
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.id}`);
    }
  };

  const clearHistory = async () => {
    if (!window.confirm(t('confirmClear'))) return;
    
    const today = new Date().toISOString().split('T')[0];
    const historyBookings = bookings.filter(b => 
      b.status === 'completed' || 
      b.status === 'cancelled' ||
      (b.status === 'pending' && b.bookingDate < today)
    );
    
    for (const b of historyBookings) {
      try {
        await deleteDoc(doc(db, 'bookings', b.id));
      } catch (error) {
        console.error("Error clearing history:", error);
      }
    }
  };

  const pending = bookings.filter(b => b.status === 'pending');
  const active = bookings.filter(b => b.status === 'confirmed' || b.status === 'work_done');
  const history = bookings.filter(b => b.status === 'completed' || b.status === 'cancelled');

  const BookingCard = ({ booking }: { booking: any, key?: any }) => (
    <div className="bg-white p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
      <div className="flex items-center space-x-3 sm:space-x-4">
        <div className="bg-[#5A5A40]/10 p-3 sm:p-4 rounded-2xl">
          <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-[#5A5A40]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-base sm:text-lg text-[#5A5A40] truncate">{booking.machineName}</h3>
          <p className="text-xs sm:text-sm text-gray-500">{t('bookingDate')}: {new Date(booking.bookingDate).toLocaleDateString()}</p>
          <p className="font-bold text-[#5A5A40] mt-1 text-sm sm:text-base">₹{booking.totalPrice} ({t('perHr')}/{t('perAcre')})</p>
          {booking.ownerId === user?.uid ? (
            <p className="text-xs text-gray-400">{t('roleRenter')}: {booking.renterName}</p>
          ) : (
            <p className="text-xs text-gray-400">{t('roleOwner')}: {booking.ownerName || 'Owner'}</p>
          )}
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
        <span className={`px-3 sm:px-4 py-1 sm:py-2 rounded-full text-xs sm:text-sm font-bold flex items-center space-x-2 self-start ${
          booking.status === 'confirmed' ? 'bg-green-100 text-green-700' :
          booking.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
          booking.status === 'work_done' ? 'bg-blue-100 text-blue-700' :
          booking.status === 'completed' ? 'bg-purple-100 text-purple-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {booking.status === 'confirmed' ? <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" /> : 
           booking.status === 'pending' ? <Clock className="w-3 h-3 sm:w-4 sm:h-4" /> : 
           booking.status === 'work_done' ? <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" /> :
           booking.status === 'completed' ? <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" /> :
           <XCircle className="w-3 h-3 sm:w-4 sm:h-4" />}
          <span>{t(booking.status)}</span>
        </span>

        {booking.ownerId === user?.uid && booking.status === 'pending' && (
          <div className="flex space-x-2">
            <button 
              onClick={() => updateStatus(booking, 'confirmed')}
              className="bg-green-600 text-white p-2 rounded-xl hover:bg-green-700"
            >
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button 
              onClick={() => updateStatus(booking, 'cancelled')}
              className="bg-red-600 text-white p-2 rounded-xl hover:bg-red-700"
            >
              <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        )}

        {booking.renterId === user?.uid && (booking.status === 'pending' || booking.status === 'confirmed') && (
          <button 
            onClick={() => updateStatus(booking, 'cancelled')}
            className="bg-red-50 text-red-600 px-3 sm:px-4 py-2 rounded-xl font-bold hover:bg-red-100 text-sm sm:text-base"
          >
            {t('cancel')}
          </button>
        )}

        {booking.renterId === user?.uid && booking.status === 'confirmed' && (
          <button 
            onClick={() => setSelectedBooking(booking)}
            className="bg-[#5A5A40] text-white px-3 sm:px-4 py-2 rounded-xl font-bold hover:bg-[#4A4A30] text-sm sm:text-base"
          >
            {t('workDone')}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 sm:space-y-8">
      <h2 className="text-2xl sm:text-3xl font-bold text-[#5A5A40] serif">{t('myBookings')}</h2>
      
      {pending.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-[#5A5A40] flex items-center space-x-2">
            <Clock className="w-5 h-5" />
            <span>{t('pendingRequests')}</span>
          </h3>
          {pending.map(b => <BookingCard key={b.id} booking={b} />)}
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-xl font-bold text-[#5A5A40] flex items-center space-x-2">
          <CheckCircle className="w-5 h-5" />
          <span>{t('activeBookings')}</span>
        </h3>
        {active.map(b => <BookingCard key={b.id} booking={b} />)}
        {active.length === 0 && <p className="text-gray-400 italic">{t('noBookings')}</p>}
      </div>

      {history.length > 0 && (
        <div className="space-y-4 opacity-60">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-[#5A5A40] flex items-center space-x-2">
              <Clock className="w-5 h-5" />
              <span>{t('history')}</span>
            </h3>
            <button 
              onClick={clearHistory}
              className="text-xs font-bold text-red-600 hover:underline flex items-center space-x-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>{t('clearHistory')}</span>
            </button>
          </div>
          {history.map(b => <BookingCard key={b.id} booking={b} />)}
        </div>
      )}

      {selectedBooking && (
        <PaymentModal 
          booking={selectedBooking} 
          onClose={() => setSelectedBooking(null)} 
        />
      )}
    </div>
  );
}

function NotificationsList() {
  const { t } = useContext(LanguageContext);
  const { user } = useContext(AuthContext);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setNotifications(docs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      
      // Mark as read
      snapshot.docs.forEach(async (d) => {
        if (!d.data().read) {
          await updateDoc(doc(db, 'notifications', d.id), { read: true });
        }
      });
    });
    return unsubscribe;
  }, [user]);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-[#5A5A40] serif">{t('notifications')}</h2>
      <div className="space-y-4">
        {notifications.map(n => (
          <div key={n.id} className={`p-6 rounded-[32px] shadow-sm flex items-center space-x-4 ${
            n.type === 'success' ? 'bg-green-50 border-l-4 border-green-500' :
            n.type === 'warning' ? 'bg-red-50 border-l-4 border-red-500' :
            'bg-white'
          }`}>
            <div className={`p-3 rounded-2xl ${
              n.type === 'success' ? 'bg-green-100 text-green-600' :
              n.type === 'warning' ? 'bg-red-100 text-red-600' :
              'bg-gray-100 text-gray-600'
            }`}>
              {n.type === 'success' ? <CheckCircle /> : n.type === 'warning' ? <XCircle /> : <Clock />}
            </div>
            <div>
              <p className="font-medium text-[#5A5A40]">{n.message}</p>
              <p className="text-xs text-gray-400">{new Date(n.date).toLocaleString()}</p>
            </div>
          </div>
        ))}
        {notifications.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <Bell className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>{t('noNotifications')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentModal({ booking, onClose }: { booking: any, onClose: () => void }) {
  const { t } = useContext(LanguageContext);
  const [duration, setDuration] = useState('');
  const [calculated, setCalculated] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState({
    base: 0,
    renterFee: 0,
    renterTotal: 0,
    ownerFee: 0,
    ownerNet: 0
  });
  const [invoiceText, setInvoiceText] = useState('');

  const handleCalculate = async () => {
    // Fetch current platform fee
    const settingsSnap = await getDoc(doc(db, 'settings', 'platform'));
    const currentFeePercent = settingsSnap.exists() ? settingsSnap.data().fee : 10;
    const feeMultiplier = currentFeePercent / 100;

    const base = Number(duration) * (booking.basePrice || booking.totalPrice);
    const rFee = base * feeMultiplier;
    const rTotal = base + rFee;
    const oFee = base * feeMultiplier;
    const oNet = base - oFee;
    
    setPaymentDetails({ 
      base, 
      renterFee: rFee, 
      renterTotal: rTotal, 
      ownerFee: oFee, 
      ownerNet: oNet 
    });
    setCalculated(true);
  };

  const downloadInvoice = async (text: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoice_${booking.id}_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePayment = async () => {
    await updateDoc(doc(db, 'bookings', booking.id), {
      status: 'completed',
      basePrice: paymentDetails.base,
      renterFee: paymentDetails.renterFee,
      renterTotal: paymentDetails.renterTotal,
      ownerFee: paymentDetails.ownerFee,
      ownerNet: paymentDetails.ownerNet,
      totalPrice: paymentDetails.base,
      workDuration: Number(duration)
    });

    // update owner account with net pay after platform fee
    await updateDoc(doc(db, 'users', booking.ownerId), {
      earnings: increment(paymentDetails.ownerNet)
    }).catch(() => {});

    // create notifications for renter and owner
    await addDoc(collection(db, 'notifications'), {
      userId: booking.renterId,
      message: `Payment successful. ₹${paymentDetails.renterTotal.toFixed(2)} paid (includes ₹${paymentDetails.renterFee.toFixed(2)} platform fee).`,
      date: new Date().toISOString(),
      read: false,
      type: 'success'
    });

    await addDoc(collection(db, 'notifications'), {
      userId: booking.ownerId,
      message: `You received ₹${paymentDetails.ownerNet.toFixed(2)} after 10% platform fee deduction.`,
      date: new Date().toISOString(),
      read: false,
      type: 'success'
    });

    // Generate invoice
    const invoice = `Invoice\n==========\nBooking ID: ${booking.id}\nMachine: ${booking.machineName}\nRenter: ${booking.renterName}\nOwner ID: ${booking.ownerId}\nBase Amount: ₹${paymentDetails.base.toFixed(2)}\nPlatform Fee: ₹${paymentDetails.renterFee.toFixed(2)}\nTotal Paid: ₹${paymentDetails.renterTotal.toFixed(2)}\nOwner Net: ₹${paymentDetails.ownerNet.toFixed(2)}\nDate: ${new Date().toLocaleString()}\n`;
    setInvoiceText(invoice);
    await downloadInvoice(invoice);

    setPaymentComplete(true);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-8 max-w-sm sm:max-w-md w-full mx-4"
      >
        <h3 className="text-xl sm:text-2xl font-bold text-[#5A5A40] mb-4 sm:mb-6 serif">{t('calculatePayment')}</h3>
        {!calculated ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('workDuration')}</label>
              <input 
                type="number" required value={duration} onChange={(e) => setDuration(e.target.value)}
                className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#5A5A40]"
                placeholder="Enter hours/acres"
              />
            </div>
            <button 
              onClick={handleCalculate}
              className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-[#4A4A30]"
            >
              {t('calculatePayment')}
            </button>
          </div>
        ) : paymentComplete ? (
          <div className="space-y-6 text-center">
            <div className="bg-green-50 border border-green-200 p-6 rounded-3xl">
              <CheckCircle className="w-10 h-10 mx-auto text-green-600" />
              <h3 className="font-bold text-lg text-green-700 mt-3">{t('paymentSuccess')}</h3>
              <p className="text-sm text-gray-600 mt-2">Invoice downloaded. Your owner has been notified, and account updated.</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl overflow-auto text-left text-xs">
              <pre className="whitespace-pre-wrap font-mono text-gray-700">{invoiceText}</pre>
            </div>
            <button 
              onClick={onClose}
              className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-[#4A4A30]"
            >
              {t('close') || 'Close'}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-gray-50 p-6 rounded-3xl space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">{t('totalAmount')}</span>
                <span className="font-bold">₹{paymentDetails.base.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{t('renterFee')}</span>
                <span className="text-orange-600">+₹{paymentDetails.renterFee.toFixed(2)}</span>
              </div>
              <div className="pt-3 border-t border-gray-200 flex justify-between text-lg">
                <span className="font-bold text-[#5A5A40]">{t('totalPaid')}</span>
                <span className="font-bold text-[#5A5A40]">₹{paymentDetails.renterTotal.toFixed(2)}</span>
              </div>
            </div>
            <button 
              onClick={handlePayment}
              className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-[#4A4A30] flex items-center justify-center space-x-2"
            >
              <Phone className="w-5 h-5" />
              <span>{t('payViaPhonePe')}</span>
            </button>
          </div>
        )}
        <button 
          onClick={onClose}
          className="w-full mt-4 py-2 text-gray-400 font-medium"
        >
          {t('cancel')}
        </button>
      </motion.div>
    </div>
  );
}

function ProfilePage() {
  const { user, profile } = useContext(AuthContext);
  const { t } = useContext(LanguageContext);
  const [ownerBookings, setOwnerBookings] = useState<any[]>([]);
  const [renterBookings, setRenterBookings] = useState<any[]>([]);
  const [bankAccount, setBankAccount] = useState(profile?.bankAccount || '');
  const [ifscCode, setIfscCode] = useState(profile?.ifscCode || '');
  const [updateMessage, setUpdateMessage] = useState('');

  useEffect(() => {
    if (!user) return;

    const ownerQuery = query(collection(db, 'bookings'), where('ownerId', '==', user.uid), where('status', '==', 'completed'));
    const renterQuery = query(collection(db, 'bookings'), where('renterId', '==', user.uid), where('status', '==', 'completed'));

    const unsubOwner = onSnapshot(ownerQuery, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOwnerBookings(docs);
    });

    const unsubRenter = onSnapshot(renterQuery, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRenterBookings(docs);
    });

    return () => {
      unsubOwner();
      unsubRenter();
    };
  }, [user]);

  useEffect(() => {
    if (!profile) return;
    setBankAccount(profile.bankAccount || '1111222233334444');
    setIfscCode(profile.ifscCode || 'TEST0001234');
  }, [profile]);

  const totalOwnerEarnings = ownerBookings.reduce((acc, b) => acc + (b.ownerNet || 0), 0);
  const totalOwnerFee = ownerBookings.reduce((acc, b) => acc + (b.ownerFee || 0), 0);
  const totalRenterPaid = renterBookings.reduce((acc, b) => acc + (b.renterTotal || 0), 0);

  const handleSaveBankDetails = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        bankAccount,
        ifscCode
      });
      setUpdateMessage('Account details saved.');
    } catch (err) {
      setUpdateMessage('Failed to save account details.');
    }
    setTimeout(() => setUpdateMessage(''), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h2 className="text-3xl font-bold text-[#5A5A40] serif">{t('profile')}</h2>
      <div className="bg-white p-8 rounded-[40px] shadow-sm space-y-6">
        <div className="flex items-center space-x-6 pb-6 border-b border-gray-100">
          <div className="w-20 h-20 bg-[#5A5A40] rounded-3xl flex items-center justify-center text-white text-3xl font-bold">
            {profile?.name[0]}
          </div>
          <div>
            <h3 className="text-2xl font-bold text-[#5A5A40]">{profile?.name}</h3>
            <p className="text-gray-500">{profile?.role === 'user' ? t('roleUser') : profile?.role === 'admin' ? t('roleAdmin') : t('roleOwner')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <p className="text-sm text-gray-400 uppercase tracking-wider font-bold">{t('email')}</p>
            <p className="text-lg font-medium text-[#5A5A40]">{profile?.email}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-400 uppercase tracking-wider font-bold">{t('phone')}</p>
            <p className="text-lg font-medium text-[#5A5A40]">{profile?.phone || '-'}</p>
          </div>
        </div>

        {profile?.role !== 'admin' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-500 mb-1">{t('bankAccount')}</label>
                <input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="w-full p-3 border rounded-xl" placeholder="Enter bank account" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-500 mb-1">{t('ifscCode')}</label>
                <input value={ifscCode} onChange={(e) => setIfscCode(e.target.value)} className="w-full p-3 border rounded-xl" placeholder="Enter IFSC code" />
              </div>
            </div>
            <div className="flex gap-3 items-center">
              <button onClick={handleSaveBankDetails} className="bg-[#5A5A40] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#4A4A30]">{t('save')}</button>
            </div>
            {updateMessage && <p className="text-sm text-green-600">{updateMessage}</p>}

            <div className="space-y-3 pt-4 border-t border-gray-100">
              <h3 className="text-lg font-bold text-[#5A5A40]">Machine Owner Payments</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl p-4 bg-green-50">
                  <p className="text-sm text-gray-500">Total Received</p>
                  <p className="text-2xl font-bold text-green-700">₹{totalOwnerEarnings.toFixed(2)}</p>
                </div>
                <div className="rounded-xl p-4 bg-red-50">
                  <p className="text-sm text-gray-500">Platform Fee Deducted</p>
                  <p className="text-2xl font-bold text-red-700">₹{totalOwnerFee.toFixed(2)}</p>
                </div>
                <div className="rounded-xl p-4 bg-blue-50 col-span-2">
                  <p className="text-sm text-gray-500">Total Paid By Renters</p>
                  <p className="text-2xl font-bold text-blue-700">₹{totalRenterPaid.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-gray-100">
              <h3 className="text-lg font-bold text-[#5A5A40]">Recent Completed Bookings</h3>
              {ownerBookings.length === 0 ? (
                <p className="text-gray-400">No completed payments yet.</p>
              ) : (
                <div className="space-y-2">
                  {ownerBookings.map((b) => (
                    <div key={b.id} className="p-3 rounded-xl border border-gray-200 flex justify-between">
                      <div>
                        <p className="font-bold">{b.machineName}</p>
                        <p className="text-xs text-gray-500">{new Date(b.date).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-700">Net ₹{(b.ownerNet || 0).toFixed(2)}</p>
                        <p className="text-xs text-gray-500">Fee ₹{(b.ownerFee || 0).toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div className="pt-8 border-t border-gray-100">
          <button 
            onClick={async () => {
              if (window.confirm("Are you sure you want to delete your account? This will permanently remove all your data.")) {
                try {
                  await deleteDoc(doc(db, 'users', profile!.uid));
                  await signOut(auth);
                } catch (error) {
                  console.error("Error deleting account:", error);
                  alert("Failed to delete account. Please try again.");
                }
              }
            }}
            className="w-full py-4 bg-red-50 text-red-600 rounded-2xl font-bold hover:bg-red-100 transition-all flex items-center justify-center gap-2"
          >
            <Trash2 className="w-5 h-5" />
            <span>Remove Account</span>
          </button>
        </div>
      </div>
    </div>
  );
}
