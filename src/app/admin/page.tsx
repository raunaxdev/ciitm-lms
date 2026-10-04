"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookCopy,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  LibraryBig,
  LoaderCircle,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { OCRBookCapture } from "@/components/ocr-book-capture";
import { clientConfig } from "@/config/client.config";

type Role = "ADMIN" | "STAFF" | "USER";

type Profile = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

type Book = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  category: string;
  totalCopies: number;
  availableCopies: number;
  publishedYear: number | null;
};

type Metrics = {
  totalTitles: number;
  totalCopies: number;
  availableCopies: number;
  checkedOutCopies: number;
};

const emptyMetrics: Metrics = {
  totalTitles: 0,
  totalCopies: 0,
  availableCopies: 0,
  checkedOutCopies: 0,
};

const initialBookForm = {
  title: "",
  author: "",
  isbn: "",
  category: "",
  publisher: "",
  publishedYear: "",
  totalCopies: "1",
};

export default function AdminPage() {
  const [user, setUser] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(8);
  const [totalPages, setTotalPages] = useState(1);
  const [form, setForm] = useState(initialBookForm);
  const [formMessage, setFormMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadBooks = useCallback(async (nextPage = page, nextSearch = search, nextCategory = category) => {
    const query = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(pageSize),
    });
    if (nextSearch.trim()) {
      query.set("search", nextSearch.trim());
      query.set("semantic", "true");
    }
    if (nextCategory.trim()) query.set("category", nextCategory.trim());

    const response = await fetch(`/api/books?${query.toString()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load the catalog.");
    const data = (await response.json()) as {
      books: Book[];
      metrics: Metrics;
      pagination: { totalPages: number; page: number };
    };
    setBooks(data.books);
    setMetrics(data.metrics);
    setPage(data.pagination.page ?? nextPage);
    setTotalPages(data.pagination.totalPages ?? 1);
  }, [category, page, pageSize, search]);

  useEffect(() => {
    let active = true;
    fetch("/api/auth")
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("Could not verify your session.");
        const data = (await response.json()) as { user: Profile };
        return data.user;
      })
      .then((profile) => {
        if (active) setUser(profile);
      })
      .catch((error: unknown) => {
        if (active) setAuthError(error instanceof Error ? error.message : "Session check failed.");
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    loadBooks().catch((error: unknown) => {
      setFormError(error instanceof Error ? error.message : "Could not load catalog data.");
    });
    const refreshTimer = window.setInterval(() => {
      loadBooks().catch((error: unknown) => {
        setFormError(error instanceof Error ? error.message : "Could not refresh catalog data.");
      });
    }, 30_000);
    return () => window.clearInterval(refreshTimer);
  }, [loadBooks, user]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email, password }),
      });
      const data = (await response.json()) as { user?: Profile; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error ?? "Sign-in failed.");
      setUser(data.user);
      setPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!response.ok) throw new Error("Could not end the session.");
      setUser(null);
      setBooks([]);
      setMetrics(emptyMetrics);
    } catch {
      setFormError("Could not end the session. Please try again.");
    }
  }

  async function handleAddBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormMessage("");
    setFormError("");
    try {
      const response = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          totalCopies: Number(form.totalCopies),
          ...(form.publishedYear ? { publishedYear: Number(form.publishedYear) } : {}),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not add book.");
      setForm(initialBookForm);
      setFormMessage("Book added to the catalog.");
      await loadBooks();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not add book.");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <LoaderCircle className="h-8 w-8 animate-spin text-brand-primary" aria-label="Loading" />
      </main>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 py-12">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-card sm:p-10"
        >
          <BrandMark />
          <div className="mb-8 mt-10">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-primary">
              Admin workspace
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900">
              Welcome back
            </h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Sign in with an administrator account to manage your library.
            </p>
          </div>
          {user && user.role !== "ADMIN" ? (
            <p className="mb-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              This account does not have administrator access.
            </p>
          ) : null}
          {authError ? <ErrorNotice message={authError} /> : null}
          <form className="space-y-4" onSubmit={handleLogin}>
            <label className="block text-sm font-medium text-stone-700">
              Email address
              <input
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-xl border border-stone-200 px-4 py-3 outline-none transition focus:border-brand-primary focus:ring-4 focus:ring-brand-secondary"
                placeholder="admin@ciitm.edu"
              />
            </label>
            <label className="block text-sm font-medium text-stone-700">
              Password
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-stone-200 px-4 py-3 outline-none transition focus:border-brand-primary focus:ring-4 focus:ring-brand-secondary"
                placeholder="Enter your password"
              />
            </label>
            <button
              type="submit"
              disabled={authLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Sign in securely
            </button>
          </form>
          <p className="mt-6 text-center text-xs leading-5 text-stone-400">
            Accounts are provisioned by your library administrator.
          </p>
        </motion.section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-stone-200/80 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <BrandMark />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-stone-800">{user.name}</p>
              <p className="text-xs text-stone-500">Administrator</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-sm font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="mb-9 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-secondary px-3 py-1.5 text-xs font-semibold text-brand-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Library overview
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
              Good day, {user.name.split(" ")[0]}.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-stone-500 sm:text-base">
              A clear view of your collection, all in one place.
            </p>
          </div>
          <p className="text-sm text-stone-500">
            <span className="font-medium text-stone-700">{clientConfig.database.provider}</span>
            {" · "}{clientConfig.database.hosting}
          </p>
        </div>

        <section aria-label="Library metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={LibraryBig} label="Catalog titles" value={metrics.totalTitles} tint="green" />
          <MetricCard icon={BookCopy} label="Total copies" value={metrics.totalCopies} tint="blue" />
          <MetricCard icon={CheckCircle2} label="Available now" value={metrics.availableCopies} tint="gold" />
          <MetricCard icon={ArrowDownToLine} label="Checked out" value={metrics.checkedOutCopies} tint="purple" />
        </section>

        <div className="mt-7 grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
          <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-card">
            <div className="flex flex-col gap-4 border-b border-stone-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <h2 className="font-semibold text-stone-900">Book catalog</h2>
                <p className="mt-1 text-sm text-stone-500">Browse and search your collection.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="relative block sm:w-64">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    aria-label="Search catalog"
                    value={search}
                    onChange={(event) => {
                      setPage(1);
                      setSearch(event.target.value);
                    }}
                    className="w-full rounded-xl border border-stone-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-primary"
                    placeholder="Search books..."
                  />
                </label>
                <select
                  aria-label="Filter by category"
                  value={category}
                  onChange={(event) => {
                    setPage(1);
                    setCategory(event.target.value);
                  }}
                  className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-brand-primary"
                >
                  <option value="">All categories</option>
                  {Array.from(new Set(books.map((book) => book.category))).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Title / author</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">ISBN</th>
                    <th className="px-6 py-3 text-right font-medium">Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {books.map((book) => (
                    <tr key={book.id} className="transition hover:bg-stone-50/70">
                      <td className="px-6 py-4">
                        <p className="font-medium text-stone-800">{book.title}</p>
                        <p className="mt-1 text-xs text-stone-500">{book.author}</p>
                      </td>
                      <td className="px-4 py-4 text-stone-600">{book.category}</td>
                      <td className="px-4 py-4 font-mono text-xs text-stone-500">{book.isbn}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-semibold text-stone-800">{book.availableCopies}</span>
                        <span className="text-stone-400"> / {book.totalCopies}</span>
                      </td>
                    </tr>
                  ))}
                  {books.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-sm text-stone-500">
                        {metrics.totalTitles === 0 ? "Your catalog is ready for its first book." : "No matching books found."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-stone-100 px-6 py-4 text-xs text-stone-500">
              <span>{books.length} {books.length === 1 ? "title" : "titles"} shown</span>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="rounded-xl border border-stone-200 px-2.5 py-1.5 disabled:opacity-40">Prev</button>
                <span>Page {page} / {totalPages}</span>
                <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="rounded-xl border border-stone-200 px-2.5 py-1.5 disabled:opacity-40">Next</button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-card sm:p-6">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-brand-secondary text-brand-primary">
                  <BookOpen className="h-5 w-5" />
                </div>
                <h2 className="font-semibold text-stone-900">Add a book</h2>
                <p className="mt-1 text-sm text-stone-500">Add a title to your library catalog.</p>
              </div>
              <span className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">
                Admin
              </span>
            </div>
            <div className="mb-5">
              <OCRBookCapture
                onFillBook={(book) => {
                  setForm((current) => ({
                    ...current,
                    title: book.title,
                    author: book.author,
                    category: book.category,
                    isbn: book.isbn,
                    publisher: book.publisher ?? current.publisher,
                    publishedYear: book.publishedYear ?? current.publishedYear,
                  }));
                  setFormMessage("Book metadata auto-filled from the scan.");
                  setFormError("");
                }}
              />
            </div>
            <form className="space-y-4" onSubmit={handleAddBook}>
              <InputField label="Book title" required value={form.title} onChange={(title) => setForm({ ...form, title })} placeholder="e.g. The Design of Everyday Things" />
              <InputField label="Author" required value={form.author} onChange={(author) => setForm({ ...form, author })} placeholder="Author name" />
              <div className="grid grid-cols-2 gap-3">
                <InputField label="ISBN" required value={form.isbn} onChange={(isbn) => setForm({ ...form, isbn })} placeholder="978..." />
                <InputField label="Category" required value={form.category} onChange={(category) => setForm({ ...form, category })} placeholder="Subject" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Published year" type="number" min={1000} max={new Date().getFullYear()} value={form.publishedYear} onChange={(publishedYear) => setForm({ ...form, publishedYear })} placeholder="Optional" />
                <InputField label="Copies" required type="number" min={1} max={100000} value={form.totalCopies} onChange={(totalCopies) => setForm({ ...form, totalCopies })} />
              </div>
              <InputField label="Publisher" value={form.publisher} onChange={(publisher) => setForm({ ...form, publisher })} placeholder="Optional" />
              <AnimatePresence mode="wait">
                {formError ? <ErrorNotice key="error" message={formError} /> : null}
                {formMessage ? (
                  <motion.p
                    key="success"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> {formMessage}
                  </motion.p>
                ) : null}
              </AnimatePresence>
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {submitting ? "Adding book..." : "Add to catalog"}
              </button>
            </form>
          </section>
        </div>

        <footer className="mt-8 flex flex-col justify-between gap-2 pb-4 text-xs text-stone-400 sm:flex-row">
          <span>{clientConfig.name} · {clientConfig.tagline}</span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Built for thoughtful library teams
            <ArrowUpRight className="ml-0.5 h-3 w-3" />
          </span>
        </footer>
      </div>
    </main>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-primary text-white shadow-sm">
        <LibraryBig className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-bold tracking-tight text-stone-900">{clientConfig.name}</p>
        <p className="text-xs text-stone-500">{clientConfig.tagline}</p>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof LibraryBig;
  label: string;
  value: number;
  tint: "green" | "blue" | "gold" | "purple";
}) {
  const iconColors = {
    green: "bg-brand-secondary text-brand-primary",
    blue: "bg-sky-100 text-sky-700",
    gold: "bg-amber-100 text-amber-700",
    purple: "bg-violet-100 text-violet-700",
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-stone-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-stone-900">
            {value.toLocaleString()}
          </p>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${iconColors[tint]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.article>
  );
}

function InputField({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  min,
  max,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs font-medium text-stone-700">
      {label}
      <input
        required={required}
        type={type}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm font-normal outline-none transition placeholder:text-stone-400 focus:border-brand-primary focus:ring-4 focus:ring-brand-secondary"
      />
    </label>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"
      role="alert"
    >
      <CircleAlert className="h-4 w-4 shrink-0" />
      {message}
    </motion.p>
  );
}
