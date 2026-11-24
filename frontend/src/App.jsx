import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
const LEADS_URL = `${API_BASE}/leads`;

const INITIAL_FORM = {
  name: '',
  email: '',
  phone: '',
  businessName: '',
  status: 'New',
  contactWhen: '',
  requirements: '',
};

export default function App() {
  // Auth State (Persisted in localStorage)
  const [token, setToken] = useState(() => localStorage.getItem('leadflow_token') || '');
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('leadflow_user');
    return saved ? JSON.parse(saved) : null;
  });

  // Auth Form State
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup'
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Leads State
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Navigation View: 'leads' | 'graph'
  const [activeTab, setActiveTab] = useState('leads');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Lead Modal & Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (token) {
      fetchLeads();
    }
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem('leadflow_token');
    localStorage.removeItem('leadflow_user');
    setToken('');
    setUser(null);
    setLeads([]);
    setError(null);
  };

  // Login / Signup Handler
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');

    if (authMode === 'signup' && !authForm.name.trim()) {
      setAuthError('Full name is required.');
      return;
    }
    if (!authForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authForm.email)) {
      setAuthError('Please enter a valid email address.');
      return;
    }
    if (authForm.password.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }

    setAuthLoading(true);
    const endpoint = authMode === 'signup' ? `${API_BASE}/signup` : `${API_BASE}/login`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      localStorage.setItem('leadflow_token', data.token);
      localStorage.setItem('leadflow_user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setAuthForm({ name: '', email: '', password: '' });
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Fetch Leads (Authenticated)
  const fetchLeads = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(LEADS_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) throw new Error('Unable to fetch leads from server.');
      const data = await res.json();
      setLeads(data || []);
    } catch (err) {
      setError(err.message || 'Connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  // Overview Counts
  const totalLeads = leads.length;
  const newLeadsCount = leads.filter((l) => l.status === 'New').length;
  const contactedLeadsCount = leads.filter((l) => l.status === 'Contacted').length;
  const convertedLeadsCount = leads.filter((l) => l.status === 'Converted').length;

  // Filtered List
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openModal = (lead = null) => {
    setFormError('');
    if (lead) {
      setEditingLead(lead);
      setFormData({
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        businessName: lead.businessName,
        status: lead.status,
        contactWhen: lead.contactWhen || '',
        requirements: lead.requirements || '',
      });
    } else {
      setEditingLead(null);
      setFormData(INITIAL_FORM);
    }
    setIsModalOpen(true);
  };

  const validateForm = () => {
    if (!formData.name.trim()) return 'Full name is required.';
    if (!formData.email.trim()) return 'Email address is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      return 'Please enter a valid email address.';
    }
    if (!formData.phone.trim()) return 'Phone number is required.';
    if (!formData.businessName.trim()) return 'Business name is required.';
    if (!formData.contactWhen.trim()) return 'Please select when to contact this lead.';
    return '';
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const validationErr = validateForm();
    if (validationErr) {
      setFormError(validationErr);
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    const method = editingLead ? 'PUT' : 'POST';
    const url = editingLead ? `${LEADS_URL}/${editingLead.id}` : LEADS_URL;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save lead');

      if (editingLead) {
        setLeads((prev) => prev.map((item) => (item.id === editingLead.id ? data : item)));
      } else {
        setLeads((prev) => [data, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickStatusChange = async (lead, newStatus) => {
    const updatedLead = { ...lead, status: newStatus };
    try {
      const res = await fetch(`${LEADS_URL}/${lead.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updatedLead),
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) throw new Error('Failed to update status');
      const saved = await res.json();
      setLeads((prev) => prev.map((item) => (item.id === lead.id ? saved : item)));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this lead permanently?')) return;
    try {
      const res = await fetch(`${LEADS_URL}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) throw new Error('Failed to delete lead');
      setLeads((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const formatContactTime = (val) => {
    if (!val) return 'Not scheduled';
    const parsed = new Date(val);
    if (isNaN(parsed.getTime())) return val;
    return parsed.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusPillStyle = (status) => {
    switch (status) {
      case 'New':
        return 'bg-blue-500/15 text-blue-700';
      case 'Contacted':
        return 'bg-amber-500/15 text-amber-800';
      case 'Converted':
        return 'bg-emerald-500/15 text-emerald-700';
      default:
        return 'bg-neutral-200 text-neutral-700';
    }
  };

  // =========================================================================
  // AUTHENTICATION SCREEN (LOGIN / SIGNUP)
  // =========================================================================
  if (!token) {
    return (
      <div className="min-h-screen bg-[#e8eaef] text-neutral-900 flex items-center justify-center p-4 font-sans antialiased">
        <div className="w-full max-w-md bg-white/80 backdrop-blur-md rounded-3xl p-8 shadow-sm space-y-6">
          {/* Brand Header */}
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-11 h-11 rounded-2xl bg-neutral-950 text-white flex items-center justify-center font-bold text-lg">
              L
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-950">leadflow</h1>
            <p className="text-sm text-neutral-500">
              {authMode === 'login'
                ? 'Sign in to manage your customer enquiries'
                : 'Create an account to start tracking leads'}
            </p>
          </div>

          {/* Pill Mode Switcher */}
          <div className="grid grid-cols-2 gap-1.5 bg-[#e8eaef] p-1.5 rounded-full">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError('');
              }}
              className={`py-2 rounded-full text-sm font-medium transition cursor-pointer ${
                authMode === 'login'
                  ? 'bg-neutral-950 text-white shadow-2xs'
                  : 'text-neutral-600 hover:text-neutral-950'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('signup');
                setAuthError('');
              }}
              className={`py-2 rounded-full text-sm font-medium transition cursor-pointer ${
                authMode === 'signup'
                  ? 'bg-neutral-950 text-white shadow-2xs'
                  : 'text-neutral-600 hover:text-neutral-950'
              }`}
            >
              Create Account
            </button>
          </div>

          {authError && (
            <div className="p-3.5 bg-red-500/10 text-red-700 text-xs font-medium rounded-2xl">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-2xl bg-[#e8eaef]/80 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
                  placeholder="Alex Morgan"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                className="w-full px-4 py-3 rounded-2xl bg-[#e8eaef]/80 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
                placeholder="alex@business.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                className="w-full px-4 py-3 rounded-2xl bg-[#e8eaef]/80 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 rounded-full bg-neutral-950 hover:bg-neutral-800 disabled:opacity-50 text-white text-sm font-medium transition cursor-pointer mt-2"
            >
              {authLoading
                ? 'Please wait...'
                : authMode === 'login'
                ? 'Sign In'
                : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // AUTHENTICATED DASHBOARD
  // =========================================================================
  const safeTotal = totalLeads || 1;
  const newPct = Math.round((newLeadsCount / safeTotal) * 100);
  const contactedPct = Math.round((contactedLeadsCount / safeTotal) * 100);
  const convertedPct = Math.round((convertedLeadsCount / safeTotal) * 100);

  return (
    <div className="min-h-screen bg-[#e8eaef] text-neutral-900 font-sans antialiased selection:bg-neutral-900 selection:text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Top Navigation Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-neutral-950 text-white flex items-center justify-center font-bold text-sm">
              L
            </div>
            <span className="text-lg font-semibold tracking-tight text-neutral-900">
              leadflow
            </span>
          </div>

          {/* Center Pill Switcher */}
          <nav className="flex items-center gap-1.5 bg-white/60 backdrop-blur-md p-1.5 rounded-full shadow-2xs">
            <button
              onClick={() => setActiveTab('leads')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition cursor-pointer ${
                activeTab === 'leads'
                  ? 'bg-neutral-950 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-950'
              }`}
            >
              Leads
            </button>
            <button
              onClick={() => setActiveTab('graph')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition cursor-pointer ${
                activeTab === 'graph'
                  ? 'bg-neutral-950 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-950'
              }`}
            >
              Graph View
            </button>
          </nav>

          {/* Right Controls: + New Lead + User Pill + Logout */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => openModal()}
              className="flex items-center gap-1.5 bg-white hover:bg-neutral-950 hover:text-white text-neutral-900 px-4 py-2.5 rounded-full text-sm font-medium shadow-2xs transition cursor-pointer"
            >
              <span className="text-base leading-none">+</span>
              <span>New Lead</span>
            </button>

            <div className="flex items-center gap-2 bg-white/75 pl-3 pr-1.5 py-1.5 rounded-full shadow-2xs">
              <span className="text-xs font-semibold text-neutral-700 hidden sm:inline">
                {user?.name}
              </span>
              <button
                onClick={handleLogout}
                className="px-3 py-1 rounded-full bg-[#e8eaef] hover:bg-red-600 hover:text-white text-neutral-800 text-xs font-medium transition cursor-pointer"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Page Title */}
        <div className="pt-1">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            {activeTab === 'leads' ? 'Customer Enquiries' : 'Lead Analytics'}
          </h1>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-500/10 border border-red-300 text-red-800 px-5 py-3.5 rounded-2xl flex items-center justify-between text-sm">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="font-semibold hover:opacity-70 ml-4 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* 1. Dashboard Overview Bento Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/75 backdrop-blur-md rounded-3xl p-6 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-500">Total Leads</p>
              <p className="text-4xl font-bold text-neutral-950 mt-2">{totalLeads}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-[#e8eaef] flex items-center justify-center text-sm font-semibold text-neutral-700">
              All
            </div>
          </div>

          <div className="bg-white/75 backdrop-blur-md rounded-3xl p-6 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-500">New Enquiries</p>
              <p className="text-4xl font-bold text-blue-600 mt-2">{newLeadsCount}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-blue-500/15 flex items-center justify-center text-sm font-semibold text-blue-700">
              {totalLeads ? `${newPct}%` : '0%'}
            </div>
          </div>

          <div className="bg-white/75 backdrop-blur-md rounded-3xl p-6 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-500">Converted Customers</p>
              <p className="text-4xl font-bold text-emerald-600 mt-2">{convertedLeadsCount}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center text-sm font-semibold text-emerald-700">
              {totalLeads ? `${convertedPct}%` : '0%'}
            </div>
          </div>
        </section>

        {/* Conditional View: GRAPH VIEW vs LEADS WORKSPACE */}
        {activeTab === 'graph' ? (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart Card */}
            <div className="bg-white/75 backdrop-blur-md rounded-3xl p-6 sm:p-8 shadow-2xs space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-neutral-900">Leads by Stage</h2>
                <button
                  onClick={() => openModal()}
                  className="w-9 h-9 rounded-full bg-[#e8eaef] hover:bg-neutral-950 hover:text-white flex items-center justify-center text-lg transition cursor-pointer"
                  title="Add Lead"
                >
                  +
                </button>
              </div>

              {totalLeads === 0 ? (
                <p className="text-sm text-neutral-500 py-12 text-center">
                  Add leads to visualize pipeline distribution.
                </p>
              ) : (
                <div className="space-y-5 pt-2">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-neutral-700">New</span>
                      <span className="text-neutral-950 font-semibold">
                        {newLeadsCount} ({newPct}%)
                      </span>
                    </div>
                    <div className="w-full h-4 bg-[#e8eaef] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${newPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-neutral-700">Contacted</span>
                      <span className="text-neutral-950 font-semibold">
                        {contactedLeadsCount} ({contactedPct}%)
                      </span>
                    </div>
                    <div className="w-full h-4 bg-[#e8eaef] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-500"
                        style={{ width: `${contactedPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-neutral-700">Converted</span>
                      <span className="text-neutral-950 font-semibold">
                        {convertedLeadsCount} ({convertedPct}%)
                      </span>
                    </div>
                    <div className="w-full h-4 bg-[#e8eaef] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${convertedPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Ring Visualization Card */}
            <div className="bg-white/75 backdrop-blur-md rounded-3xl p-6 sm:p-8 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-neutral-900">Conversion Overview</h2>
                <span className="text-xs font-medium px-3 py-1 rounded-full bg-[#e8eaef] text-neutral-600">
                  Live Data
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-around gap-6 py-8">
                <div className="flex flex-col items-center">
                  <div className="w-32 h-32 rounded-full bg-blue-500/15 border-8 border-blue-500 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-neutral-900">{newLeadsCount}</span>
                    <span className="text-xs font-medium text-blue-700">New</span>
                  </div>
                </div>

                <div className="flex flex-col items-center">
                  <div className="w-32 h-32 rounded-full bg-amber-500/15 border-8 border-amber-500 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-neutral-900">
                      {contactedLeadsCount}
                    </span>
                    <span className="text-xs font-medium text-amber-800">Contacted</span>
                  </div>
                </div>

                <div className="flex flex-col items-center">
                  <div className="w-32 h-32 rounded-full bg-emerald-500/15 border-8 border-emerald-500 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-neutral-900">
                      {convertedLeadsCount}
                    </span>
                    <span className="text-xs font-medium text-emerald-700">Converted</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : (
          /* Main Workspace Container */
          <section className="bg-white/75 backdrop-blur-md rounded-3xl p-5 sm:p-7 shadow-2xs space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-neutral-900">Lead Pipeline</h2>
                <button
                  onClick={() => openModal()}
                  title="Add Lead"
                  className="w-9 h-9 rounded-full bg-[#e8eaef] hover:bg-neutral-950 hover:text-white flex items-center justify-center text-lg font-medium transition cursor-pointer"
                >
                  +
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  type="text"
                  placeholder="Search name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-4 py-2 rounded-full bg-[#e8eaef]/80 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 sm:w-64"
                />

                <div className="flex items-center gap-1 bg-[#e8eaef]/80 p-1 rounded-full overflow-x-auto">
                  {['All', 'New', 'Contacted', 'Converted'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
                        statusFilter === status
                          ? 'bg-neutral-950 text-white'
                          : 'text-neutral-600 hover:text-neutral-950'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="py-16 text-center text-sm text-neutral-500">
                Loading customer enquiries...
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center">
                <p className="text-sm font-medium text-neutral-600">
                  {leads.length === 0
                    ? 'No leads yet. Click "+ New Lead" to record your first enquiry.'
                    : 'No leads match your current search or filter.'}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-xs font-medium text-neutral-400 border-b border-neutral-200/70">
                        <th className="pb-3.5 px-3">Lead & Business</th>
                        <th className="pb-3.5 px-3">Contact Details</th>
                        <th className="pb-3.5 px-3">When to Contact</th>
                        <th className="pb-3.5 px-3">Requirements</th>
                        <th className="pb-3.5 px-3">Status</th>
                        <th className="pb-3.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200/50 text-sm">
                      {filteredLeads.map((lead) => (
                        <tr key={lead.id} className="hover:bg-white/80 transition">
                          <td className="py-4 px-3">
                            <div className="font-semibold text-neutral-900">{lead.name}</div>
                            <div className="text-xs text-neutral-500">{lead.businessName}</div>
                          </td>
                          <td className="py-4 px-3">
                            <div className="text-neutral-800">{lead.email}</div>
                            <div className="text-xs text-neutral-500">{lead.phone}</div>
                          </td>
                          <td className="py-4 px-3 text-xs font-medium text-neutral-700">
                            <span className="inline-block bg-[#e8eaef] px-3 py-1 rounded-full">
                              {formatContactTime(lead.contactWhen)}
                            </span>
                          </td>
                          <td className="py-4 px-3 max-w-xs">
                            {lead.requirements ? (
                              <p className="text-xs text-neutral-600 line-clamp-2">
                                {lead.requirements}
                              </p>
                            ) : (
                              <span className="text-xs text-neutral-400 italic">None</span>
                            )}
                          </td>
                          <td className="py-4 px-3">
                            <select
                              value={lead.status}
                              onChange={(e) => handleQuickStatusChange(lead, e.target.value)}
                              className={`text-xs font-semibold px-3 py-1 rounded-full cursor-pointer focus:outline-none ${getStatusPillStyle(
                                lead.status
                              )}`}
                            >
                              <option value="New">New</option>
                              <option value="Contacted">Contacted</option>
                              <option value="Converted">Converted</option>
                            </select>
                          </td>
                          <td className="py-4 px-3 text-right space-x-2">
                            <button
                              onClick={() => openModal(lead)}
                              className="px-3 py-1 rounded-full bg-[#e8eaef] hover:bg-neutral-950 hover:text-white text-xs font-medium transition cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(lead.id)}
                              className="px-3 py-1 rounded-full bg-red-500/10 hover:bg-red-600 hover:text-white text-red-700 text-xs font-medium transition cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3">
                  {filteredLeads.map((lead) => (
                    <div key={lead.id} className="bg-white rounded-2xl p-4 shadow-2xs space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-neutral-900">{lead.name}</h3>
                          <p className="text-xs text-neutral-500">{lead.businessName}</p>
                        </div>
                        <select
                          value={lead.status}
                          onChange={(e) => handleQuickStatusChange(lead, e.target.value)}
                          className={`text-xs font-semibold px-3 py-1 rounded-full ${getStatusPillStyle(
                            lead.status
                          )}`}
                        >
                          <option value="New">New</option>
                          <option value="Contacted">Contacted</option>
                          <option value="Converted">Converted</option>
                        </select>
                      </div>

                      <div className="text-xs text-neutral-600 space-y-1">
                        <p>{lead.email}</p>
                        <p>{lead.phone}</p>
                        <p className="pt-1">
                          <span className="font-medium text-neutral-800">Contact: </span>
                          {formatContactTime(lead.contactWhen)}
                        </p>
                        {lead.requirements && (
                          <p className="bg-[#e8eaef]/60 p-2.5 rounded-xl text-neutral-700 mt-1.5">
                            {lead.requirements}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 flex justify-end gap-2">
                        <button
                          onClick={() => openModal(lead)}
                          className="px-3.5 py-1.5 rounded-full bg-[#e8eaef] text-xs font-medium text-neutral-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(lead.id)}
                          className="px-3.5 py-1.5 rounded-full bg-red-500/10 text-xs font-medium text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {/* Add / Edit Lead Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-neutral-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-neutral-900">
                {editingLead ? 'Edit Lead' : 'New Lead'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#e8eaef] hover:bg-neutral-950 hover:text-white flex items-center justify-center text-sm transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-red-500/10 text-red-700 text-xs font-medium rounded-2xl">
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#e8eaef]/70 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="Sam Frank"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-2xl bg-[#e8eaef]/70 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    placeholder="sam@company.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                    Phone Number *
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-2xl bg-[#e8eaef]/70 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    placeholder="+1 555 234 5678"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                  Business Name *
                </label>
                <input
                  type="text"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#e8eaef]/70 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="Acme Solutions"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                    When to be Contacted *
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.contactWhen}
                    onChange={(e) => setFormData({ ...formData, contactWhen: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#e8eaef]/70 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-2xl bg-[#e8eaef]/70 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  >
                    <option value="New">New</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Converted">Converted</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                  Customer Specific Requirements <span className="text-neutral-400">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={formData.requirements}
                  onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#e8eaef]/70 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 resize-none"
                  placeholder="Preferred call window, custom pricing notes, project details..."
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-full bg-[#e8eaef] hover:bg-neutral-300 text-neutral-800 text-sm font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-full bg-neutral-950 hover:bg-neutral-800 disabled:opacity-50 text-white text-sm font-medium transition cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : editingLead ? 'Save Changes' : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}