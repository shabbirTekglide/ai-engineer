// src/pages/SettingsPage.jsx
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { useDispatch, useSelector } from "react-redux";
import {
  getSessions,
  logoutUser,
  revokeSession,
} from "../../store/slicers/authSlice";
import { cancelSubscription } from "../../store/slicers/authSlice";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import AuthApi from "../../api/authApi";

// --- Radix/Shadcn Table Components (Assumed Imports) ---
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/Table";
import {
  CheckCircle,
  KeyRound,
  Laptop,
  Loader2,
  LockIcon,
  LockKeyhole,
  LogOut,
  MonitorX,
  Save,
  ShieldAlert,
  Wifi,
  AlertTriangle,
  Eye,
  EyeClosed,
  EyeOff,
} from "lucide-react";
import PaymentForm from "../../components/kora/PaymentForm";
import ReactSpinner from "../../components/ui/ReactSpinner";

// --- Helper Function to Format Session Data ---
const formatSessions = (sessions, currentSessionId) => {
  return (sessions || [])
    .map((s) => {
      // Build location string: City, Region, Country
      const locationParts = [
        s.location?.city,
        s.location?.region,
        s.location?.country,
      ].filter(Boolean);
      const locationString =
        locationParts.length > 0
          ? locationParts.join(", ")
          : "Unknown Location";

      // Check if the session is revoked or the currently active one
      const isRevoked = !!s.revokedAt;
      const isCurrent = s._id === currentSessionId;

      // Use lastUsedAt or createdAt to show activity
      const lastUsed = new Date(s.lastUsedAt || s.createdAt).toLocaleString();

      return {
        _id: s._id,
        location: locationString,
        ip: s.ip,
        agent: s.userAgent,
        current: isCurrent,
        isRevoked: isRevoked,
        lastUsed: lastUsed,
      };
    })
    .filter((s) => !s.isRevoked); // Only show non-revoked sessions
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [loading, setLoading] = useState(false);
  // Assuming your state has a field for the current user's session ID (e.g., sessions.currentId)
  const { token, sessions, currentSessionId, subscriptionStatus } = useSelector(
    (state) => state.auth,
  );
  const [loadingSessionId, setLoadingSessionId] = useState(null);
  // Cancel subscription modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelPassword, setCancelPassword] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  // show password states
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  const handleShowPassword = () => {
    // console.log(showCurrentPassword, "show pass state")
      setShowCurrentPassword(!showCurrentPassword);
  }

   const handleShowNewPassword = () => {
    // console.log(showCurrentPassword, "show pass state")
      setShowNewPassword(!showNewPassword);
  }

  const handleShowConfirmPassword = () => {
    // console.log(showCurrentPassword, "show pass state")
      setShowConfirmNewPassword(!showConfirmNewPassword);
  }
  // Fetch sessions on component mount
  useEffect(() => {
    const getAvailableSessions = async () => {
      setLoading(true);
      try {
        await dispatch(getSessions());
      } catch (error) {
        console.log(error, "error from setting tab");
      } finally {
        setLoading(false);
      }
    };
    getAvailableSessions();
  }, [dispatch]);

  const formattedSessions = formatSessions(sessions, currentSessionId);

  const currentUserId = useSelector(
    (state) => state.auth.user?._id || state.auth.user?.id,
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    },
  });

  const handleLogout = () => {
    dispatch(logoutUser())
      .unwrap()
      .then(() => {
        navigate("/login");
      })
      .catch((err) => {
        console.error("Logout failed:", err);
        toast.error("Logout failed. Please try again.");
      });
  };

  const onSubmitChangePassword = (data) => {
    setLoading(true);

    const { currentPassword, newPassword, confirmNewPassword } = data;
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      toast.error("All fields are required.");
      setLoading(false);
      return;
    }
    if (currentPassword === newPassword) {
      toast.error("New password must be different from the current password.");
      setLoading(false);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("New password and confirmation do not match.");
      setLoading(false);
      return;
    }

    AuthApi.changePass({
      token: token,
      oldPassword: currentPassword,
      newPassword: newPassword,
      confirmNewPassword: confirmNewPassword,
    })
      .then(() => {
        toast.success("Password changed successfully. Logging out...");

        dispatch(logoutUser());
        navigate("/login");
      })
      .catch((err) => {
        toast.error(
          err?.response?.data?.message || "Failed to change password",
        );
      })
      .finally(() => {
        setLoading(false);
        reset();
      });
  };

  const handleRevokeSession = (sessionId) => {
    setLoadingSessionId(sessionId);
    dispatch(revokeSession(sessionId))
      .unwrap()
      .then(() => {
        toast.success("Session revoked successfully");
      })
      .catch((err) => {
        console.error("Failed to revoke session:", err);
        toast.error("Failed to revoke session. Please try again.");
      })
      .finally(() => {
        setLoadingSessionId(null);
      });
  };

  // Cancel subscription handlers
  const openCancelModal = () => {
    setCancelPassword("");
    setShowCancelModal(true);
  };

  const confirmCancelSubscription = async (e) => {
    e.preventDefault();
    if (!cancelPassword) return toast.error("Please enter your password");
    setCancelLoading(true);
    try {
      const result = await dispatch(
        cancelSubscription({ userId: currentUserId, password: cancelPassword }),
      );
      if (cancelSubscription.fulfilled.match(result)) {
        toast.success("Subscription cancelled successfully");
        setShowCancelModal(false);
      } else {
        toast.error(result.payload || "Failed to cancel subscription");
      }
    } catch (err) {
      toast.error(err?.message || "Failed to cancel subscription");
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <>
      {loading ? (
        <ReactSpinner />
      ) : (
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
            Account Settings
          </h1>

          {/* Change Password Section (Unchanged) */}
          <Card className="shadow-sm rounded-2xl p-4 md:p-6 mb-8 border border-gray-100 bg-gradient-to-br from-gray-50 to-white">
            <div className="flex items-center gap-2 mb-5">
              <LockIcon className="w-5 h-5 text-[#783BF2]" />
              <h2 className="text-lg font-semibold text-gray-800">
                Change Password
              </h2>
            </div>

            <form
              onSubmit={handleSubmit(onSubmitChangePassword)}
              className="space-y-5"
            >
              {/* Current Password */}
              <div>
                <Label
                  htmlFor="current-password"
                  className="font-medium text-gray-700"
                >
                  Current Password <span className="text-red-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    {...register("currentPassword", {
                      required: "Current password is required",
                    })}
                    disabled={loading}
                    className="focus:border-[#783BF2] focus:border-2 focus:ring-[#783BF2]/20 pr-10"
                  />
                  {
                    showCurrentPassword  ? (
                        <Eye onClick={handleShowPassword} className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    ) : (
                        <EyeOff onClick={handleShowPassword} className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    )
                  }
                  {/* <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /> */}
                </div>
                {errors.currentPassword && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.currentPassword.message}
                  </p>
                )}
              </div>

              {/* New Password */}
              <div>
                <Label
                  htmlFor="new-password"
                  className="font-medium text-gray-700"
                >
                  New Password <span className="text-red-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    {...register("newPassword", {
                      required: "New password is required",
                      minLength: {
                        value: 6,
                        message: "Password must be at least 6 characters",
                      },
                    })}
                    disabled={loading}
                    className="focus:border-[#783BF2] focus:border-2 focus:ring-[#783BF2]/20 pr-10"
                  />
                  {
                    showNewPassword  ? (
                        <Eye onClick={handleShowNewPassword} className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    ) : (
                        <EyeOff onClick={handleShowNewPassword} className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    )
                  }
                  {/* <LockKeyhole className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /> */}
                </div>
                {errors.newPassword && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.newPassword.message}
                  </p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <Label
                  htmlFor="confirm-new-password"
                  className="font-medium text-gray-700"
                >
                  Confirm New Password <span className="text-red-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="confirm-new-password"
                    type={showConfirmNewPassword ? "text" : "password"}
                    {...register("confirmNewPassword", {
                      required: "Confirmation is required",
                    })}
                    disabled={loading}
                    className="focus:border-[#783BF2] focus:border-2 focus:ring-[#783BF2]/20 pr-10"
                  />
                   {
                    showConfirmNewPassword  ? (
                        <Eye onClick={handleShowConfirmPassword} className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    ) : (
                        <EyeOff onClick={handleShowConfirmPassword} className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    )
                  }
                  {/* <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /> */}
                </div>
                {errors.confirmNewPassword && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.confirmNewPassword.message}
                  </p>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  className="bg-[#783BF2] hover:bg-[#5b23cb] text-white font-medium shadow-md hover:shadow-lg transition-all cursor-pointer px-6"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin w-4 h-4 mr-2" />{" "}
                      Updating...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" /> Update Password
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Card>

          {/* Active Devices Section (Updated) */}
          <Card className="shadow-sm rounded-2xl p-6 mb-8 border border-gray-100 bg-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <Laptop className="w-5 h-5 text-[#783BF2]" />
                  Active Devices
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Manage devices currently logged into your account.
                </p>
              </div>
            </div>
            <div className="relative overflow-x-auto">
              <div className="max-h-[800px] overflow-y-auto overflow-x-auto max-w-[700px] lg:max-w-[100%]">
                <Table className="w-full border-collapse min-w-[640px]">
                  <TableHeader className="sticky top-0 bg-gray-50">
                    <TableRow>
                      <TableHead className="text-left whitespace-nowrap py-6 px-4 font-semibold text-gray-600 text-xs uppercase">
                        Status
                      </TableHead>
                      <TableHead className="text-left whitespace-nowrap py-6 px-4 font-semibold text-gray-600 text-xs uppercase">
                        Location
                      </TableHead>
                      <TableHead className="text-left whitespace-nowrap py-6 px-4 font-semibold text-gray-600 text-xs uppercase">
                        IP Address
                      </TableHead>
                      <TableHead className="text-left whitespace-nowrap py-6 px-4 font-semibold text-gray-600 text-xs uppercase">
                        Device / Browser
                      </TableHead>
                      <TableHead className="text-left whitespace-nowrap py-6 px-4 font-semibold text-gray-600 text-xs uppercase">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {formattedSessions.length > 0 ? (
                      formattedSessions.map((device) => (
                        <>
                          {loading ? (
                            <ReactSpinner />
                          ) : (
                            <TableRow
                              key={device._id}
                              className={`border-b border-gray-200 transition hover:bg-gray-50 ${device.current ? "bg-blue-50/40" : ""}`}
                            >
                              <TableCell className="whitespace-nowrap py-6 px-4">
                                <div className="flex flex-col">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full w-fit ${
                                      device.current
                                        ? "bg-green-100 text-green-700"
                                        : "bg-gray-100 text-gray-600"
                                    }`}
                                  >
                                    <Wifi className="w-3 h-3" />
                                    {device.current
                                      ? "Current Session"
                                      : "Active"}
                                  </span>
                                  <span className="text-xs text-gray-400 mt-1">
                                    Last used: {device.lastUsed}
                                  </span>
                                </div>
                              </TableCell>

                              <TableCell className="whitespace-nowrap py-6 px-4 text-gray-700 font-semibold text-sm">
                                {device.location || "Unknown"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap py-6 px-4 text-gray-700 font-semibold text-sm">
                                {device.ip}
                              </TableCell>
                              <TableCell className="whitespace-nowrap py-6 px-4 text-gray-700 font-semibold text-sm">
                                {device.agent}
                              </TableCell>

                              <TableCell className="whitespace-nowrap py-6 px-4 text-right">
                                {!device.current && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      handleRevokeSession(device._id)
                                    }
                                    disabled={loadingSessionId === device._id}
                                    className={` rounded-full transition ${loadingSessionId === device._id ? "bg-gray-500 text-white cursor-not-allowed pointer-events-none" : "bg-red-500 text-white hover:bg-red-600 cursor-pointer pointer-events-auto"} `}
                                  >
                                    {loadingSessionId === device._id ? (
                                      <>
                                        <Loader2 className="animate-spin w-4 h-4 mr-2" />
                                        Logging Out...
                                      </>
                                    ) : (
                                      "Log Out"
                                    )}
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-8 text-gray-500"
                        >
                          <MonitorX className="w-5 h-5 inline-block mr-1 text-gray-400" />
                          No active sessions found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </Card>

          {/* Cancel Subscription Section */}
          <Card className="shadow-sm rounded-2xl p-6 mb-8 border border-blue-200 bg-gradient-to-br from-blue-50 to-white">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-blue-700">
                  Cancel Subscription
                </h2>
              </div>
            </div>

            <p className="text-sm text-blue-700 mb-5 leading-relaxed">
              If you cancel your subscription you may lose access to premium
              features. This action can be reverted by contacting support.
            </p>

            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-xs text-blue-600">
                <ShieldAlert className="w-4 h-4" />
                <span>Confirm with your password to cancel.</span>
              </div>

              <Button
                disabled={
                  !subscriptionStatus || subscriptionStatus !== "active"
                }
                onClick={openCancelModal}
                className="bg-[#2D79F4] hover:bg-[#2566d9] text-white font-medium shadow-md hover:shadow-lg transition-all px-6 py-2 cursor-pointer"
              >
                Cancel Subscription
              </Button>
            </div>
          </Card>
          {/* Logout Section (Unchanged) */}
          <Card className="shadow-sm rounded-2xl p-6 border border-red-100 bg-gradient-to-br from-red-50 to-white">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <LogOut className="w-5 h-5 text-red-600" />
                <h2 className="text-lg font-semibold text-red-700">Log Out</h2>
              </div>
            </div>

            <p className="text-sm text-red-600 mb-5 leading-relaxed">
              For security, make sure to log out when you’re done, especially on
              shared devices.
            </p>

            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-xs text-red-500">
                <ShieldAlert className="w-4 h-4" />
                <span>Your session will be securely terminated.</span>
              </div>

              <Button
                onClick={handleLogout}
                className="bg-red-500 hover:bg-red-600 text-white font-medium shadow-md hover:shadow-lg transition-all px-6 py-2 cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </Card>

          {/* Cancel Confirmation Modal */}
          {showCancelModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                  <div
                    className={`p-2 rounded-full bg-blue-100 text-blue-600`}
                  >
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">
                      Confirm Cancellation
                    </h3>
                    <p className="text-xs text-gray-500">
                      Enter your password to confirm cancellation
                    </p>
                  </div>
                </div>
                <form
                  onSubmit={confirmCancelSubscription}
                  className="p-6 space-y-4"
                >
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={cancelPassword}
                        onChange={(e) => setCancelPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full pl-3 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition text-sm"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                   
                    <button
                      type="submit"
                      disabled={!cancelPassword || cancelLoading}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium text-white rounded-[10px] shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${cancelLoading ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
                    >
                      {cancelLoading ? "Processing..." : "Confirm Cancel"}
                    </button>
                     <button
                      type="button"
                      onClick={() => {
                        setShowCancelModal(false);
                        setCancelPassword("");
                      }}
                      className="px-4 py-3 text-sm font-medium text-white rounded-[10px] transition bg-red-500 hover:bg-red-600 cursor-pointer"
                      disabled={cancelLoading}
                    >
                      Close
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
          {/* <PaymentForm/> */}
        </div>
      )}
    </>
  );
}
