// DOM Elements
const fileInput = document.getElementById("fileInput");
const uploadZone = document.getElementById("uploadZone");
const analyzeBtn = document.getElementById("analyzeBtn");
const progressCard = document.getElementById("progressCard");
const progressContent = document.getElementById("progressContent");
let selectedFile = null;
let currentAnalysisData = null;

// API Configuration
const API_BASE_URL = "http://127.0.0.1:8000";

function normalizeAnalysisData(data) {
  if (!data) return data;
  const audit = data.audit || {};
  const summary = audit.summary || {};
  const breakdown = summary.severity_breakdown || {};
  const issues = Array.isArray(audit.issues)
    ? audit.issues.map((issue) => ({
        ...issue,
        severity: (issue.severity || "info").toLowerCase(),
      }))
    : [];

  return {
    ...data,
    stats: {
      total_files: 0,
      total_dirs: 0,
      python_files: 0,
      test_files: 0,
      notebooks: 0,
      size_mb: 0,
      categories: {},
      ...data.stats,
    },
    audit: {
      ...audit,
      summary: {
        total_issues: summary.total_issues ?? 0,
        files_with_issues: summary.files_with_issues ?? 0,
        severity_breakdown: {
          error: breakdown.error ?? 0,
          warning: breakdown.warning ?? 0,
          info: breakdown.info ?? 0,
        },
      },
      issues,
    },
    project: data.project || {},
    structure: data.structure || null,
  };
}

// Progress Tracker Functions
function showProgressTracker(status, description, progress) {
  let mainLabel = "Processing";
  if (status === "uploading") mainLabel = "Uploading Document";
  if (status === "analyzing") mainLabel = "Analyzing Project";

  const subtitle = description || "";

  progressContent.innerHTML = `
    <div class="compact-progress ${status}">
      <div class="progress-header-row">
        <div class="progress-main">
          <span class="progress-title">${mainLabel}</span>
          ${subtitle ? `<span class="progress-subtitle">${subtitle}</span>` : ""}
        </div>
        <div class="progress-percentage">${Math.round(progress)}%</div>
      </div>
      
      <div class="progress-bar-container">
        <div class="progress-bar" style="width: ${progress}%"></div>
      </div>
      
      <div class="progress-meta">~1 min left</div>
    </div>
  `;

  progressCard.classList.add("active");
}

function resetProgressTracker() {
  progressContent.innerHTML = `
    <div class="idle-state">
      <p>Upload a project to begin analysis</p>
    </div>
  `;
  progressCard.classList.remove("active");
}

function showCompletedState() {
  progressContent.innerHTML = `
    <div class="compact-progress success">
      <div class="progress-header-row">
        <div class="progress-main">
          <span class="progress-title">Analysis Complete!</span>
        </div>
        <div class="progress-percentage">100%</div>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar" style="width: 100%"></div>
      </div>
    </div>
  `;
}

// File Upload Handling
uploadZone.addEventListener("click", (e) => {
  // Prevent triggering if clicking on the input itself
  if (e.target !== fileInput) {
    fileInput.click();
  }
});

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    handleFileSelect(file);
  }
});

// Drag and Drop
uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("dragover");
});

uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("dragover");
});

uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");

  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith(".zip")) {
    handleFileSelect(file);
  } else {
    showError("Please upload a ZIP file");
  }
});

// Handle File Selection
function handleFileSelect(file) {
  if (file.size > 500 * 1024 * 1024) {
    // 400 MB
    showError("File size exceeds 500 MB");
    return;
  }

  selectedFile = file;
  updateUploadZone(file);
  analyzeBtn.disabled = false;
}

// Update Upload Zone UI
function updateUploadZone(file) {
  const fileSize = formatFileSize(file.size);
  const uploadText = uploadZone.querySelector(".upload-text");
  const uploadIcon = uploadZone.querySelector(".upload-icon svg");

  uploadText.innerHTML = `<strong>${file.name}</strong> (${fileSize})`;
  uploadIcon.style.color = "var(--color-success)";

  // Add success animation
  uploadZone.style.borderColor = "var(--color-success)";
  uploadZone.style.background = "var(--color-success-bg)";

  setTimeout(() => {
    uploadZone.style.borderColor = "";
    uploadZone.style.background = "";
  }, 2000);
}

// Format File Size
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

// Get relative time
function getRelativeTime(isoDate) {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

async function simulateProgress(status, message, start, end, duration) {
  const steps = 5;
  const increment = (end - start) / steps;
  const delay = duration / steps;

  for (let i = 1; i <= steps; i++) {
    await new Promise(resolve => setTimeout(resolve, delay));
    showProgressTracker(status, message, start + (increment * i));
  }
}

// Analyze Button Click Handler
analyzeBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  analyzeBtn.disabled = true;
  const btnText = analyzeBtn.querySelector(".btn-text");
  const originalText = btnText.textContent;
  btnText.textContent = "Processing...";

  try {
    // Step 1: Uploading (0-30%)
    showProgressTracker("uploading", "Uploading your project files...", 10);

    const formData = new FormData();
    formData.append("file", selectedFile);

    // Step 2: Call /analyze endpoint
    showProgressTracker("uploading", "Uploading your project files...", 20);

    const response = await fetch(`${API_BASE_URL}/zip/analyze`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Analysis failed: ${response.statusText}`);
    }

    showProgressTracker("uploading", "Upload complete!", 30);

    showProgressTracker("analyzing", "Analyzing code...", 50);
    
    const raw = await response.json();
    const data = normalizeAnalysisData(raw);
    currentAnalysisData = data;

    console.log("Complete analysis data:", data);
    
    await simulateProgress("analyzing", "Running security checks...", 50, 85, 150);

    showProgressTracker("analyzing", "Finalizing report...", 85);
    await simulateProgress("analyzing", "Finalizing report...", 85, 100, 100);

    // Show completion
    showCompletedState();
    btnText.textContent = "View Report";
    analyzeBtn.disabled = false;

    addProjectToList(data);

    // Reset after 3 seconds
    setTimeout(() => {
      resetUploadZone();
      resetProgressTracker();
      btnText.textContent = originalText;
    }, 3000);

  } catch (error) {
    console.error("Analysis error:", error);
    showError(`Analysis failed: ${error.message}`);
    btnText.textContent = originalText;
    analyzeBtn.disabled = false;
    resetProgressTracker();
  }
});

// Reset Upload Zone
function resetUploadZone() {
  const uploadText = uploadZone.querySelector(".upload-text");
  const uploadIcon = uploadZone.querySelector(".upload-icon svg");

  uploadText.innerHTML =
    'Drag and Drop files here or <span class="upload-browse">choose file</span>';
  uploadIcon.style.color = "";
  selectedFile = null;
  fileInput.value = "";
  analyzeBtn.disabled = true;
}

// Add Project to List with audit data
function addProjectToList(data) {
  const projectGrid = document.querySelector(".project-grid");
  
  const projectName = (data.filename || "").replace(".zip", "");
  const pythonFiles = data.stats.python_files ?? 0;
  const testFiles = data.stats.test_files ?? 0;
  const sizeInMB = data.stats.size_mb ?? 0;
  const timestamp = getRelativeTime(data.processed_at || new Date().toISOString());

  // Calculate grade from AUDIT results (use normalized audit.summary)
  const auditSummary = data.audit?.summary || {};
  const criticalIssues = auditSummary.severity_breakdown?.error ?? 0;
  const warnings = auditSummary.severity_breakdown?.warning ?? 0;
  const infoIssues = auditSummary.severity_breakdown?.info ?? 0;
  const totalIssues = auditSummary.total_issues ?? 0;

  // Calculate grade based on issues
  let grade = "A";
  if (criticalIssues > 0) grade = "F";
  else if (warnings > 2) grade = "C";
  else if (warnings > 0) grade = "B";

  // Generate stats HTML from audit results (match backend response)
  let statsHTML = "";

  if (criticalIssues > 0) {
    statsHTML = `
      <div class="stat-item">
        <span class="stat-icon">●</span>
        <span class="stat-label">${criticalIssues} Critical</span>
      </div>
    `;
    if (warnings > 0) {
      statsHTML += `
        <div class="stat-item">
          <span class="stat-icon">●</span>
          <span class="stat-label">${warnings} Warnings</span>
        </div>
      `;
    }
    if (infoIssues > 0) {
      statsHTML += `
        <div class="stat-item">
          <span class="stat-icon">●</span>
          <span class="stat-label">${infoIssues} Info</span>
        </div>
      `;
    }
  } else if (warnings > 0) {
    statsHTML = `
      <div class="stat-item">
        <span class="stat-icon">●</span>
        <span class="stat-label">${warnings} Warnings</span>
      </div>
      <div class="stat-item">
        <span class="stat-icon">●</span>
        <span class="stat-label">${totalIssues - warnings} Info</span>
      </div>
    `;
  } else if (infoIssues > 0 || totalIssues > 0) {
    statsHTML = `
      <div class="stat-item">
        <span class="stat-icon">ℹ</span>
        <span class="stat-label">${infoIssues || totalIssues} Info</span>
      </div>
    `;
  } else {
    statsHTML = `
      <div class="stat-item">
        <span class="stat-icon">✓</span>
        <span class="stat-label">No issues found</span>
      </div>
    `;
  }

  const projectCard = document.createElement("div");
  projectCard.className = "project-card";
  projectCard.style.animation = "fadeInUp 0.6s ease";
  projectCard.dataset.jobId = data.job_id;
  
  // Store the complete data in the card (including audit results)
  projectCard.dataset.fullData = JSON.stringify(data);

  projectCard.innerHTML = `
    <div class="project-header">
      <div class="project-icon-wrapper">
        <svg class="project-icon python-icon" viewBox="0 0 24 24" fill="none">
          <path d="M11.914 0C5.82 0 6.2 2.656 6.2 2.656l.007 2.752h5.814v.826H3.9S0 5.789 0 11.969c0 6.18 3.403 5.96 3.403 5.96h2.03v-2.867s-.109-3.42 3.35-3.42h5.766s3.24.052 3.24-3.148V3.202S18.28 0 11.914 0zm-3.15 1.822a1.023 1.023 0 1 1 0 2.046 1.023 1.023 0 0 1 0-2.046z" fill="#3776AB"/>
          <path d="M12.086 24c6.094 0 5.714-2.656 5.714-2.656l-.007-2.752h-5.814v-.826h8.121s3.9.445 3.9-5.735c0-6.18-3.403-5.96-3.403-5.96h-2.03v2.867s.109 3.42-3.35 3.42h-5.766s-3.24-.052-3.24 3.148v5.292S5.72 24 12.086 24zm3.15-1.822a1.023 1.023 0 1 1 0-2.046 1.023 1.023 0 0 1 0 2.046z" fill="#FFD43B"/>
        </svg>
      </div>
      <div class="project-info">
        <h4 class="project-name">${projectName}</h4>
        <p class="project-meta">${timestamp} • ${pythonFiles} Python files${testFiles > 0 ? ` • ${testFiles} tests` : ''} • ${sizeInMB} MB</p>
      </div>
      <div class="project-grade">${grade}</div>
    </div>
    
    <div class="project-stats">
      ${statsHTML}
    </div>

    <div class="project-footer">
      <button class="btn-secondary">View Report</button>
    </div>
  `;

  projectGrid.insertBefore(projectCard, projectGrid.firstChild);

  setTimeout(() => {
    projectCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 100);
}

// Show Error
function showError(message) {
  const uploadText = uploadZone.querySelector(".upload-text");
  const originalHTML = uploadText.innerHTML;

  uploadText.innerHTML = `<span style="color: var(--color-error);">${message}</span>`;
  uploadZone.style.borderColor = "var(--color-error)";

  setTimeout(() => {
    uploadText.innerHTML = originalHTML;
    uploadZone.style.borderColor = "";
  }, 3000);
}

// Project Card Click Handlers
document.addEventListener("click", (e) => {
  const viewReportBtn = e.target.closest(".btn-secondary");
  if (viewReportBtn) {
    e.stopPropagation();

    const projectCard = viewReportBtn.closest(".project-card");
    const fullData = projectCard.dataset.fullData;
    
    if (fullData) {
      // Store in sessionStorage so details page can access it
      sessionStorage.setItem('currentProject', fullData);
      
      // Navigate to details page
      window.location.href = `pro-details.html`;
    } else {
      console.error("No project data found");
      showError("Project data not available");
    }
  }
});

// Smooth scroll for section links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute("href"));
    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  });
});