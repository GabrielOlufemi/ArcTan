console.log('Script loaded');

function normalizeAnalysisData(data) {
  if (!data) return data;
  const audit = data.audit || {};
  const summary = audit.summary || {};
  const breakdown = summary.severity_breakdown || {};
  const issues = Array.isArray(audit.issues)
    ? audit.issues.map((issue) => ({
        ...issue,
        severity: (issue.severity || 'info').toLowerCase(),
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

let projectData = null;

try {
  const stored = sessionStorage.getItem('currentProject');
  if (stored) {
    const raw = JSON.parse(stored);
    projectData = normalizeAnalysisData(raw);
    console.log('Loaded:', projectData.filename);
    console.log('Data check:', {
      python_files: projectData.stats?.python_files,
      total_issues: projectData.audit?.summary?.total_issues,
      breakdown: projectData.audit?.summary?.severity_breakdown
    });
  }
} catch (error) {
  console.error('Load error:', error);
}

// Tab switching
function initTabs() {
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', function(e) {
      e.preventDefault();
      document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
      });
      document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      const target = document.getElementById(`tab-${this.getAttribute('data-tab')}`);
      if (target) {
        target.classList.add('active');
        target.style.display = 'block';
      }
      this.classList.add('active');
    });
  });
  const overview = document.getElementById('tab-overview');
  if (overview) overview.style.display = 'block';
}

// Calculate score
function calcScore(data) {
  if (!data?.audit?.summary) return 98;
  const b = data.audit.summary.severity_breakdown || {};
  let s = 100;
  s -= (b.error || 0) * 30;
  s -= (b.warning || 0) * 10;
  s -= (b.info || 0) * 2;
  return Math.max(0, Math.min(100, s));
}

function getScoreInfo(score) {
  if (score >= 90) return { color: "#22c55e", label: "Low Risk", grade: "A" };
  if (score >= 80) return { color: "#3b82f6", label: "Good", grade: "B" };
  if (score >= 60) return { color: "#f59e0b", label: "Medium Risk", grade: "C" };
  if (score >= 40) return { color: "#fb923c", label: "High Risk", grade: "D" };
  return { color: "#ef4444", label: "Critical Risk", grade: "F" };
}

// Calculate LOC (Lines of Code)
function calcLOC(data) {
  let total = 0;
  function walk(node) {
    if (node.type === 'file' && node.lines) total += node.lines;
    if (node.children) node.children.forEach(walk);
  }
  if (data.structure) walk(data.structure);
  console.log('Total lines:', total);
  return total;
}

// Calculate Complexity (use backend summary.complexity when present)
function calcComplexity(data) {
  const fromBackend = data.summary?.complexity;
  if (fromBackend && typeof fromBackend === 'string') {
    return fromBackend.charAt(0).toUpperCase() + fromBackend.slice(1).toLowerCase();
  }
  const loc = calcLOC(data);
  const pythonFiles = data.stats?.python_files || 0;
  const totalIssues = data.audit?.summary?.total_issues || 0;

  // Simple heuristic based on multiple factors
  if (pythonFiles <= 5 && loc < 500 && totalIssues < 5) return "Simple";
  if (pythonFiles <= 15 && loc < 2000 && totalIssues < 15) return "Moderate";
  return "Complex";
}

// Calculate Maintainability Index (0-100 scale)
function calcMaintainability(data) {
  const totalIssues = data.audit?.summary?.total_issues || 0;
  const breakdown = data.audit?.summary?.severity_breakdown || {};
  const loc = calcLOC(data);
  
  // Start with 100
  let score = 100;
  
  // Deduct for issues
  score -= (breakdown.error || 0) * 15;
  score -= (breakdown.warning || 0) * 5;
  score -= (breakdown.info || 0) * 1;
  
  // Bonus for good code organization (has tests, dependencies, etc.)
  if (data.project?.has_tests) score += 5;
  if (data.project?.has_dependencies) score += 2;
  
  // Penalty for large files without tests
  if (loc > 1000 && !data.project?.has_tests) score -= 10;
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Get Maintainability Label
function getMaintainabilityLabel(score) {
  if (score >= 85) return { label: "Excellent", color: "var(--success)" };
  if (score >= 70) return { label: "Good", color: "#3b82f6" };
  if (score >= 50) return { label: "Fair", color: "var(--warn)" };
  return { label: "Poor", color: "var(--crit)" };
}

// Calculate Code Quality
function getCodeQuality(data) {
  const score = calcScore(data);
  if (score >= 90) return { label: "Excellent", color: "var(--success)" };
  if (score >= 70) return { label: "Good", color: "#3b82f6" };
  if (score >= 50) return { label: "Fair", color: "var(--warn)" };
  return { label: "Poor", color: "var(--crit)" };
}

// Calculate Average Complexity (simulated)
function calcAverageComplexity(data) {
  const totalIssues = data.audit?.summary?.total_issues || 0;
  const pythonFiles = data.stats?.python_files || 1;
  
  // Simple heuristic: more issues per file = higher complexity
  const issuesPerFile = totalIssues / pythonFiles;
  
  if (issuesPerFile < 2) return 3.2;
  if (issuesPerFile < 5) return 5.8;
  return 8.5;
}

// Calculate Max Complexity (simulated)
function calcMaxComplexity(data) {
  const avgComplexity = calcAverageComplexity(data);
  return Math.round(avgComplexity * 2.5);
}

// Calculate Test Coverage
function calcTestCoverage(data) {
  if (data.project?.has_tests && data.stats?.test_files > 0) {
    // Simple heuristic: test files vs source files
    const testRatio = data.stats.test_files / (data.stats.python_files || 1);
    return Math.min(100, Math.round(testRatio * 100));
  }
  return 0;
}

// Calculate Code Smells
function calcCodeSmells(data) {
  const totalIssues = data.audit?.summary?.total_issues || 0;
  const breakdown = data.audit?.summary?.severity_breakdown || {};
  
  return {
    longMethods: breakdown.warning || 0,
    duplicateCode: Math.min(totalIssues * 2, 100), 
    longParams: breakdown.info || 0
  };
}

// Calculate Documentation Coverage
function calcDocCoverage(data) {
  const pythonFiles = data.stats?.python_files || 1;
  const hasReadme = data.structure?.children?.some(child => 
    child.name?.toLowerCase().includes('readme')
  ) || false;
  
  // Heuristic based on file organization and presence of docs
  const baseScore = hasReadme ? 70 : 40;
  const issues = data.audit?.summary?.total_issues || 0;
  
  return {
    functions: Math.max(0, Math.min(100, baseScore + (pythonFiles > 5 ? 15 : 25) - issues)),
    classes: Math.max(0, Math.min(100, baseScore + 30 - issues * 2))
  };
}

// Main UI update
function updateUI(data) {
  console.log('🔄 Updating UI...');
  
  const name = (data.filename || 'Unknown').replace('.zip', '');
  const score = calcScore(data);
  const scoreInfo = getScoreInfo(score);
  const loc = calcLOC(data);
  const stats = data.stats || {};
  const breakdown = data.audit?.summary?.severity_breakdown || {};
  const complexity = calcComplexity(data);
  const maintainability = calcMaintainability(data);
  const maintainabilityInfo = getMaintainabilityLabel(maintainability);
  const codeQuality = getCodeQuality(data);
  const testCoverage = calcTestCoverage(data);
  const avgComplexity = calcAverageComplexity(data);
  const maxComplexity = calcMaxComplexity(data);
  const codeSmells = calcCodeSmells(data);
  const docCoverage = calcDocCoverage(data);
  
  console.log('Calculated:', { 
    name, score, scoreInfo, loc, breakdown, complexity, 
    maintainability, testCoverage, avgComplexity, maxComplexity 
  });
  
  // 1. Title
  document.title = `${name} - Analysis`;
  document.querySelectorAll('.node-title, .pane-title').forEach(el => el.textContent = name);
  
  // 2. Subtitle
  const sub = document.querySelector('.node-subtitle');
  if (sub) sub.textContent = `${stats.python_files || 0} Python files • ${stats.size_mb || 0} MB`;
  
  const overviewScoreVal = document.querySelector('#tab-overview .score-val');
  if (overviewScoreVal) overviewScoreVal.textContent = score;
  
  const overviewMetaTitle = document.querySelector('#tab-overview .meta-title');
  if (overviewMetaTitle) {
    overviewMetaTitle.textContent = scoreInfo.label;
    overviewMetaTitle.style.color = scoreInfo.color;
  }
  
  const overviewMetaSub = document.querySelector('#tab-overview .meta-sub');
  if (overviewMetaSub) overviewMetaSub.textContent = `Score ${scoreInfo.grade}`;
  
  const overviewRing = document.querySelector('#tab-overview .ring-fill');
  if (overviewRing) {
    overviewRing.style.stroke = scoreInfo.color;
    const c = 2 * Math.PI * 28;
    overviewRing.style.strokeDashoffset = c - (score / 100) * c;
  }
  
  const statsGroup = document.querySelector('.stats-group');
  if (statsGroup) {
    statsGroup.innerHTML = `
      <div class="stat-row">
        <span class="stat-label">Critical</span>
        <div class="stat-bar"><div class="stat-fill critical" style="width: ${Math.min((breakdown.error || 0) * 10, 100)}%"></div></div>
        <span class="stat-num">${breakdown.error || 0}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Warning</span>
        <div class="stat-bar"><div class="stat-fill warning" style="width: ${Math.min((breakdown.warning || 0) * 10, 100)}%"></div></div>
        <span class="stat-num">${breakdown.warning || 0}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Info</span>
        <div class="stat-bar"><div class="stat-fill" style="width: ${Math.min((breakdown.info || 0) * 10, 100)}%; background: #3b82f6;"></div></div>
        <span class="stat-num">${breakdown.info || 0}</span>
      </div>
    `;
  }
  
  const summaryCard = Array.from(document.querySelectorAll('#tab-overview .railway-card'))
    .find(c => c.textContent.includes('Analysis Summary'));
  if (summaryCard) {
    const rows = summaryCard.querySelectorAll('[style*="display: flex"]');
    rows.forEach(row => {
      const label = row.querySelector('[style*="color: var(--text-dim)"]');
      const value = row.querySelector('[style*="font-weight: 600"]');
      if (label && value) {
        if (label.textContent.includes('Lines of Code')) {
          value.textContent = `~${loc.toLocaleString()}`;
        }
        if (label.textContent.includes('Code Quality')) {
          value.textContent = codeQuality.label;
          value.style.color = codeQuality.color;
        }
        if (label.textContent.includes('Maintainability Index')) {
          value.textContent = `${maintainability}/100`;
          value.style.color = maintainabilityInfo.color;
        }
        if (label.textContent.includes('Test Coverage')) {
          value.textContent = `${testCoverage}%`;
          value.style.color = testCoverage > 0 ? 'var(--success)' : 'var(--warn)';
        }
      }
    });
  }
  
  const projStats = Array.from(document.querySelectorAll('.railway-card'))
    .find(c => c.textContent.includes('Project Statistics'));
  if (projStats) {
    const grid = projStats.querySelector('[style*="grid-template-columns"]');
    if (grid) {
      grid.innerHTML = `
        <div><div style="font-size: 12px; color: var(--text-dim); margin-bottom: 4px;">Total Files</div><div style="font-size: 20px; font-weight: 700;">${stats.total_files || 0}</div></div>
        <div><div style="font-size: 12px; color: var(--text-dim); margin-bottom: 4px;">Python Files</div><div style="font-size: 20px; font-weight: 700;">${stats.python_files || 0}</div></div>
        <div><div style="font-size: 12px; color: var(--text-dim); margin-bottom: 4px;">Directories</div><div style="font-size: 20px; font-weight: 700;">${stats.total_dirs || 0}</div></div>
        <div><div style="font-size: 12px; color: var(--text-dim); margin-bottom: 4px;">Size</div><div style="font-size: 20px; font-weight: 700;">${stats.size_mb || 0} MB</div></div>
        <div><div style="font-size: 12px; color: var(--text-dim); margin-bottom: 4px;">Complexity</div><div style="font-size: 20px; font-weight: 700;">${complexity}</div></div>
        <div><div style="font-size: 12px; color: var(--text-dim); margin-bottom: 4px;">Dependencies</div><div style="font-size: 20px; font-weight: 700; color: var(--success);">${data.project?.has_dependencies ? 'Found' : 'None'}</div></div>
      `;
    }
  }
  
  updateRecommendations(data, testCoverage);
  
  // 8. Issues tab badges
  const issuesTab = document.getElementById('tab-issues');
  if (issuesTab) {
    const badges = issuesTab.querySelectorAll('[style*="padding: 8px"]');
    if (badges[0]) badges[0].innerHTML = `<span style="color: var(--crit); font-weight: 600;">${breakdown.error || 0}</span> <span style="color: var(--text-dim);">Critical</span>`;
    if (badges[1]) badges[1].innerHTML = `<span style="color: var(--warn); font-weight: 600;">${breakdown.warning || 0}</span> <span style="color: var(--text-dim);">Warnings</span>`;
    if (badges[2]) badges[2].innerHTML = `<span style="color: #3b82f6; font-weight: 600;">${breakdown.info || 0}</span> <span style="color: var(--text-dim);">Info</span>`;
  }
  
  // 9. Render issues
  renderIssues(data.audit?.issues || []);
  
  // 10. File tree
  renderFileTree(data);
  
  // 11. Structure tab
  const structTab = document.getElementById('tab-structure');
  if (structTab) {
    const pyDiv = Array.from(structTab.querySelectorAll('div[style*="font-size: 24px"]'))
      .find(d => d.parentElement.textContent.includes('Python Files'));
    if (pyDiv) pyDiv.textContent = stats.python_files || 0;
    
    const configDiv = Array.from(structTab.querySelectorAll('div[style*="font-size: 24px"]'))
      .find(d => d.parentElement.textContent.includes('Config Files'));
    if (configDiv) {
      const configFiles = (stats.categories?.config || 0) + (stats.categories?.setup || 0);
      configDiv.textContent = configFiles;
    }
    
    // Update progress bars (guard against zero total_files)
    const totalFiles = stats.total_files || 1;
    const bars = structTab.querySelectorAll('[style*="height: 100%; width:"]');
    if (bars[0]) {
      const pyPercent = Math.round((stats.python_files / totalFiles) * 100);
      bars[0].style.width = `${pyPercent}%`;
    }
    if (bars[1]) {
      const configFiles = (stats.categories?.config || 0) + (stats.categories?.setup || 0);
      const configPercent = Math.round((configFiles / totalFiles) * 100);
      bars[1].style.width = `${configPercent}%`;
    }
  }
  
  // 12. Quality Metrics Tab
  updateQualityMetrics(data, maintainability, maintainabilityInfo, avgComplexity, maxComplexity, codeSmells, docCoverage);
  
  // 13. Dependencies Tab
  updateDependencies(data);
  
  console.log('Update complete');
}

// Update Recommendations
function updateRecommendations(data, testCoverage) {
  const recCard = Array.from(document.querySelectorAll('.railway-card'))
    .find(c => c.textContent.includes('Top Recommendations'));
  
  if (!recCard) return;
  
  const container = recCard.querySelector('[style*="flex-direction: column"]');
  if (!container) return;
  
  const recommendations = [];
  
  // Add recommendations based on analysis
  if (testCoverage === 0) {
    recommendations.push({
      color: 'var(--crit)',
      title: 'Implement test coverage:',
      text: `Add unit tests for your ${data.stats?.python_files || 0} Python modules using pytest or unittest`
    });
  }
  
  if (!data.structure?.children?.some(child => child.name?.toLowerCase().includes('readme'))) {
    recommendations.push({
      color: 'var(--warn)',
      title: 'Add documentation:',
      text: 'Include a README.md with setup and usage instructions'
    });
  }
  
  if (data.audit?.summary?.severity_breakdown?.error > 0) {
    recommendations.push({
      color: 'var(--crit)',
      title: 'Fix critical issues:',
      text: `Address ${data.audit.summary.severity_breakdown.error} critical error(s) found in your code`
    });
  }
  
  if (data.audit?.summary?.severity_breakdown?.warning > 5) {
    recommendations.push({
      color: 'var(--warn)',
      title: 'Reduce warnings:',
      text: `Review and fix ${data.audit.summary.severity_breakdown.warning} warning(s) for better code quality`
    });
  }
  
  // If no specific recommendations, add generic ones
  if (recommendations.length === 0) {
    recommendations.push({
      color: 'var(--success)',
      title: 'Great work!',
      text: 'Your code quality is excellent. Consider adding CI/CD pipelines for automated testing.'
    });
  }
  
  container.innerHTML = recommendations.map(rec => `
    <div style="display: flex; gap: 12px; align-items: start;">
      <div style="width: 6px; height: 6px; background: ${rec.color}; border-radius: 50%; margin-top: 6px; flex-shrink: 0;"></div>
      <div style="font-size: 13px; line-height: 1.6;">
        <strong style="color: var(--text-main);">${rec.title}</strong>
        <span style="color: var(--text-dim);"> ${rec.text}</span>
      </div>
    </div>
  `).join('');
}

// Update Quality Metrics Tab
function updateQualityMetrics(data, maintainability, maintainabilityInfo, avgComplexity, maxComplexity, codeSmells, docCoverage) {
  const qualityTab = document.getElementById('tab-quality');
  if (!qualityTab) return;
  
  // Update Maintainability Index
  const maintScoreVal = qualityTab.querySelector('.score-val');
  if (maintScoreVal) maintScoreVal.textContent = maintainability;
  
  const maintLabel = Array.from(qualityTab.querySelectorAll('[style*="font-size: 18px"]'))
    .find(el => el.textContent.includes('Excellent') || el.textContent.includes('Good'));
  if (maintLabel) {
    maintLabel.textContent = maintainabilityInfo.label;
    maintLabel.style.color = maintainabilityInfo.color;
  }
  
  const maintRing = qualityTab.querySelector('.ring-fill');
  if (maintRing) {
    const c = 2 * Math.PI * 35;
    maintRing.style.strokeDashoffset = c - (maintainability / 100) * c;
    maintRing.style.stroke = maintainabilityInfo.color;
  }
  
  // Update Complexity values
  const complexityCards = qualityTab.querySelectorAll('[style*="font-size: 24px"]');
  if (complexityCards[0]) complexityCards[0].textContent = avgComplexity.toFixed(1);
  if (complexityCards[1]) {
    complexityCards[1].textContent = maxComplexity;
    complexityCards[1].style.color = maxComplexity > 10 ? 'var(--crit)' : 'var(--warn)';
  }
  
  // Update Code Smells
  const smellsCards = Array.from(qualityTab.querySelectorAll('[style*="font-size: 20px"]'));
  if (smellsCards.length >= 3) {
    smellsCards[0].textContent = codeSmells.longMethods;
    smellsCards[1].textContent = `${codeSmells.duplicateCode}%`;
    smellsCards[2].textContent = codeSmells.longParams;
  }
  
  // Update Documentation Coverage
  const docBars = qualityTab.querySelectorAll('[style*="height: 100%; width:"]');
  if (docBars.length >= 2) {
    docBars[0].style.width = `${docCoverage.functions}%`;
    docBars[1].style.width = `${docCoverage.classes}%`;
  }
  
  const docPercentages = Array.from(qualityTab.querySelectorAll('[style*="font-size: 13px; font-weight: 600"]'));
  if (docPercentages.length >= 2) {
    docPercentages[docPercentages.length - 2].textContent = `${docCoverage.functions}%`;
    docPercentages[docPercentages.length - 1].textContent = `${docCoverage.classes}%`;
  }
}

// Update Dependencies Tab
function updateDependencies(data) {
  const depList = document.getElementById('dependencies-list');
  if (!depList) return;
  
  if (!data.project?.has_dependencies || !data.project?.dependency_files?.length) {
    depList.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-dim);">
        No dependency files detected
      </div>
    `;
    return;
  }
  
  // Parse requirements.txt if available in structure
  const dependencies = [];
  
  function findFile(node, fileName) {
    if (node.type === 'file' && node.name === fileName) {
      return node;
    }
    if (node.children) {
      for (const child of node.children) {
        const found = findFile(child, fileName);
        if (found) return found;
      }
    }
    return null;
  }
  
  // Try to find and parse requirements.txt
  const reqFile = findFile(data.structure, 'requirements.txt');
  
  console.log('🔍 Requirements file:', reqFile ? 'Found' : 'Not found');
  
  if (reqFile && reqFile.content) {
    console.log('📦 Parsing requirements.txt content...');
    
    const lines = reqFile.content.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-');
    });
    
    console.log('📋 Lines to parse:', lines);
    
    lines.forEach(line => {
      const trimmed = line.trim();
      
      // Enhanced regex to handle:
      // - package==version
      // - package>=version
      // - package~=version
      // - package[extra]==version
      // - package
      const match = trimmed.match(/^([a-zA-Z0-9-_]+(?:\[[a-zA-Z0-9-_,]+\])?)([><=~!]+)?(.+)?$/);
      
      if (match) {
        const packageName = match[1]; // e.g., "fastapi" or "uvicorn[standard]"
        const operator = match[2] || ''; // e.g., "==", ">=", etc.
        const version = match[3] ? match[3].trim() : 'latest';
        
        dependencies.push({
          name: packageName,
          version: version,
          operator: operator
        });
        
        console.log(`✅ Parsed: ${packageName} ${operator}${version}`);
      } else {
        console.log(`⚠️ Could not parse line: ${trimmed}`);
      }
    });
  }
  
  console.log(`📊 Total dependencies parsed: ${dependencies.length}`);
  
  if (dependencies.length === 0) {
    depList.innerHTML = `
      <div style="padding: 12px; background: var(--bg-app); border-radius: 6px; color: var(--text-dim);">
        Found ${data.project.dependency_files.join(', ')} but could not parse dependencies
      </div>
    `;
    return;
  }
  
  // Render dependencies
  depList.innerHTML = dependencies.map(dep => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg-app); border-radius: 6px;">
      <div>
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${esc(dep.name)}</div>
        <div style="font-size: 12px; color: var(--text-dim);">Version: ${esc(dep.operator)}${esc(dep.version)}</div>
      </div>
      <div style="padding: 4px 8px; background: rgba(34, 197, 94, 0.1); border-radius: 4px; font-size: 12px; color: var(--success); font-weight: 600;">
        ✓
      </div>
    </div>
  `).join('');
  
  console.log('✅ Dependencies rendered successfully');
}

// Render issues
function renderIssues(issues) {
  const list = document.getElementById('issues-list');
  if (!list) return;
  
  list.innerHTML = '';
  
  if (issues.length === 0) {
    list.innerHTML = `
      <div class="railway-card list-item">
        <div class="list-item-left">
          <div class="status-badge success">✓</div>
          <div class="item-info">
            <div class="item-title">No Issues Found</div>
            <div class="item-meta">Your code looks great!</div>
          </div>
        </div>
      </div>
    `;
    return;
  }
  
  issues.forEach((issue, i) => {
    const card = document.createElement('div');
    card.className = 'railway-card list-item';
    
    const badge = issue.severity === 'error' ? 'critical' : 
                  issue.severity === 'warning' ? 'warning' : 'success';
    const icon = issue.severity === 'error' ? '!' : 
                 issue.severity === 'warning' ? '⚠' : 'ℹ';
    
    card.innerHTML = `
      <div class="list-item-left">
        <div class="status-badge ${badge}">${icon}</div>
        <div class="item-info">
          <div class="item-title">${esc(issue.issue)}</div>
          <div class="item-meta">
            <span>${esc(issue.file)}</span>
            <span class="dot-sep">•</span>
            <span>Line ${issue.line}</span>
          </div>
        </div>
      </div>
      <div class="list-item-right">
        <button class="btn-action" onclick="viewIssue(${i})">View</button>
      </div>
    `;
    
    list.appendChild(card);
  });
  
  const secTitle = document.querySelector('.section-title');
  if (secTitle) secTitle.textContent = `Analysis Results (${issues.length})`;
}

// View issue
window.viewIssue = function(i) {
  const issue = projectData.audit.issues[i];
  const color = issue.severity === 'error' ? '#ef4444' :
                issue.severity === 'warning' ? '#f59e0b' : '#3b82f6';
  
  const modal = document.createElement('div');
  modal.style.cssText = `position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px;`;
  
  modal.innerHTML = `
    <div style="background: #09090b; border-radius: 12px; max-width: 800px; width: 100%; padding: 24px; max-height: 90vh; overflow: auto; border: 1px solid #27272a;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 20px; margin-bottom: 8px; color: #ededef;">${esc(issue.issue)}</h2>
          <span style="padding: 4px 8px; background: ${color}20; color: ${color}; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase;">${issue.severity}</span>
          <span style="color: #a1a1aa; margin-left: 12px; font-size: 14px;">${esc(issue.file)} • Line ${issue.line}</span>
        </div>
        <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; color: #a1a1aa; cursor: pointer; font-size: 28px; line-height: 1; padding: 0; width: 32px; height: 32px;">×</button>
      </div>
      ${issue.snippet ? `
        <div style="margin-top: 20px;">
          <h3 style="font-size: 14px; margin-bottom: 12px; color: #ededef;">Code Context:</h3>
          <pre style="background: #000; border: 1px solid #27272a; border-radius: 8px; padding: 16px; overflow-x: auto; font-family: monospace; font-size: 13px; line-height: 1.6; color: #ededef;">${esc(issue.snippet)}</pre>
        </div>
      ` : ''}
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
};

// File tree
function renderFileTree(data) {
  const tree = document.getElementById('file-tree');
  if (!tree || !data.structure) return;
  
  function build(node, depth = 0) {
    const indent = '  '.repeat(depth);
    const icon = node.type === 'dir' ? '📁' : '📄';
    const color = node.type === 'dir' ? '#ededef' : '#a1a1aa';
    let html = `<div style="color: ${color}; padding: 2px 0;">${indent}${icon} ${esc(node.name)}</div>`;
    
    if (node.children) {
      node.children.forEach(child => html += build(child, depth + 1));
    }
    return html;
  }
  
  tree.innerHTML = build(data.structure);
}

function esc(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setupClose() {
  const btn = document.querySelector('.close-btn');
  if (btn) btn.addEventListener('click', () => window.location.href = 'index.html');
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎯 Initializing...');
  initTabs();
  setupClose();
  
  if (projectData) {
    console.log('✅ Updating UI with real data');
    updateUI(projectData);
  } else {
    console.log('⚠️ No data - static mode');
  }
  
  console.log('🎉 Ready!');
});