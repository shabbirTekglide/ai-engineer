import React, { useEffect, useState } from "react";
import { AdminDashboardlayout } from "../../components/admin";
import {
  Search,
  Filter,
  Download,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import {
  cancelSubscription,
  getAllSubscriptions,
} from "../../store/slicers/configSlice";
import SubscriptionUsageDialog from "../../components/admin/SubscriptionUsageDialog";

// 1. Plan Limits
const PLAN_LIMITS_HOURS = {
  free: 3,
  basic_plan: 20,
  pro_plan: 100,
};

function Payments() {
  const dispatch = useDispatch();
  const { subscriptions, loading } = useSelector((state) => state.adminConfig);
  const [isSubscriptionUsageDialogOpen, setIsSubscriptionUsageDialogOpen] = useState(false);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState(null);
  // UI States
  const [filterPlan, setFilterPlan] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // --- MODAL STATES ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null); // Jis user ko cancel krna hai
  const [adminPassword, setAdminPassword] = useState("");
  const [actionType, setActionType] = useState("cancel"); // 'cancel' or 'revoke'
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    dispatch(getAllSubscriptions(filterPlan));
  }, [dispatch, filterPlan]);

  const filteredData =
    subscriptions?.filter((user) => {
      const searchLower = searchTerm.toLowerCase();
      const nameMatch = user.name?.toLowerCase().includes(searchLower);
      const emailMatch = user.email?.toLowerCase().includes(searchLower);
      return nameMatch || emailMatch;
    }) || [];

  // --- 2. Action Trigger (Open Modal) ---
  const initiateAction = (user, type) => {
    setSelectedUser(user);
    setActionType(type); // 'revoke' for free, 'cancel' for paid
    setAdminPassword(""); // Reset password field
    setIsModalOpen(true);
  };

  // --- 3. Submit Action (Dispatch with Password) ---
  const handleSubmitAction = async (e) => {
    e.preventDefault();
    if (!adminPassword) return alert("Please enter admin password");
    if (!selectedUser) return;

    setActionLoading(true);

    // Dispatch Thunk with ID and Password
    const resultAction = await dispatch(
      cancelSubscription({
        userId: selectedUser.id,
        password: adminPassword,
      }),
    );

    setActionLoading(false);

    if (cancelSubscription.fulfilled.match(resultAction)) {
      // Success
      setIsModalOpen(false);
      setAdminPassword("");
      setSelectedUser(null);
      // Optional: Show success toast
    } else {
      // Failure (Wrong password or server error)
      alert(`Error: ${resultAction.payload}`);
    }
  };

  const getConsumptionData = (user) => {
    const planKey = user.plan || "free";
    const limitHours = PLAN_LIMITS_HOURS[planKey] || 3;
    const limitSeconds = limitHours * 3600;

    let currentAvailable = user.availableSeconds || 0;
    const isStopped = [
      "expired",
      "completed",
      "cancelled",
      "canceled",
    ].includes(user.status);

    if (isStopped) {
      currentAvailable = 0;
    }

    const usedSeconds = Math.max(0, limitSeconds - currentAvailable);
    const percent = Math.min(
      100,
      Math.max(0, (usedSeconds / limitSeconds) * 100),
    );
    const hoursLeft = (currentAvailable / 3600).toFixed(1);

    return { percent, hoursLeft, limitHours, isStopped };
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700 border-green-200";
      case "expired":
        return "bg-red-100 text-red-700 border-red-200";
      case "cancelled":
        return "bg-gray-100 text-gray-700 border-gray-200";
      default:
        return "bg-blue-100 text-blue-700 border-blue-200";
    }
  };

  const formatPlanName = (plan) => {
    if (plan === "pro_plan") return "Pro Plan";
    if (plan === "basic_plan") return "Basic Plan";
    return "Free Tier";
  };

  return (
    <AdminDashboardlayout>
      <div className="space-y-6 bg-gray-50 relative w-full">
        {/* Header & Filters */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Payments & Subscriptions
            </h1>
            <p className="text-gray-500 text-sm">
              Manage user subscriptions and billing details.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg text-sm font-medium hover:bg-gray-50 text-gray-700 shadow-sm transition">
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              className="border rounded-lg px-3 py-2 text-sm bg-white"
              value={filterPlan}
              onChange={(e) => setFilterPlan(e.target.value)}
            >
              <option value="all">All Subscriptions</option>
              <option value="free">Free</option>
              <option value="basic_plan">Basic</option>
              <option value="pro_plan">Pro</option>
            </select>
          </div>
        </div>

        {/* --- TABLE SECTION --- */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="min-w-[850px] w-full text-left border-collapse">
                <thead className="bg-[#F2F2F2] w-full sticky top-0">
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase">
                      User
                    </th>
                    <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase">
                      Plan
                    </th>
                    <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase w-48">
                      Usage / Limit
                    </th>
                    <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase">
                      Amount
                    </th>
                    <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase">
                      Status
                    </th>
                    <th className="whitespace-nowrap text-left py-6 px-4 text-[#737373] font-semibold text-[12px] leading-[24px] font-[Inter] uppercase text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredData && filteredData.length > 0 ? (
                    filteredData.map((user) => {
                      const { percent, hoursLeft, limitHours, isStopped } =
                        getConsumptionData(user);

                      return (
                        <tr
                          key={user.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            <div className="flex flex-col">
                              <span className="font-medium text-gray-900">
                                {user.name}
                              </span>
                              <span className="text-xs text-gray-500">
                                {user.email}
                              </span>
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${user.plan === "pro_plan"
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : user.plan === "basic_plan"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-gray-50 text-gray-600 border-gray-200"
                                }`}
                            >
                              {formatPlanName(user.plan)}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap ">
                            <div className="flex flex-col gap-1 w-full max-w-[140px]">
                              <div className="flex justify-between text-[10px] text-gray-500 font-medium">
                                <span
                                  className={isStopped ? "text-red-500" : ""}
                                >
                                  {hoursLeft}h left
                                </span>
                                <span>{limitHours}h</span>
                              </div>
                              <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${isStopped
                                    ? "bg-red-500"
                                    : percent >= 90
                                      ? "bg-red-500"
                                      : percent >= 75
                                        ? "bg-amber-500"
                                        : "bg-green-500"
                                    }`}
                                  style={{ width: `${percent}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            {user.amount}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(user.status)}`}
                            >
                              {user.status === "active" && (
                                <CheckCircle className="h-3 w-3" />
                              )}
                              {user.status === "expired" && (
                                <AlertCircle className="h-3 w-3" />
                              )}
                              {(user.status === "cancelled" ||
                                user.status === "canceled") && (
                                  <XCircle className="h-3 w-3" />
                                )}
                              <span className="capitalize">{user.status}</span>
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              {/* <button
                                onClick={() => {
                                  setIsSubscriptionUsageDialogOpen(true);
                                  setSelectedSubscriptionId(user.subscriptionId);
                                  console.log('isSubscriptionUsageDialogOpen', isSubscriptionUsageDialogOpen);
                                }}
                                className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 px-3 py-1.5 rounded-md border border-transparent hover:border-red-200 transition font-medium"
                              >
                                Usage
                              </button> */}
                              {user.status === "active" &&

                                // ✅ 4. Conditional Button Logic
                                (user.plan === "free" ? (
                                  <button
                                    onClick={() =>
                                      initiateAction(user, "revoke")
                                    }
                                    className="text-xs text-orange-600 hover:text-orange-800 hover:bg-orange-50 px-3 py-1.5 rounded-md border border-transparent hover:border-orange-200 transition font-medium"
                                  >
                                    Revoke
                                  </button>
                                ) : (
                                  <button
                                    onClick={() =>
                                      initiateAction(user, "cancel")
                                    }
                                    className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 px-3 py-1.5 rounded-md border border-transparent hover:border-red-200 transition font-medium"
                                  >
                                    Cancel
                                  </button>


                                ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan="6"
                        className="px-6 py-12 text-center text-gray-500"
                      >
                        No records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* --- 5. SECURITY MODAL --- */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                <div
                  className={`p-2 rounded-full ${actionType === "revoke" ? "bg-orange-100 text-orange-600" : "bg-red-100 text-red-600"}`}
                >
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800 capitalize">
                    {actionType} Subscription
                  </h3>
                  <p className="text-xs text-gray-500">
                    Security verification required
                  </p>
                </div>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSubmitAction} className="p-6 space-y-4">
                <p className="text-sm text-gray-600">
                  Are you sure you want to <strong>{actionType}</strong> the
                  subscription for
                  <span className="font-semibold text-gray-900 mx-1">
                    {selectedUser?.name}
                  </span>
                  ? This action cannot be undone.
                </p>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Admin Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Enter your password to confirm"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setAdminPassword("");
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition"
                    disabled={actionLoading}
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={!adminPassword || actionLoading}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${actionType === "revoke"
                      ? "bg-orange-600 hover:bg-orange-700"
                      : "bg-red-600 hover:bg-red-700"
                      }`}
                  >
                    {actionLoading && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Confirm{" "}
                    {actionType === "revoke" ? "Revoke" : "Cancellation"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
      <SubscriptionUsageDialog
        open={isSubscriptionUsageDialogOpen}
        onClose={() => setIsSubscriptionUsageDialogOpen(false)}
        subscriptionId={selectedSubscriptionId}
      />
    </AdminDashboardlayout>
  );
}

export default Payments;
