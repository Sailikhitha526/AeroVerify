
import { useEffect, useState } from "react";
import "./App.css";

const API = "http://127.0.0.1:8001";

function Icon({ name }) {
  const icons = {
    dashboard: "▦",
    passengers: "♙",
    documents: "▤",
    settings: "⚙",
    logout: "↪",
    plane: "✈",
    search: "⌕",
    bell: "♧",
    plus: "+",
    refresh: "↻",
    upload: "↑",
    eye: "◎",
    check: "✓",
    close: "×",
    menu: "☰",
  };

  return <span className="icon">{icons[name] || "•"}</span>;
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-symbol">
        <Icon name="plane" />
      </div>
      <div className="brand-copy">
        <strong>AeroVerify</strong>
        <span>AVIATION PORTAL</span>
      </div>
    </div>
  );
}

function getPassengerStatus(passenger) {
  return (
    passenger?.verification_status ||
    passenger?.status ||
    "Not started"
  );
}

function StatusBadge({ status }) {
  const value = (status || "Not started").toLowerCase();

  let className = "status-pending";

  if (value === "approved") className = "status-approved";
  else if (value === "rejected") className = "status-rejected";
  else if (value === "under review") className = "status-review";
  else if (value === "documents submitted") {
    className = "status-submitted";
  }

  return (
    <span className={`status-badge ${className}`}>
      <span className="status-dot" />
      {status || "Not started"}
    </span>
  );
}

// --------------------------------------------------
// PASSENGER VERIFICATION PROGRESS TRACKER
// --------------------------------------------------

function VerificationTracker({ passenger, documents }) {
  const status = getPassengerStatus(passenger);

  const hasDocuments =
    documents.length > 0 ||
    passenger.documents_submitted === 1 ||
    passenger.documents_submitted === true;

  const isApproved = status === "Approved";
  const isRejected = status === "Rejected";
  const isUnderReview = status === "Under review";

  const steps = [
    {
      title: "Record created",
      description: "Your passenger information is registered.",
      completed: true,
    },
    {
      title: "Documents uploaded",
      description: hasDocuments
        ? "Your travel documents have been submitted."
        : "Upload your travel documents to continue.",
      completed: hasDocuments,
    },
    {
      title: "Admin review",
      description:
        isUnderReview || isApproved || isRejected
          ? "Your documents have been reviewed."
          : hasDocuments
            ? "Waiting for the administrator to review your documents."
            : "This step starts after document submission.",
      completed:
        isUnderReview || isApproved || isRejected,
    },
    {
      title: isRejected ? "Verification rejected" : "Final approval",
      description: isApproved
        ? "Your passenger verification is approved."
        : isRejected
          ? "Your verification was rejected. Check the review note below."
          : "Your final verification decision is pending.",
      completed: isApproved || isRejected,
      rejected: isRejected,
    },
  ];

  const completedCount = steps.filter(
    (step) => step.completed
  ).length;

  const progress = isApproved
    ? 100
    : isRejected
      ? 100
      : Math.round((completedCount / steps.length) * 100);

  return (
    <section className="content-card verification-tracker">
      <div className="section-heading">
        <div>
          <h3>Verification progress</h3>
          <p>Track your passenger verification journey.</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="tracker-passenger">
        <div className="tracker-avatar">
          {(passenger.full_name || "P")
            .charAt(0)
            .toUpperCase()}
        </div>

        <div className="tracker-passenger-info">
          <strong>{passenger.full_name}</strong>
          <span>
            {passenger.flight_number || "Flight not specified"}
            {" · "}
            {passenger.origin || "—"} → {passenger.destination || "—"}
          </span>
        </div>
      </div>

      <div className="tracker-progress-header">
        <strong>Overall progress</strong>
        <span>{progress}%</span>
      </div>

      <div className="tracker-progress-track">
        <div
          className="tracker-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="tracker-steps">
        {steps.map((step, index) => (
          <div className="tracker-step" key={step.title}>
            <div className="tracker-step-marker">
              <div
                className={`tracker-step-circle ${
                  step.rejected
                    ? "rejected"
                    : step.completed
                      ? "completed"
                      : "pending"
                }`}
              >
                {step.rejected
                  ? "×"
                  : step.completed
                    ? "✓"
                    : index + 1}
              </div>

              {index !== steps.length - 1 && (
                <div
                  className={`tracker-step-line ${
                    step.completed ? "completed" : ""
                  }`}
                />
              )}
            </div>

            <div className="tracker-step-content">
              <strong>{step.title}</strong>
              <span>{step.description}</span>
            </div>
          </div>
        ))}
      </div>

      {passenger.review_note && (
        <div className="tracker-review-note">
          <strong>Administrator's review note</strong>
          <p>{passenger.review_note}</p>
        </div>
      )}

      {isRejected && (
        <div className="tracker-status-message rejected">
          Your verification was rejected. Please contact the administrator
          for further assistance.
        </div>
      )}

      {isApproved && (
        <div className="tracker-status-message approved">
          Your passenger verification has been successfully approved.
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [mode, setMode] = useState("login");

  const [token, setToken] = useState(
    () => localStorage.getItem("aeroverify_token") || ""
  );

  const [user, setUser] = useState(null);
  const [dashboard, setDashboard] = useState({});
  const [passengers, setPassengers] = useState([]);
  const [documents, setDocuments] = useState({});
  const [selectedFiles, setSelectedFiles] = useState({});

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const [flightNumber, setFlightNumber] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");

  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [creatingPassenger, setCreatingPassenger] = useState(false);

  const [reviewNotes, setReviewNotes] = useState({});
  const [actionId, setActionId] = useState(null);

  const [refresh, setRefresh] = useState(0);
  const [activePage, setActivePage] = useState("overview");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdmin = user?.role?.toLowerCase() === "admin";

  function showMessage(text, error = false) {
    setMessage(text);
    setIsError(error);
  }

  // --------------------------------------------------
  // API HELPER
  // --------------------------------------------------

  async function apiRequest(path, options = {}, accessToken = token) {
    const isFormData = options.body instanceof FormData;

    const headers = {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${API}${path}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.detail || data.message || "Request failed."
      );
    }

    return data;
  }

  // --------------------------------------------------
  // LOGIN AND REGISTRATION
  // --------------------------------------------------

  async function handleSubmit(event) {
    event.preventDefault();

    setLoading(true);
    showMessage("");

    try {
      if (mode === "register") {
        await apiRequest(
          "/api/auth/register",
          {
            method: "POST",
            body: JSON.stringify({
              full_name: fullName,
              email,
              password,
            }),
          },
          ""
        );

        setMode("login");
        setPassword("");

        showMessage(
          "Account created successfully. Please sign in."
        );

        return;
      }

      const data = await apiRequest(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
          }),
        },
        ""
      );

      const accessToken = data.access_token || data.token;

      if (!accessToken) {
        throw new Error("Authentication token was not received.");
      }

      localStorage.setItem("aeroverify_token", accessToken);
      setToken(accessToken);
      setFullName(data.user?.full_name || "");

      showMessage("Welcome to AeroVerify.");
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // LOAD DASHBOARD DATA
  // --------------------------------------------------

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function loadDashboard() {
      setDataLoading(true);

      try {
        const [userData, dashboardData, passengerData] =
          await Promise.all([
            apiRequest("/api/auth/me"),
            apiRequest("/api/dashboard"),
            apiRequest("/api/passengers"),
          ]);

        if (cancelled) return;

        setUser(userData.user || userData);
        setDashboard(dashboardData || {});

        const records = Array.isArray(passengerData)
          ? passengerData
          : passengerData.passengers || [];

        setPassengers(records);

        const documentEntries = await Promise.all(
          records.map(async (passenger) => {
            try {
              const docs = await apiRequest(
                `/api/passengers/${passenger.id}/documents`
              );

              return [
                passenger.id,
                Array.isArray(docs)
                  ? docs
                  : docs.documents || [],
              ];
            } catch {
              return [passenger.id, []];
            }
          })
        );

        if (!cancelled) {
          setDocuments(Object.fromEntries(documentEntries));
        }
      } catch (error) {
        if (!cancelled) {
          showMessage(error.message, true);
        }
      } finally {
        if (!cancelled) {
          setDataLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [token, refresh]);

  // --------------------------------------------------
  // LOGOUT
  // --------------------------------------------------

  function logout() {
    localStorage.removeItem("aeroverify_token");

    setToken("");
    setUser(null);
    setDashboard({});
    setPassengers([]);
    setDocuments({});
    setSelectedFiles({});
    setReviewNotes({});

    setActivePage("overview");
    setMessage("");
    setSearch("");
  }

  // --------------------------------------------------
  // CREATE PASSENGER
  // --------------------------------------------------

  async function createPassenger(event) {
    event.preventDefault();

    setCreatingPassenger(true);
    showMessage("");

    try {
      await apiRequest("/api/passengers", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName,
          email,
          flight_number: flightNumber,
          origin,
          destination,
        }),
      });

      setFlightNumber("");
      setOrigin("");
      setDestination("");

      showMessage("Passenger record created successfully.");

      setActivePage("passengers");
      setRefresh((value) => value + 1);
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      setCreatingPassenger(false);
    }
  }

  // --------------------------------------------------
  // SELECT DOCUMENT
  // --------------------------------------------------

  function chooseFile(passengerId, file) {
    if (!file) return;

    const allowed = ["pdf", "jpg", "jpeg", "png"];

    const extension = file.name
      .split(".")
      .pop()
      .toLowerCase();

    if (!allowed.includes(extension)) {
      showMessage("Choose a PDF, JPG, JPEG or PNG file.", true);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showMessage("Maximum document size is 5 MB.", true);
      return;
    }

    setSelectedFiles((previous) => ({
      ...previous,
      [passengerId]: file,
    }));

    showMessage("Document selected.");
  }

  // --------------------------------------------------
  // UPLOAD DOCUMENT
  // --------------------------------------------------

  async function uploadDocuments(passengerId) {
    const file = selectedFiles[passengerId];

    if (!file) {
      showMessage("Please select a document first.", true);
      return;
    }

    setActionId(passengerId);
    showMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      await apiRequest(
        `/api/passengers/${passengerId}/documents`,
        {
          method: "POST",
          body: formData,
        }
      );

      setSelectedFiles((previous) => ({
        ...previous,
        [passengerId]: null,
      }));

      showMessage("Document uploaded successfully.");
      setRefresh((value) => value + 1);
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      setActionId(null);
    }
  }

  // --------------------------------------------------
  // VIEW PROTECTED DOCUMENT
  // --------------------------------------------------

  async function viewDocument(documentId) {
    const newTab = window.open("about:blank", "_blank");

    try {
      const response = await fetch(
        `${API}/api/documents/${documentId}/view`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Unable to open document.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      if (newTab) {
        newTab.location.href = objectUrl;
      } else {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.click();
      }

      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 60000);
    } catch (error) {
      if (newTab) newTab.close();
      showMessage(error.message, true);
    }
  }

  // --------------------------------------------------
  // ADMIN REVIEW
  // --------------------------------------------------

  async function reviewPassenger(passengerId, status) {
    setActionId(passengerId);
    showMessage("");

    try {
      await apiRequest(
        `/api/admin/passengers/${passengerId}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            decision: status,
            note: reviewNotes[passengerId] || "",
          }),
        }
      );

      showMessage(`Passenger status updated to ${status}.`);
      setRefresh((value) => value + 1);
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      setActionId(null);
    }
  }

  // --------------------------------------------------
  // AUTHENTICATION SCREEN
  // --------------------------------------------------

  if (!token) {
    return (
      <main className="auth-layout">
        <section className="auth-visual">
          <div className="auth-visual-top">
            <Brand />
          </div>

          <div className="auth-visual-content">
            <span className="eyebrow">SMARTER AIR TRAVEL</span>

            <h1>Travel with confidence. Verify with ease.</h1>

            <p>
              A streamlined passenger verification experience
              designed to make every journey simpler.
            </p>

            <div className="auth-visual-line" />

            <span className="auth-caption">
              YOUR JOURNEY. OUR PRIORITY.
            </span>
          </div>

          <div className="auth-visual-footer">
            <span>© 2026 AeroVerify</span>
            <span>Passenger Verification Platform</span>
          </div>
        </section>

        <section className="auth-form-side">
          <div className="auth-form-card">
            <div className="mobile-brand">
              <Brand />
            </div>

            <span className="eyebrow">WELCOME TO AEROVERIFY</span>

            <h2>
              {mode === "login"
                ? "Sign in to your account"
                : "Create your account"}
            </h2>

            <p className="auth-description">
              {mode === "login"
                ? "Enter your details to access your dashboard."
                : "Register to begin your passenger verification."}
            </p>

            <form onSubmit={handleSubmit} className="auth-form">
              {mode === "register" && (
                <div className="field">
                  <label>Full name</label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    required
                  />
                </div>
              )}

              <div className="field">
                <label>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === "register"
                      ? "At least 12 characters"
                      : "Enter your password"
                  }
                  minLength={mode === "register" ? 12 : 1}
                  required
                />
              </div>

              <button
                className="button button-primary button-full"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? "Please wait..."
                  : mode === "login"
                    ? "Sign in"
                    : "Create account"}
                <span>→</span>
              </button>
            </form>

            {message && (
              <div className={isError ? "notice error" : "notice success"}>
                {message}
              </div>
            )}

            <div className="auth-switch">
              {mode === "login" ? (
                <>
                  Don't have an account?
                  <button
                    onClick={() => {
                      setMode("register");
                      showMessage("");
                    }}
                  >
                    Create account
                  </button>
                </>
              ) : (
                <>
                  Already registered?
                  <button
                    onClick={() => {
                      setMode("login");
                      showMessage("");
                    }}
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>

            <p className="auth-security">
              Secure access to your passenger verification portal
            </p>
          </div>
        </section>
      </main>
    );
  }

  // --------------------------------------------------
  // DASHBOARD DATA
  // --------------------------------------------------

  const filteredPassengers = passengers.filter((passenger) => {
    const query = search.toLowerCase();

    return (
      (passenger.full_name || "").toLowerCase().includes(query) ||
      (passenger.email || "").toLowerCase().includes(query) ||
      (passenger.flight_number || "").toLowerCase().includes(query)
    );
  });

  const totalPassengers = passengers.length;

  const approvedCount = passengers.filter(
    (passenger) => getPassengerStatus(passenger) === "Approved"
  ).length;

  const rejectedCount = passengers.filter(
    (passenger) => getPassengerStatus(passenger) === "Rejected"
  ).length;

  const pendingCount = passengers.filter(
    (passenger) =>
      !["Approved", "Rejected"].includes(
        getPassengerStatus(passenger)
      )
  ).length;

  const stats = [
    {
      label: "Total passengers",
      value: dashboard.total_passengers ?? totalPassengers,
      icon: "♙",
      color: "blue",
    },
    {
      label: "Approved",
      value: dashboard.approved ?? approvedCount,
      icon: "✓",
      color: "green",
    },
    {
      label: "Pending review",
      value:
        dashboard.pending_review ??
        dashboard.pending ??
        dashboard.pending_passengers ??
        pendingCount,
      icon: "◷",
      color: "orange",
    },
    {
      label: "Rejected",
      value: dashboard.rejected ?? rejectedCount,
      icon: "×",
      color: "red",
    },
  ];

  const pageTitle =
    activePage === "overview"
      ? "Overview"
      : activePage === "passengers"
        ? "Passenger records"
        : activePage === "documents"
          ? "Documents"
          : "Settings";

  // --------------------------------------------------
  // MAIN APPLICATION
  // --------------------------------------------------

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>

        <nav className="sidebar-nav">
          <button
            className={activePage === "overview" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setActivePage("overview");
              setSidebarOpen(false);
            }}
          >
            <Icon name="dashboard" />
            <span>Overview</span>
          </button>

          <button
            className={activePage === "passengers" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setActivePage("passengers");
              setSidebarOpen(false);
            }}
          >
            <Icon name="passengers" />
            <span>Passengers</span>
            <span className="nav-count">{totalPassengers}</span>
          </button>

          <button
            className={activePage === "documents" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setActivePage("documents");
              setSidebarOpen(false);
            }}
          >
            <Icon name="documents" />
            <span>Documents</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-section-label">ACCOUNT</div>

          <button
            className={activePage === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setActivePage("settings");
              setSidebarOpen(false);
            }}
          >
            <Icon name="settings" />
            <span>Account details</span>
          </button>

          <div className="sidebar-profile">
            <div className="avatar">
              {(user?.full_name || user?.email || "U")
                .charAt(0)
                .toUpperCase()}
            </div>

            <div className="profile-details">
              <strong>{user?.full_name || "User"}</strong>
              <span>{user?.role || "Passenger"}</span>
            </div>

            <button
              className="profile-logout"
              title="Logout"
              onClick={logout}
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setSidebarOpen(true)}
          >
            <Icon name="menu" />
          </button>

          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{pageTitle}</strong>
          </div>

          <div className="topbar-right">
            <span className="topbar-date">
              {new Date().toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>

            <div className="topbar-user">
              <div className="avatar small">
                {(user?.full_name || "U").charAt(0).toUpperCase()}
              </div>
              <div>
                <strong>{user?.full_name || "User"}</strong>
                <span>{isAdmin ? "Administrator" : "Passenger"}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="page-content">
          {message && (
            <div className={isError ? "notice error" : "notice success"}>
              <span>{isError ? "!" : "✓"}</span>
              {message}
              <button onClick={() => showMessage("")}>×</button>
            </div>
          )}

          {/* OVERVIEW */}

          {activePage === "overview" && (
            <>
              <section className="page-heading">
                <div>
                  <span className="eyebrow">YOUR WORKSPACE</span>
                  <h1>
                    {isAdmin ? "Welcome back, Admin" : "Welcome back"}
                  </h1>
                  <p>
                    Here's what's happening with your passenger verification.
                  </p>
                </div>

                <button
                  className="button button-outline"
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  <Icon name="refresh" />
                  Refresh data
                </button>
              </section>

              <section className="stats-grid">
                {stats.map((stat) => (
                  <div className="stat-card" key={stat.label}>
                    <div className={`stat-icon ${stat.color}`}>
                      {stat.icon}
                    </div>
                    <div className="stat-content">
                      <span>{stat.label}</span>
                      <strong>{stat.value}</strong>
                    </div>
                    <span className="stat-decoration">↗</span>
                  </div>
                ))}
              </section>

              {/* NEW PASSENGER TRACKER */}

              {!isAdmin && (
                <div className="passenger-trackers">
                  {passengers.length > 0 ? (
                    passengers.map((passenger) => (
                      <VerificationTracker
                        key={passenger.id}
                        passenger={passenger}
                        documents={documents[passenger.id] || []}
                      />
                    ))
                  ) : (
                    <section className="content-card">
                      <div className="empty-state">
                        <div className="empty-icon">✈</div>
                        <h3>No verification journey yet</h3>
                        <p>
                          Create your passenger record to start tracking
                          your verification.
                        </p>
                        <button
                          className="button button-primary"
                          onClick={() => setActivePage("passengers")}
                        >
                          Create passenger record →
                        </button>
                      </div>
                    </section>
                  )}
                </div>
              )}

              <section className="overview-grid">
                <div className="content-card welcome-card">
                  <div className="card-topline">
                    <span className="eyebrow">AEROVERIFY PORTAL</span>
                    <span className="live-indicator">
                      <span /> SYSTEM ACTIVE
                    </span>
                  </div>

                  <h2>
                    {isAdmin
                      ? "Passenger operations, simplified."
                      : "Your journey starts here."}
                  </h2>

                  <p>
                    {isAdmin
                      ? "Review passenger information, inspect uploaded documents and manage verification decisions from one place."
                      : "Create your passenger record, upload your travel documents and follow your verification progress."}
                  </p>

                  <button
                    className="button button-primary"
                    onClick={() => setActivePage("passengers")}
                  >
                    {isAdmin ? "Review passengers" : "View my records"}
                    <span>→</span>
                  </button>

                  <div className="welcome-watermark">✈</div>
                </div>

                <div className="content-card quick-card">
                  <div className="section-heading">
                    <div>
                      <h3>Quick overview</h3>
                      <p>Verification status summary</p>
                    </div>
                  </div>

                  <div className="quick-row">
                    <div className="quick-icon green">✓</div>
                    <div>
                      <strong>Approved</strong>
                      <span>Verification completed</span>
                    </div>
                    <b>{approvedCount}</b>
                  </div>

                  <div className="quick-row">
                    <div className="quick-icon orange">◷</div>
                    <div>
                      <strong>In progress</strong>
                      <span>Awaiting review or documents</span>
                    </div>
                    <b>{pendingCount}</b>
                  </div>

                  <div className="quick-row">
                    <div className="quick-icon red">×</div>
                    <div>
                      <strong>Rejected</strong>
                      <span>Requires attention</span>
                    </div>
                    <b>{rejectedCount}</b>
                  </div>
                </div>
              </section>

              <section className="content-card recent-card">
                <div className="section-heading">
                  <div>
                    <h3>Recent passenger records</h3>
                    <p>Latest passenger activity</p>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => setActivePage("passengers")}
                  >
                    View all →
                  </button>
                </div>

                <PassengerTable
                  passengers={filteredPassengers.slice(0, 5)}
                  documents={documents}
                  isAdmin={isAdmin}
                  selectedFiles={selectedFiles}
                  actionId={actionId}
                  reviewNotes={reviewNotes}
                  onChooseFile={chooseFile}
                  onUpload={uploadDocuments}
                  onViewDocument={viewDocument}
                  onReview={reviewPassenger}
                  onReviewNotes={setReviewNotes}
                  compact
                />
              </section>
            </>
          )}

          {/* PASSENGERS */}

          {activePage === "passengers" && (
            <>
              <section className="page-heading">
                <div>
                  <span className="eyebrow">MANAGEMENT</span>
                  <h1>Passenger records</h1>
                  <p>
                    Manage passenger details and verification progress.
                  </p>
                </div>

                <button
                  className="button button-outline"
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  <Icon name="refresh" />
                  Refresh
                </button>
              </section>

              {!isAdmin && (
                <section className="content-card create-card">
                  <div className="section-heading">
                    <div>
                      <h3>Create passenger record</h3>
                      <p>
                        Enter your flight details to begin verification.
                      </p>
                    </div>
                    <div className="create-icon">
                      <Icon name="plus" />
                    </div>
                  </div>

                  <form onSubmit={createPassenger}>
                    <div className="create-form-grid">
                      <div className="field">
                        <label>Full name</label>
                        <input
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Passenger name"
                          required
                        />
                      </div>

                      <div className="field">
                        <label>Email address</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Passenger email"
                          required
                        />
                      </div>

                      <div className="field">
                        <label>Flight number</label>
                        <input
                          value={flightNumber}
                          onChange={(e) => setFlightNumber(e.target.value)}
                          placeholder="e.g. AI202"
                          required
                        />
                      </div>

                      <div className="field">
                        <label>Origin</label>
                        <input
                          value={origin}
                          onChange={(e) => setOrigin(e.target.value)}
                          placeholder="Departure city"
                          required
                        />
                      </div>

                      <div className="field">
                        <label>Destination</label>
                        <input
                          value={destination}
                          onChange={(e) => setDestination(e.target.value)}
                          placeholder="Arrival city"
                          required
                        />
                      </div>
                    </div>

                    <button
                      className="button button-primary"
                      type="submit"
                      disabled={creatingPassenger}
                    >
                      {creatingPassenger ? "Creating..." : "Create record"}
                      <span>→</span>
                    </button>
                  </form>
                </section>
              )}

              <section className="content-card passenger-list-card">
                <div className="section-heading passenger-list-heading">
                  <div>
                    <h3>All passengers</h3>
                    <p>
                      {passengers.length} passenger records found
                    </p>
                  </div>

                  <div className="search-box">
                    <Icon name="search" />
                    <input
                      placeholder="Search passengers..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>

                {dataLoading ? (
                  <div className="empty-state">
                    Loading passenger records...
                  </div>
                ) : filteredPassengers.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">♙</div>
                    <h3>No passenger records found</h3>
                    <p>Passenger records will appear here.</p>
                  </div>
                ) : (
                  <PassengerTable
                    passengers={filteredPassengers}
                    documents={documents}
                    isAdmin={isAdmin}
                    selectedFiles={selectedFiles}
                    actionId={actionId}
                    reviewNotes={reviewNotes}
                    onChooseFile={chooseFile}
                    onUpload={uploadDocuments}
                    onViewDocument={viewDocument}
                    onReview={reviewPassenger}
                    onReviewNotes={setReviewNotes}
                  />
                )}
              </section>
            </>
          )}

          {/* DOCUMENTS */}

          {activePage === "documents" && (
            <>
              <section className="page-heading">
                <div>
                  <span className="eyebrow">DOCUMENT CENTRE</span>
                  <h1>Travel documents</h1>
                  <p>
                    View documents associated with passenger records.
                  </p>
                </div>
              </section>

              <section className="content-card">
                <div className="section-heading">
                  <div>
                    <h3>Uploaded documents</h3>
                    <p>Documents available in your account.</p>
                  </div>
                </div>

                <div className="document-grid">
                  {passengers.flatMap((passenger) =>
                    (documents[passenger.id] || []).map((doc) => (
                      <div className="document-card" key={doc.id}>
                        <div className="document-file-icon">PDF</div>
                        <div className="document-info">
                          <strong>
                            {doc.original_filename ||
                              doc.filename ||
                              "Passenger document"}
                          </strong>
                          <span>{passenger.full_name}</span>
                        </div>
                        <button
                          className="icon-button"
                          onClick={() => viewDocument(doc.id)}
                          title="View document"
                        >
                          <Icon name="eye" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {passengers.every(
                  (passenger) =>
                    !(documents[passenger.id] || []).length
                ) && (
                  <div className="empty-state">
                    <div className="empty-icon">▤</div>
                    <h3>No documents uploaded yet</h3>
                    <p>
                      Uploaded passenger documents will appear here.
                    </p>
                  </div>
                )}
              </section>
            </>
          )}

          {/* ACCOUNT DETAILS */}

          {activePage === "settings" && (
            <>
              <section className="page-heading">
                <div>
                  <span className="eyebrow">ACCOUNT</span>
                  <h1>Account details</h1>
                  <p>Your AeroVerify profile information.</p>
                </div>
              </section>

              <section className="content-card account-card">
                <div className="account-avatar">
                  {(user?.full_name || "U").charAt(0).toUpperCase()}
                </div>

                <div className="account-details">
                  <h3>{user?.full_name || "User"}</h3>
                  <p>{user?.email || "Email not available"}</p>
                  <StatusBadge status={user?.role || "Passenger"} />
                </div>

                <div className="account-divider" />

                <div className="account-info-row">
                  <span>Full name</span>
                  <strong>{user?.full_name || "Not available"}</strong>
                </div>

                <div className="account-info-row">
                  <span>Email address</span>
                  <strong>{user?.email || "Not available"}</strong>
                </div>

                <div className="account-info-row">
                  <span>Account role</span>
                  <strong>{user?.role || "Passenger"}</strong>
                </div>

                <button
                  className="button button-outline logout-account"
                  onClick={logout}
                >
                  <Icon name="logout" />
                  Sign out
                </button>
              </section>
            </>
          )}

          <footer className="page-footer">
            <span>© 2026 AeroVerify. All rights reserved.</span>
            <span>Passenger Verification Platform</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

// ==================================================
// REUSABLE PASSENGER TABLE
// ==================================================

function PassengerTable({
  passengers,
  documents,
  isAdmin,
  selectedFiles,
  actionId,
  reviewNotes,
  onChooseFile,
  onUpload,
  onViewDocument,
  onReview,
  onReviewNotes,
  compact = false,
}) {
  if (!passengers.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">♙</div>
        <h3>No passenger records yet</h3>
        <p>New passenger records will appear here.</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>PASSENGER</th>
            <th>FLIGHT</th>
            <th>ROUTE</th>
            <th>STATUS</th>
            <th>DOCUMENTS</th>
            {!compact && <th>ACTIONS</th>}
          </tr>
        </thead>

        <tbody>
          {passengers.map((passenger) => {
            const docs = documents[passenger.id] || [];
            const status = getPassengerStatus(passenger);

            const finalStatus = ["Approved", "Rejected"].includes(status);

            const hasDocuments =
              docs.length > 0 ||
              passenger.documents_submitted === 1 ||
              passenger.documents_submitted === true;

            return (
              <tr key={passenger.id}>
                <td>
                  <div className="passenger-cell">
                    <div className="passenger-avatar">
                      {(passenger.full_name || "P")
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div>
                      <strong>{passenger.full_name}</strong>
                      <span>{passenger.email}</span>
                    </div>
                  </div>
                </td>

                <td>
                  <span className="flight-number">
                    {passenger.flight_number || "—"}
                  </span>
                </td>

                <td>
                  <div className="route-cell">
                    <span>{passenger.origin || "—"}</span>
                    <span className="route-arrow">→</span>
                    <span>{passenger.destination || "—"}</span>
                  </div>
                </td>

                <td>
                  <StatusBadge status={status} />
                </td>

                <td>
                  <div className="document-actions">
                    {docs.length > 0 ? (
                      docs.map((doc) => (
                        <button
                          className="document-link"
                          key={doc.id}
                          onClick={() => onViewDocument(doc.id)}
                        >
                          <Icon name="documents" />
                          {doc.original_filename ||
                            doc.filename ||
                            "View file"}
                        </button>
                      ))
                    ) : (
                      <span className="muted-text">No documents</span>
                    )}

                    {!isAdmin && !finalStatus && (
                      <div className="upload-control">
                        <label className="file-select">
                          <Icon name="upload" />
                          Choose file
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => {
                              onChooseFile(
                                passenger.id,
                                e.target.files?.[0]
                              );
                              e.target.value = "";
                            }}
                          />
                        </label>

                        {selectedFiles[passenger.id] && (
                          <span className="selected-file">
                            {selectedFiles[passenger.id].name}
                          </span>
                        )}

                        <button
                          className="mini-primary"
                          disabled={
                            !selectedFiles[passenger.id] ||
                            actionId === passenger.id
                          }
                          onClick={() => onUpload(passenger.id)}
                        >
                          {actionId === passenger.id
                            ? "Uploading..."
                            : "Upload"}
                        </button>
                      </div>
                    )}
                  </div>
                </td>

                {!compact && (
                  <td>
                    {isAdmin ? (
                      finalStatus ? (
                        <span className="muted-text">
                          Decision recorded
                        </span>
                      ) : !hasDocuments ? (
                        <span className="muted-text">
                          Awaiting documents
                        </span>
                      ) : (
                        <div className="admin-actions">
                          <textarea
                            placeholder="Add review notes..."
                            maxLength={500}
                            value={reviewNotes[passenger.id] || ""}
                            onChange={(e) =>
                              onReviewNotes((previous) => ({
                                ...previous,
                                [passenger.id]: e.target.value,
                              }))
                            }
                          />

                          <div className="admin-action-buttons">
                            <button
                              className="mini-outline"
                              disabled={actionId === passenger.id}
                              onClick={() =>
                                onReview(passenger.id, "Under review")
                              }
                            >
                              Review
                            </button>

                            <button
                              className="mini-approve"
                              disabled={actionId === passenger.id}
                              onClick={() =>
                                onReview(passenger.id, "Approved")
                              }
                            >
                              Approve
                            </button>

                            <button
                              className="mini-reject"
                              disabled={actionId === passenger.id}
                              onClick={() =>
                                onReview(passenger.id, "Rejected")
                              }
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      )
                    ) : (
                      <span className="muted-text">
                        {finalStatus ? "Completed" : "In progress"}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
