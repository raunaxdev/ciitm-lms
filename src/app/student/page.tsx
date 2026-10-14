"use client";

import { BookOpen, Coins, LoaderCircle, LogOut, Search, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
};

type Transaction = {
  id: string;
  profileId: string;
  bookId: string;
  status: "ISSUED" | "OVERDUE" | "RETURNED" | "LOST";
  issuedAt: string;
  dueAt: string;
  returnedAt: string | null;
  fineAmount: number;
  book: { id: string; title: string; author: string; isbn: string; category: string } | null;
};

const pageSize = 6;

export default function StudentPortalPage() {
  const [user, setUser] = useState<Profile | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busyBookId, setBusyBookId] = useState<string | null>(null);
  const [requestingBookId, setRequestingBookId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const fetchBooks = useCallback(
    async (nextPage = 1, nextSearch = search) => {
      const query = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(pageSize),
      });
      if (nextSearch.trim()) {
        query.set("search", nextSearch.trim());
        query.set("semantic", "true");
      }

      const response = await fetch(`/api/books?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load the library catalog.");
      const data = (await response.json()) as {
        books: Book[];
        pagination: { page: number; totalPages: number };
      };
      setBooks(data.books);
      setPageCount(data.pagination.totalPages ?? 1);
      setPage(data.pagination.page ?? nextPage);
    },
    [search],
  );

  const fetchTransactions = useCallback(async () => {
    const response = await fetch("/api/transactions", { cache: "no-store" });
    if (!response.ok) {
      if (response.status === 401) {
        setUser(null);
        return;
      }
      throw new Error("Could not retrieve your borrowing history.");
    }
    const data = (await response.json()) as { transactions: Transaction[] };
    setTransactions(data.transactions);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/auth", { cache: "no-store" })
        .then(async (response) => {
          if (response.status === 401) return null;
          if (!response.ok) throw new Error("Could not verify your session.");
          const data = (await response.json()) as { user: Profile };
          return data.user;
        }),
      fetchBooks(1),
    ])
      .then(([profile]) => {
        if (!active) return;
        setUser(profile);
        if (profile) {
          fetchTransactions().catch(() => undefined);
        }
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
  }, [fetchBooks, fetchTransactions]);

  useEffect(() => {
    if (!user) return;
    void fetchBooks(page, search);
  }, [fetchBooks, page, search, user]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
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
      if (!response.ok || !data.user) throw new Error(data.error ?? "Sign in failed.");
      setUser(data.user);
      setPassword("");
      setMessage("Signed in successfully.");
      await fetchBooks(1, "");
      await fetchTransactions();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setUser(null);
    setTransactions([]);
  }

  async function issueBook(bookId: string) {
    if (!user) return;
    setBusyBookId(bookId);
    setMessage("");
    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "issue", bookId }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Book issue failed.");
      setMessage(data.message ?? "Book issued successfully.");
      await fetchBooks(page, search);
      await fetchTransactions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Book issue failed.");
    } finally {
      setBusyBookId(null);
    }
  }

  async function returnBook(transactionId: string, bookId: string) {
    setMessage("");
    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "return", transactionId, bookId }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Return failed.");
      setMessage(data.message ?? "Book returned successfully.");
      await fetchBooks(page, search);
      await fetchTransactions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Return failed.");
    }
  }

  async function requestBook(bookId: string) {
    setRequestingBookId(bookId);
    setMessage("");
    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", bookId }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Request could not be submitted.");
      setMessage(data.message ?? "Book request submitted for review.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request could not be submitted.");
    } finally {
      setRequestingBookId(null);
    }
  }

  async function downloadReceipt(transactionId: string) {
    setMessage("");
    const response = await fetch(`/api/receipts/${transactionId}`);
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error ?? "Receipt generation failed.");
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `ciitm-receipt-${transactionId}.pdf`;
    anchor.click();
    window.URL.revokeObjectURL(downloadUrl);
  }

  const semanticSuggestions = ["AI books", "Database systems", "Operating systems", "Web development"];
  const activeLoans = transactions.filter((transaction) => transaction.status === "ISSUED" || transaction.status === "OVERDUE");
  const totalFine = transactions.reduce((sum, item) => sum + Number(item.fineAmount ?? 0), 0);

  if (authLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <LoaderCircle className="h-8 w-8 animate-spin text-emerald-700" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
        <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-md">
          <div className="mb-8 flex items-center gap-3">
            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">CIITM</p>
              <p className="text-lg font-semibold text-slate-900">Student portal</p>
            </div>
          </div>
          <h1 className="text-3xl font-semibold text-slate-900">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-500">Sign in to issue books and track your loans.</p>
          {authError ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{authError}</p> : null}
          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <label className="block text-sm font-medium text-slate-700">
              Student email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-emerald-500 focus:outline-none"
                placeholder="student1@ciitm.edu"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-emerald-500 focus:outline-none"
                placeholder="••••••••••"
              />
            </label>
            <button
              type="submit"
              disabled={authLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
            >
              {authLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Sign in securely
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-slate-400">Demo credentials: student1@ciitm.edu • Student@1123</p>
          <p className="mt-3 text-center text-sm text-slate-500">
            New student? <a href="/register" className="font-semibold text-emerald-700">Create an account</a>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">{clientConfig.name}</p>
            <p className="text-sm text-slate-500">{clientConfig.tagline}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="font-semibold text-slate-800">{user.name}</p>
              <p className="text-xs text-slate-500">{user.role}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Student dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold">Your library account</h1>
          </div>
        </div>

        <section className="mb-8 grid gap-4 md:grid-cols-3">
          <StatCard label="Active loans" value={String(activeLoans.length)} />
          <StatCard label="Outstanding fines" value={`₹${totalFine.toFixed(2)}`} />
          <StatCard label="Available titles" value={String(books.length)} />
        </section>

        {message ? <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Browse catalog</h2>
                <p className="text-sm text-slate-500">Natural-language and semantic search by title, author, ISBN, or subject.</p>
              </div>
              <label className="relative block w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Try 'AI books' or 'database systems'"
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
                />
              </label>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {semanticSuggestions.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setSearch(term)}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                >
                  {term}
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {books.map((book) => (
                <article key={book.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">{book.title}</p>
                      <p className="text-sm text-slate-500">{book.author}</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">{book.category}</span>
                  </div>
                  <dl className="mb-4 space-y-2 text-sm text-slate-600">
                    <div className="flex justify-between gap-4"><dt>ISBN</dt><dd>{book.isbn}</dd></div>
                    <div className="flex justify-between gap-4"><dt>Available</dt><dd>{book.availableCopies} / {book.totalCopies}</dd></div>
                  </dl>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => issueBook(book.id)}
                      disabled={book.availableCopies < 1 || busyBookId === book.id}
                      className="flex-1 rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                    >
                      {busyBookId === book.id ? "Processing..." : book.availableCopies > 0 ? "Issue book" : "Unavailable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => requestBook(book.id)}
                      disabled={requestingBookId === book.id || busyBookId === book.id}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-60"
                    >
                      {requestingBookId === book.id ? "Requesting..." : "Request"}
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between text-sm text-slate-500">
              <button type="button" disabled={page <= 1} onClick={() => void fetchBooks(page - 1, search)} className="disabled:opacity-40">Previous</button>
              <span>Page {page} / {pageCount}</span>
              <button type="button" disabled={page >= pageCount} onClick={() => void fetchBooks(page + 1, search)} className="disabled:opacity-40">Next</button>
            </div>
          </section>

          <aside className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-xl font-semibold">My borrowings</h2>
              <p className="mt-1 text-sm text-slate-500">Check due dates and outstanding fines.</p>
            </div>
            <div className="space-y-3">
              {transactions.length === 0 ? <p className="text-sm text-slate-500">No loans yet.</p> : null}
              {transactions.map((transaction) => (
                <div key={transaction.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-800">{transaction.book?.title ?? "Book"}</p>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${transaction.status === "OVERDUE" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {transaction.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Due: {new Date(transaction.dueAt).toLocaleDateString()} • Fine: ₹{Number(transaction.fineAmount).toFixed(2)}</p>
                  {transaction.status === "ISSUED" || transaction.status === "OVERDUE" ? (
                    <button
                      type="button"
                      onClick={() => transaction.book && returnBook(transaction.id, transaction.book.id)}
                      className="mt-3 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"
                    >
                      Return book
                    </button>
                  ) : null}
                  {Number(transaction.fineAmount ?? 0) > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        void downloadReceipt(transaction.id).catch((error: unknown) => {
                          setMessage(error instanceof Error ? error.message : "Receipt generation failed.");
                        });
                      }}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                    >
                      Download receipt
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 inline-flex rounded-xl bg-emerald-100 p-2 text-emerald-700">
        {label === "Outstanding fines" ? <Coins className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
      </div>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}
