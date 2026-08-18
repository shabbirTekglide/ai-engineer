import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Loader2, Podcast, AlertTriangle, CheckCircle2 } from "lucide-react";
import { AdminDashboardlayout } from "../../components/admin";
import { adminLectureApi } from "../../api/adminLectureApi";

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [statsErr, setStatsErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setStatsErr(null);
      try {
        const { data } = await adminLectureApi.getStats();
        if (!cancelled) setStats(data);
      } catch (e) {
        if (!cancelled) {
          setStatsErr(e.response?.data?.message || e.message || "Could not load stats");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const q = stats?.queue || {};
  const lec = stats?.lectures || {};

  return (
    <AdminDashboardlayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">
            Overview of lecture processing and queue health. Open the pipeline view for per-user
            uploads, stage-by-stage progress, and failures.
          </p>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#427cf0] text-white">
                <Podcast className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-gray-900">Lecture pipeline</h2>
                <p className="mt-0.5 text-sm text-gray-600">
                  Track which student uploaded each lecture, job status, and the full processing
                  timeline through transcription, notes, study guide, quiz, and flashcards.
                </p>
              </div>
            </div>
            <Link
              to="/admin/lectures"
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#427cf0] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3568d4]"
            >
              Open lecture pipeline
            </Link>
          </div>
        </div>

        {statsErr && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {statsErr}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-10 w-10 animate-spin text-[#427cf0]" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500">
                <Activity className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Queue · active</span>
              </div>
              <p className="mt-3 text-3xl font-bold text-gray-900">
                {(q.processing || 0) + (q.queued || 0)}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {q.processing || 0} processing · {q.queued || 0} queued
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-medium uppercase tracking-wide">Queue · done</span>
              </div>
              <p className="mt-3 text-3xl font-bold text-gray-900">{q.completed || 0}</p>
              <p className="mt-1 text-sm text-gray-600">completed jobs (all time)</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span className="text-xs font-medium uppercase tracking-wide">Queue · failed</span>
              </div>
              <p className="mt-3 text-3xl font-bold text-gray-900">{q.failed || 0}</p>
              <p className="mt-1 text-sm text-gray-600">
                {q.cancelled || 0} cancelled · {q.total || 0} total job rows
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500">
                <Podcast className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Lectures</span>
              </div>
              <p className="mt-3 text-3xl font-bold text-gray-900">{lec.total ?? 0}</p>
              <p className="mt-1 text-sm text-gray-600">
                {lec.completed || 0} completed · {lec.failed || 0} failed · {lec.processing || 0}{" "}
                processing
              </p>
            </div>
          </div>
        )}
      </div>
    </AdminDashboardlayout>
  );
}

export default Dashboard;
