import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Search,
  XCircle,
} from "lucide-react";
import { AdminDashboardlayout } from "../../components/admin";
import { adminLectureApi } from "../../api/adminLectureApi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/Dialog";

const LECTURE_STATUS_OPTS = [
  { value: "", label: "All lecture states" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

const JOB_STATUS_OPTS = [
  { value: "", label: "All job states" },
  { value: "queued", label: "Queued" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

function pillClass(kind) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";
  const map = {
    pending: `${base} bg-slate-100 text-slate-700`,
    queued: `${base} bg-amber-50 text-amber-800`,
    processing: `${base} bg-blue-50 text-blue-800`,
    completed: `${base} bg-emerald-50 text-emerald-800`,
    failed: `${base} bg-red-50 text-red-800`,
    cancelled: `${base} bg-gray-100 text-gray-700`,
    in_progress: `${base} bg-blue-50 text-blue-800`,
    skipped: `${base} bg-gray-100 text-gray-600`,
  };
  return map[kind] || `${base} bg-slate-50 text-slate-600`;
}

function logLevelRow(level) {
  if (level === "error") return "border-l-4 border-red-500 bg-red-50/60";
  if (level === "warn") return "border-l-4 border-amber-400 bg-amber-50/50";
  if (level === "ok") return "border-l-4 border-emerald-500 bg-emerald-50/40";
  return "border-l-4 border-slate-300 bg-slate-50/50";
}

function formatDt(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
}

export default function LectureProcessing() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [lectureStatus, setLectureStatus] = useState("");
  const [jobStatus, setJobStatus] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailErr, setDetailErr] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminLectureApi.list({
        page,
        limit,
        q: qDebounced || undefined,
        processingStatus: lectureStatus || undefined,
        jobStatus: jobStatus || undefined,
      });
      setItems(data.items || []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e.response?.data?.message || e.message || "Failed to load");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, qDebounced, lectureStatus, jobStatus]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openDetail = async (lectureId) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailErr(null);
    setDetailLoading(true);
    try {
      const { data } = await adminLectureApi.getDetail(lectureId);
      setDetail(data);
    } catch (e) {
      setDetailErr(e.response?.data?.message || e.message || "Failed to load detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

  return (
    <AdminDashboardlayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lecture pipeline</h1>
            <p className="mt-1 text-sm text-gray-600">
              See who uploaded each lecture, queue progress, stages, and outcomes —
              aligned with processing job records (same data the server uses for status).
            </p>
          </div>
          <Link
            to="/admin/dashboard"
            className="text-sm font-medium text-[#427cf0] hover:underline"
          >
            ← Back to dashboard
          </Link>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search title or email…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#427cf0]"
            />
          </div>
          <select
            value={lectureStatus}
            onChange={(e) => {
              setLectureStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#427cf0]"
          >
            {LECTURE_STATUS_OPTS.map((o) => (
              <option key={o.value || "all-l"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={jobStatus}
            onChange={(e) => {
              setJobStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#427cf0]"
          >
            {JOB_STATUS_OPTS.map((o) => (
              <option key={o.value || "all-j"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-700">Lecture</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Uploaded by</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Class</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Lecture status</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Job</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Progress</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Updated</th>
                  <th className="px-4 py-3 font-semibold text-gray-700" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#427cf0]" />
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                      No lectures match these filters.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <div className="max-w-[220px] truncate" title={row.title}>
                          {row.title}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <div className="max-w-[200px]">
                          <div className="truncate font-medium" title={row.owner?.email}>
                            {row.owner?.email || "—"}
                          </div>
                          {row.owner?.name && (
                            <div className="truncate text-xs text-gray-500">{row.owner.name}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <span className="line-clamp-2" title={row.class?.name}>
                          {row.class?.name || "—"}
                          {row.class?.code ? ` (${row.class.code})` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={pillClass(row.processingStatus)}>
                          {row.processingStatus}
                        </span>
                        {row.processingError && (
                          <div
                            className="mt-1 max-w-[200px] truncate text-xs text-red-600"
                            title={row.processingError}
                          >
                            {row.processingError}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.job ? (
                          <span className={pillClass(row.job.status)}>{row.job.status}</span>
                        ) : (
                          <span className="text-xs text-gray-400">No job row</span>
                        )}
                        {row.job?.failedStage && (
                          <div className="mt-1 text-xs text-red-600">
                            @ {row.job.failedStage}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-800">
                        {row.job ? `${row.job.overallProgress ?? 0}%` : "—"}
                        {row.job?.currentStage && (
                          <div className="text-xs text-gray-500">{row.job.currentStage}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {formatDt(row.updatedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openDetail(row.id)}
                          className="rounded-lg bg-[#427cf0] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3568d4]"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && items.length > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row">
              <p className="text-xs text-gray-500">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </button>
                <span className="text-sm text-gray-600">
                  Page {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent
          className="max-h-[90vh] max-w-[920px] translate-y-[-48%] overflow-y-auto md:max-w-4xl gap-0 p-0"
          showCloseButton
        >
          <DialogHeader className="border-b border-gray-100 px-6 py-4 text-left">
            <DialogTitle className="text-xl">Lecture pipeline detail</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 px-6 py-5">
            {detailLoading && (
              <div className="flex justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-[#427cf0]" />
              </div>
            )}
            {detailErr && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {detailErr}
              </div>
            )}
            {!detailLoading && detail && (
              <>
                <section className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">Lecture</h3>
                  <p className="mt-1 text-lg font-medium text-gray-900">
                    {detail.lecture?.title}
                  </p>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-gray-500">Lecture ID</dt>
                      <dd className="font-mono text-xs text-gray-800 break-all">
                        {detail.lecture?._id}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Recorded</dt>
                      <dd className="text-gray-800">{formatDt(detail.lecture?.recordedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Duration (sec)</dt>
                      <dd className="text-gray-800">{detail.lecture?.durationSec ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Lecture processing status</dt>
                      <dd className="mt-0.5">
                        <span className={pillClass(detail.lecture?.processingStatus)}>
                          {detail.lecture?.processingStatus}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  {detail.lecture?.processingError && (
                    <p className="mt-3 rounded border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">
                      {detail.lecture.processingError}
                    </p>
                  )}
                </section>

                <section className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-gray-100 p-4">
                    <h3 className="text-sm font-semibold text-gray-900">Owner</h3>
                    <p className="mt-1 text-sm text-gray-800">{detail.owner?.email}</p>
                    {detail.owner?.profile?.name && (
                      <p className="text-sm text-gray-600">{detail.owner.profile.name}</p>
                    )}
                    <p className="mt-2 text-xs text-gray-500">Role: {detail.owner?.role}</p>
                  </div>
                  <div className="rounded-lg border border-gray-100 p-4">
                    <h3 className="text-sm font-semibold text-gray-900">Class</h3>
                    <p className="mt-1 text-sm text-gray-800">
                      {detail.class?.name || "—"}
                      {detail.class?.code ? ` · ${detail.class.code}` : ""}
                    </p>
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Clock className="h-4 w-4" />
                    Pipeline timeline (derived from job + stages)
                  </h3>
                  <div className="space-y-2">
                    {(detail.pipelineLog || []).length === 0 ? (
                      <p className="text-sm text-gray-500">No pipeline events for this lecture.</p>
                    ) : (
                      detail.pipelineLog.map((line, idx) => (
                        <div
                          key={idx}
                          className={`rounded-r-md px-3 py-2 text-sm ${logLevelRow(line.level)}`}
                        >
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="text-xs tabular-nums text-gray-500">
                              {formatDt(line.at)}
                            </span>
                            <span className="font-medium text-gray-900">{line.message}</span>
                          </div>
                          {line.meta && Object.keys(line.meta).length > 0 && (
                            <pre className="mt-2 max-h-40 overflow-auto rounded bg-white/70 p-2 text-xs text-gray-700">
                              {JSON.stringify(line.meta, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {detail.primaryJob && (
                  <section>
                    <h3 className="mb-3 text-sm font-semibold text-gray-900">Processing job</h3>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <span className={pillClass(detail.primaryJob.status)}>
                        {detail.primaryJob.status}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {detail.primaryJob.overallProgress ?? 0}% overall
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        Stage: {detail.primaryJob.currentStage}
                      </span>
                      {detail.primaryJob.workerInstanceId && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-mono text-slate-600">
                          worker {detail.primaryJob.workerInstanceId}
                        </span>
                      )}
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 font-semibold text-gray-700">Stage</th>
                            <th className="px-3 py-2 font-semibold text-gray-700">Status</th>
                            <th className="px-3 py-2 font-semibold text-gray-700">%</th>
                            <th className="px-3 py-2 font-semibold text-gray-700">Started</th>
                            <th className="px-3 py-2 font-semibold text-gray-700">Finished</th>
                            <th className="px-3 py-2 font-semibold text-gray-700">Error</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(detail.primaryJob.stages || []).map((s) => (
                            <tr key={s.name}>
                              <td className="px-3 py-2 font-medium text-gray-900">{s.name}</td>
                              <td className="px-3 py-2">
                                <span className={pillClass(s.status)}>{s.status}</span>
                              </td>
                              <td className="px-3 py-2 tabular-nums">{s.progress ?? 0}</td>
                              <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                                {formatDt(s.startedAt)}
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                                {formatDt(s.completedAt)}
                              </td>
                              <td className="px-3 py-2 text-xs text-red-700 max-w-[200px] truncate" title={s.error}>
                                {s.error || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(detail.primaryJob.error || detail.primaryJob.errorStack) && (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                        {detail.primaryJob.error && (
                          <p className="font-medium text-red-900">{detail.primaryJob.error}</p>
                        )}
                        {detail.primaryJob.failedStage && (
                          <p className="mt-1 text-xs text-red-800">
                            Failed stage: {detail.primaryJob.failedStage}
                          </p>
                        )}
                        {detail.primaryJob.errorStack && (
                          <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-xs text-red-900/90">
                            {detail.primaryJob.errorStack}
                          </pre>
                        )}
                      </div>
                    )}
                  </section>
                )}

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-gray-900">Generated content snapshot</h3>
                  <ul className="grid gap-2 text-sm sm:grid-cols-2">
                    <li className="rounded border border-gray-100 px-3 py-2">
                      Transcript:{" "}
                      {detail.lecture?.transcript?.hasText ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> present
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-500">
                          <XCircle className="h-3.5 w-3.5" /> none
                        </span>
                      )}
                      {detail.lecture?.transcript?.wordCount != null && (
                        <span className="text-gray-600"> · {detail.lecture.transcript.wordCount} words</span>
                      )}
                    </li>
                    <li className="rounded border border-gray-100 px-3 py-2">
                      Notes:{" "}
                      {detail.lecture?.notes?.hasOverview ? "yes" : "no"}
                      {detail.lecture?.notes?.promptCount != null &&
                        ` · ${detail.lecture.notes.promptCount} prompts`}
                    </li>
                    <li className="rounded border border-gray-100 px-3 py-2">
                      Study guide:{" "}
                      {detail.lecture?.studyGuide?.hasContent
                        ? `yes (${detail.lecture.studyGuide.contentLength} chars)`
                        : "no"}
                    </li>
                    <li className="rounded border border-gray-100 px-3 py-2">
                      Quiz: {detail.lecture?.quiz?.questionCount ?? 0} questions
                    </li>
                    <li className="rounded border border-gray-100 px-3 py-2">
                      Flashcards: {detail.lecture?.flashCards?.cardCount ?? 0} cards
                    </li>
                  </ul>
                </section>

                {(detail.jobHistory || []).length > 1 && (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-gray-900">Job history</h3>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2">Job ID</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Progress</th>
                            <th className="px-3 py-2">Retries</th>
                            <th className="px-3 py-2">Updated</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {detail.jobHistory.map((j) => (
                            <tr key={j.id}>
                              <td className="px-3 py-2 font-mono text-xs">{j.id}</td>
                              <td className="px-3 py-2">
                                <span className={pillClass(j.status)}>{j.status}</span>
                              </td>
                              <td className="px-3 py-2 tabular-nums">{j.overallProgress ?? 0}%</td>
                              <td className="px-3 py-2">{j.retryCount ?? 0}</td>
                              <td className="px-3 py-2 text-xs whitespace-nowrap">
                                {formatDt(j.updatedAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {detail.primaryJob && (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-gray-900">Raw job document</h3>
                    <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
                      {JSON.stringify(detail.primaryJob, null, 2)}
                    </pre>
                  </section>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminDashboardlayout>
  );
}
