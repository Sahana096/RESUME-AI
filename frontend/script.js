// --- Global State ---
let currentUser = null;
let selectedResumes = [];
let jdText = "";
let jdFile = null;
let jdMode = "paste"; // "paste" or "upload"

// --- Dashboard Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  const userJson = localStorage.getItem('user');
  if (!userJson) {
    window.location.href = 'auth.html';
    return;
  }

  currentUser = JSON.parse(userJson);

  // Strict Role Check - Ensure user is on the correct dashboard
  const isHR = currentUser.role === 'hr';
  const pathname = window.location.pathname;

  if (isHR && pathname.includes('candidate-dashboard.html')) {
    window.location.href = 'hr-dashboard.html';
    return;
  } else if (!isHR && pathname.includes('hr-dashboard.html')) {
    window.location.href = 'candidate-dashboard.html';
    return;
  }

  initDashboard(currentUser);
  initDragAndDrop();
  
  // Add entry animation
  const main = document.querySelector('main');
  if (main) {
    main.style.opacity = '0';
    main.style.transform = 'translateY(10px)';
    setTimeout(() => {
      main.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
      main.style.opacity = '1';
      main.style.transform = 'translateY(0)';
    }, 100);
  }
});

function initDragAndDrop() {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
  }, false);
}

function initDashboard(user) {
  const isHR = user.role === 'hr';
  document.getElementById('portal-title').innerText = isHR ? 'HireSmart - HR Portal' : 'HireSmart - Candidate Portal';
  document.getElementById('tool-title').innerText = isHR ? 'Bulk Resume Screener' : 'Resume Matching Tool';
  document.getElementById('upload-title').innerText = isHR ? '📁 Upload Candidate Resumes' : '📄 Upload Your Resume';
  document.getElementById('upload-description').innerHTML = isHR
    ? '<strong>Bulk Mode:</strong> You can select and upload multiple resumes at once'
    : 'Upload your resume in PDF, DOC, or DOCX format';
  document.getElementById('analyze-btn-text').innerText = isHR ? 'Analyze & Rank All Resumes' : 'Analyze Match';
  document.getElementById('user-initial').innerText = user.name.charAt(0).toUpperCase();

  const fileInput = document.getElementById('file-input');
  if (isHR) {
    fileInput.setAttribute('multiple', 'true');
  }
}

function logout() {
  const userJson = localStorage.getItem('user');
  let redirectUrl = 'index.html';

  if (userJson) {
    const user = JSON.parse(userJson);
    if (user.role === 'user') {
      redirectUrl = 'auth.html?role=user';
    } else if (user.role === 'hr') {
      redirectUrl = 'auth.html?role=hr';
    }
  }

  localStorage.clear();
  window.location.href = redirectUrl;
}

// --- Wizard Navigation ---
function goToStep(step) {
  // Basic validation before moving
  if (step === 2 && selectedResumes.length === 0) {
    alert("Please select at least one resume first.");
    return;
  }
  if (step === 3 && !jdText && !jdFile) {
    alert("Please provide a job description first.");
    return;
  }

  // Hide all steps, remove active classes
  document.querySelectorAll('.step-card').forEach(card => card.classList.remove('step-active'));

  // Show target step
  document.getElementById(`step-${step}-card`).classList.add('step-active');
  document.getElementById(`step-${step}-card`).scrollIntoView({ behavior: 'smooth' });
}

// --- File Handling ---
function handleFileSelect(input) {
  handleFiles(input.files);
}

function handleFiles(files) {
  const fileArray = Array.from(files);
  const isHR = currentUser.role === 'hr';

  for (const file of fileArray) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'doc', 'docx'].includes(ext)) {
      alert(`File "${file.name}" is not a valid resume (PDF, DOCS only)`);
      continue;
    }

    // For normal users, only keep the latest one. For HR, append.
    if (isHR) {
      // Check if file already added (by name and size)
      const exists = selectedResumes.some(f => f.name === file.name && f.size === file.size);
      if (!exists) {
        selectedResumes.push(file);
      }
    } else {
      selectedResumes = [file];
    }
  }

  renderFileList();
}

function renderFileList() {
  const fileListContainer = document.getElementById('file-list');
  const fileStatus = document.getElementById('file-status');
  const nextBtn = document.getElementById('next-1');
  const isHR = currentUser.role === 'hr';

  fileListContainer.innerHTML = '';

  if (selectedResumes.length > 0) {
    fileStatus.innerHTML = isHR
      ? `<span style="color:var(--primary); font-weight: 800;">✓ ${selectedResumes.length} Resumes Selected</span>`
      : `<span style="color:var(--primary)">✓ Resume Selected</span>`;

    selectedResumes.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.innerHTML = `
        <div class="file-info">
          <span>📄</span>
          <span>${file.name}</span>
          <span style="font-size: 11px; color: var(--text-muted)">(${(file.size / 1024).toFixed(1)} KB)</span>
        </div>
        <button class="btn-remove" onclick="removeFile(${index})" title="Remove">✕</button>
      `;
      fileListContainer.appendChild(item);
    });

    if (isHR) {
      document.getElementById('analyze-btn-text').innerText = selectedResumes.length > 1
        ? `Analyze & Rank ${selectedResumes.length} Resumes`
        : `Analyze & Rank Resume`;
    }

    nextBtn.classList.add('enabled');
  } else {
    fileStatus.innerText = "Choose your resume file";
    nextBtn.classList.remove('enabled');
    if (isHR) {
      document.getElementById('analyze-btn-text').innerText = 'Analyze & Rank All Resumes';
    }
  }
}

function removeFile(index) {
  selectedResumes.splice(index, 1);
  renderFileList();
}

function setJDMode(mode) {
  jdMode = mode;
  document.getElementById('btn-paste').classList.toggle('active', mode === 'paste');
  document.getElementById('btn-upload-jd').classList.toggle('active', mode === 'upload');
  document.getElementById('jd-paste-area').style.display = mode === 'paste' ? 'block' : 'none';
  document.getElementById('jd-upload-area').style.display = mode === 'upload' ? 'block' : 'none';
  checkJD();
}

function handleJDFileSelect(input) {
  if (input.files.length > 0) {
    jdFile = input.files[0];
    document.getElementById('jd-file-status').innerText = jdFile.name;
  } else {
    jdFile = null;
    document.getElementById('jd-file-status').innerText = "Select Job Description PDF";
  }
  checkJD();
}

function checkJD() {
  jdText = document.getElementById('jd-text').value.trim();
  if ((jdMode === 'paste' && jdText.length > 50) || (jdMode === 'upload' && jdFile)) {
    document.getElementById('next-2').classList.add('enabled');
  } else {
    document.getElementById('next-2').classList.remove('enabled');
  }
}

// --- Analysis Flow ---
async function runAnalysis() {
  if (selectedResumes.length === 0) return;

  const btn = document.getElementById('btn-run-analysis');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<div class="loader-dots">
                    <span></span><span></span><span></span>
                   </div> Analyzing...`;
  btn.disabled = true;
  btn.classList.add('btn-processing');

  const formData = new FormData();
  formData.append("userId", currentUser.email);

  // Add JD
  if (jdMode === 'paste') {
    formData.append("jobDescription", jdText);
  } else if (jdFile) {
    formData.append("jdFile", jdFile); // Note: server might need update for JD file parsing
  }

  // Add Resumes
  selectedResumes.forEach(file => {
    formData.append("resumes", file);
  });

  try {
    const res = await fetch("http://localhost:5000/analyze", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error("Server error during analysis");

    const data = await res.json();
    displayResults(data);
  } catch (err) {
    console.error(err);
    alert("Analysis failed. Please check if the backend is running.");
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
    btn.classList.remove('btn-processing');
  }
}

async function displayResults(results) {
  const overlay = document.getElementById('results-overlay');
  const content = document.getElementById('results-content');
  overlay.style.display = 'flex';
  content.innerHTML = '';

  if (!Array.isArray(results) || results.length === 0) {
    const errorMsg = results && results.error ? `Error: ${results.error}` : 'No results found.';
    content.innerHTML = `<p style="text-align: center; color: ${results && results.error ? '#ef4444' : 'var(--text-muted)'}; padding: 20px;">${errorMsg}</p>`;
    return;
  }

  // 1. Summary Section
  let summaryHtml = `
    <div style="margin-bottom: 40px; background: #f8fafc; padding: 30px; border-radius: 16px; border: 1px solid #e2e8f0;">
      <h2 style="margin-bottom: 20px; font-size: 22px; color: var(--text-main); display: flex; align-items: center; gap: 10px;">
        <span>📋</span> Quick Overview
      </h2>
      <div style="display: grid; gap: 12px;">
  `;

  // Sort results for consistent view
  const sortedResults = [...results].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  sortedResults.forEach(res => {
    if (res.error) return;
    const displayName = res.candidateName || res.fileName;
    summaryHtml += `
      <div style="display: flex; align-items: center; justify-content: space-between; background: white; padding: 15px 25px; border-radius: 12px; border: 1px solid #edf2f7; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
        <div style="font-weight: 700; color: var(--text-main); font-size: 16px;">👤 ${displayName}</div>
        <div style="display: flex; align-items: center; gap: 20px;">
          <span class="tag match" style="margin:0; font-size: 12px; padding: 4px 12px;">${res.classification}</span>
          <span style="font-weight: 800; color: var(--primary); font-size: 16px;">${res.matchScore}%</span>
        </div>
      </div>
    `;
  });

  summaryHtml += `</div></div>`;

  // 2. Detailed Section Header
  let detailsHtml = `
    <h2 style="margin-bottom: 30px; font-size: 22px; color: var(--text-main); display: flex; align-items: center; gap: 10px; padding-left: 10px;">
      <span>🔍</span> Detailed Analysis
    </h2>
  `;

  // 3. Detailed Cards
  sortedResults.forEach(res => {
    if (res.error) {
      detailsHtml += `
        <div class="candidate-result-card" style="border-left: 4px solid #ef4444;">
          <div class="candidate-header">
            <div class="candidate-name">👤 ${res.fileName}</div>
            <span class="tag" style="background: #fee2e2; color: #ef4444;">Processing Error</span>
          </div>
          <div class="summary-text" style="color: #ef4444;">Error: ${res.error}</div>
        </div>
      `;
    } else {
      const displayName = res.candidateName || res.fileName;
      detailsHtml += `
        <div class="candidate-result-card">
          <div class="candidate-header" style="flex-direction: column; align-items: flex-start; gap: 10px;">
            <div class="candidate-name" style="font-size: 24px; color: var(--primary);">👤 ${displayName}</div>
            <div style="display: flex; align-items: center; gap: 15px; width: 100%; border-top: 1px solid #f1f5f9; padding-top: 10px;">
              <span style="font-weight: 700; color: var(--text-muted); font-size: 14px; text-transform: uppercase;">Suitability:</span>
              <span class="tag match" style="margin:0;">${res.classification}</span>
              <div style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 600; font-size: 14px;">Match Score:</span>
                <div class="score-circle-result" style="width: 50px; height: 50px; font-size: 14px; margin:0; border-width: 2px;">${res.matchScore}%</div>
              </div>
            </div>
          </div>
          <div class="summary-text" style="margin-top: 15px;">${res.summary}</div>
          ${renderDetailedAnalysis(res)}
        </div>
      `;
    }
  });

  content.innerHTML = summaryHtml + detailsHtml;
}

function renderDetailedAnalysis(res) {
  return `
    <div class="results-detail-grid">
      <div class="detail-column">
        <h3>Job Requirements</h3>
        ${res.jdSkills.map(skill => `
          <div class="skill-box">
            <span>${skill.toUpperCase()}</span>
            <span class="status-dot ${res.matchedSkills.includes(skill) ? 'match' : 'missing'}"></span>
          </div>
        `).join('') || '<p style="color: #64748b; font-size: 14px;">No specific skills identified in JD.</p>'}
      </div>
      <div class="detail-column">
        <h3>Candidate Qualifications</h3>
        ${res.matchedSkills.map(skill => `
          <div class="skill-box">
            <span>${skill.toUpperCase()}</span>
            <span style="color: #10b981; font-size: 12px; font-weight: bold;">FOUND</span>
          </div>
        `).join('') || '<p style="color: #64748b; font-size: 14px;">No matching skills found.</p>'}
      </div>
    </div>
  `;
}

function closeResults() {
  document.getElementById('results-overlay').style.display = 'none';
}