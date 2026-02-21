// --- BACKEND CONFIGURATION ---
// PASTE YOUR FIREBASE CONFIG HERE FROM FIREBASE CONSOLE:
const firebaseConfig = {
    apiKey: "AIzaSyCTh-4Bx8gGxMyM7WQbyTq540ZeD3VeQ34",
    authDomain: "bvrresume-4a9d4.firebaseapp.com",
    projectId: "bvrresume-4a9d4",
    storageBucket: "bvrresume-4a9d4.firebasestorage.app",
    messagingSenderId: "194909453411",
    appId: "1:194909453411:web:4689565dd9188b0cd84c56",
    measurementId: "G-RTJP4E68RK"
};

// Only initialize if config is provided
let db = null;
let auth = null;
if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
}

// --- STATE MANAGEMENT ---
let jobs = JSON.parse(localStorage.getItem('bvr_jobs')) || [];
let currentUser = null;

// UI Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('resume-upload');
const jdInput = document.getElementById('job-description');
const companyInput = document.getElementById('job-company');
const roleInput = document.getElementById('job-role');
const analyzeBtn = document.getElementById('run-analysis');
const resultsPanel = document.getElementById('results-panel');
const resultsContent = document.querySelector('.results-content');
const emptyState = document.querySelector('.empty-state');
const fileInfoDisplay = document.getElementById('file-info');

// Navigation
const navDashboard = document.getElementById('nav-dashboard');
const navAnalyze = document.getElementById('nav-analyze');
const btnBack = document.getElementById('btn-back-dashboard');
const dashboardView = document.getElementById('dashboard-view');
const analysisView = document.getElementById('analysis-view');
const heroSection = document.getElementById('hero-section');

// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    updateDashboard();
});

// --- Navigation Logic ---
navDashboard.addEventListener('click', (e) => {
    e.preventDefault();
    showView('dashboard');
});

navAnalyze.addEventListener('click', (e) => {
    e.preventDefault();
    resetAnalysisForm();
    showView('analysis');
});

btnBack.addEventListener('click', () => {
    showView('dashboard');
});

function showView(view) {
    if (view === 'dashboard') {
        dashboardView.classList.remove('hidden');
        analysisView.classList.add('hidden');
        heroSection.classList.remove('hidden');
        navDashboard.classList.add('active-nav');
        updateDashboard();
    } else {
        dashboardView.classList.add('hidden');
        analysisView.classList.remove('hidden');
        heroSection.classList.add('hidden');
        navDashboard.classList.remove('active-nav');
    }
}

function resetAnalysisForm() {
    companyInput.value = "";
    roleInput.value = "";
    jdInput.value = "";
    fileInfoDisplay.textContent = "No file selected";
    currentFile = null;
    extractedText = "";
    resultsContent.classList.add('hidden');
    emptyState.classList.remove('hidden');
}

// --- File Handling ---
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
});

dropZone.addEventListener('drop', (e) => {
    handleFile(e.dataTransfer.files[0]);
});

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

async function handleFile(file) {
    if (!file) return;
    if (file.type !== 'application/pdf' && file.type !== 'text/plain') {
        alert('Please upload a PDF or TXT file.');
        return;
    }
    currentFile = file;
    fileInfoDisplay.textContent = `Selected: ${file.name}`;
    fileInfoDisplay.style.color = 'var(--primary)';
    extractedText = file.type === 'application/pdf' ? await extractTextFromPDF(file) : await file.text();
}

async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + "\n";
    }
    return fullText;
}

// --- Analysis & Storage ---
analyzeBtn.addEventListener('click', async () => {
    if (!currentFile || !companyInput.value || !roleInput.value) {
        alert('Please fill in Company, Role, and Upload a Resume.');
        return;
    }

    analyzeBtn.disabled = true;
    analyzeBtn.querySelector('span').textContent = 'Analyzing...';

    setTimeout(() => {
        const result = performAnalysis();
        saveJob(result);
        displayFullResults(result);
        analyzeBtn.disabled = false;
        analyzeBtn.querySelector('span').textContent = 'Save & Analyze';
    }, 800);
});

function performAnalysis() {
    const jdText = jdInput.value || "";
    const resumeText = extractedText.toLowerCase();

    // 1. Keywords logic
    const keywords = extractKeywords(jdText);
    const matches = keywords.map(kw => ({
        word: kw,
        matched: resumeText.includes(kw.toLowerCase())
    }));
    const matchCount = matches.filter(m => m.matched).length;
    const keywordScore = keywords.length > 0 ? (matchCount / keywords.length) * 100 : 50;

    // 2. Achievement & Impact Check (New: Inspired by Resume Experts)
    const impactResults = analyzeImpact(extractedText);
    const impactScore = impactResults.score;

    // 3. Formatting & Professional Audit
    const auditResults = runFormattingAudit(extractedText);
    const auditScore = (auditResults.filter(r => r.type === 'success').length / auditResults.length) * 100;

    // Final Weighting: Keywords (50%), Impact/Achievements (30%), Formatting (20%)
    const finalScore = Math.round((keywordScore * 0.5) + (impactScore * 0.3) + (auditScore * 0.2));

    return {
        id: Date.now(),
        company: companyInput.value,
        role: roleInput.value,
        date: new Date().toLocaleDateString(),
        score: finalScore,
        matches: matches,
        audit: [...auditResults, ...impactResults.tips],
        rawText: extractedText,
        fileName: currentFile ? currentFile.name : "Text Paste",
        jd: jdText,
        status: 'Analysed'
    };
}

function analyzeImpact(text) {
    const tips = [];
    let impactPoints = 0;

    // Check for metrics (Numbers, Percentages, Currency)
    const metricsRegex = /\d+%|\d+\s?%|[\$£]\d+|million|billion|revenue|increased|decreased|reduced/gi;
    const metricsCount = (text.match(metricsRegex) || []).length;

    if (metricsCount > 3) {
        impactPoints += 40;
        tips.push({ text: "Strong use of quantifiable metrics discovered.", type: "success" });
    } else {
        tips.push({ text: "Low quantifiable impact. Try adding percentages (%) or dollar amounts ($).", type: "warning" });
    }

    // Check for Action Verbs
    const actionVerbs = ['developed', 'led', 'managed', 'implemented', 'designed', 'engineered', 'streamlined', 'optimized', 'architected', 'scaled'];
    const verbCount = actionVerbs.filter(v => text.toLowerCase().includes(v)).length;

    if (verbCount > 5) {
        impactPoints += 40;
        tips.push({ text: "Excellent use of high-impact action verbs.", type: "success" });
    } else {
        tips.push({ text: "Consider using more powerful action verbs (e.g., 'Optimized' instead of 'Worked on').", type: "warning" });
    }

    // Check for LinkedIn Profile
    if (text.toLowerCase().includes('linkedin.com/in/')) {
        impactPoints += 20;
        tips.push({ text: "LinkedIn profile found and verified.", type: "success" });
    } else {
        tips.push({ text: "LinkedIn profile link missing. Recruiters often skip profiles without them.", type: "warning" });
    }

    return { score: impactPoints, tips: tips };
}

// --- AUTH & SYNC LOGIC ---
const loginBtn = document.getElementById('btn-login');
const authStatus = document.getElementById('auth-status');

if (auth) {
    loginBtn.addEventListener('click', () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider);
    });

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            loginBtn.classList.add('hidden');
            authStatus.classList.remove('hidden');
            authStatus.textContent = `Logged in as ${user.displayName.split(' ')[0]}`;
            syncFromCloud();
        } else {
            currentUser = null;
            loginBtn.classList.remove('hidden');
            authStatus.classList.add('hidden');
        }
    });
}

function saveJob(job) {
    // Save to LocalStorage (Always)
    jobs.unshift(job);
    localStorage.setItem('bvr_jobs', JSON.stringify(jobs));

    // Save to Cloud (If logged in)
    if (db && currentUser) {
        db.collection('users').doc(currentUser.uid).collection('jobs').doc(job.id.toString()).set(job)
            .then(() => console.log("Job synced to cloud"))
            .catch(err => console.error("Cloud sync error:", err));
    }
}

async function syncFromCloud() {
    if (db && currentUser) {
        const snapshot = await db.collection('users').doc(currentUser.uid).collection('jobs').orderBy('id', 'desc').get();
        const cloudJobs = [];
        snapshot.forEach(doc => cloudJobs.push(doc.data()));
        if (cloudJobs.length > 0) {
            jobs = cloudJobs;
            localStorage.setItem('bvr_jobs', JSON.stringify(jobs));
            updateDashboard();
        }
    }
}

function deleteJob(id, e) {
    e.stopPropagation();
    jobs = jobs.filter(j => j.id !== id);
    localStorage.setItem('bvr_jobs', JSON.stringify(jobs));

    if (db && currentUser) {
        db.collection('users').doc(currentUser.uid).collection('jobs').doc(id.toString()).delete();
    }
    updateDashboard();
}

// --- UI Updates ---
function updateDashboard() {
    const grid = document.getElementById('jobs-grid');
    const statTotal = document.getElementById('stat-total');
    const statHigh = document.getElementById('stat-high');

    statTotal.textContent = jobs.length;
    statHigh.textContent = jobs.filter(j => j.score >= 80).length;

    if (jobs.length === 0) {
        grid.innerHTML = `
            <div class="empty-dashboard">
                <h3>No jobs tracked yet</h3>
                <p>Click "+ Track New Job" to start tailoring your resume.</p>
            </div>`;
        return;
    }

    grid.innerHTML = jobs.map(job => `
        <div class="job-card" onclick="viewJob(${job.id})">
            <div class="job-card-header">
                <span class="company-badge">${job.company}</span>
                <span class="job-score-small" style="color: ${getScoreColor(job.score)}">${job.score}%</span>
            </div>
            <h3>${job.role}</h3>
            <p class="job-date">Added on ${job.date}</p>
            <div class="job-card-footer">
                <div class="status-indicator">
                    <span class="dot"></span>
                    <span>${job.status}</span>
                </div>
                <button class="btn-delete" onclick="deleteJob(${job.id}, event)">×</button>
            </div>
        </div>
    `).join('');
}

function viewJob(id) {
    const job = jobs.find(j => j.id === id);
    if (!job) return;

    showView('analysis');
    companyInput.value = job.company;
    roleInput.value = job.role;
    jdInput.value = job.jd;
    displayFullResults(job);
}

function displayFullResults(job) {
    emptyState.classList.add('hidden');
    resultsContent.classList.remove('hidden');

    document.getElementById('result-job-title').textContent = `${job.company} - ${job.role}`;

    // Show attached filename and analysis summary
    const summaryElement = document.getElementById('score-summary');
    summaryElement.innerHTML = `Linked Resume: <span style="color: var(--primary)">${job.fileName || 'Archive'}</span>`;

    // Score Circle
    const scoreNum = document.getElementById('score-num');
    const scoreRing = document.getElementById('score-ring');
    const circumference = 2 * Math.PI * 52;
    scoreNum.textContent = job.score;
    scoreRing.style.strokeDashoffset = circumference - (job.score / 100) * circumference;
    scoreRing.style.stroke = getScoreColor(job.score);

    document.getElementById('extracted-text').textContent = job.rawText;

    document.getElementById('keyword-matches').innerHTML = job.matches.map(m => `
        <div class="keyword-tag ${m.matched ? 'matched' : 'missing'}">
            <span>${m.word}</span>
            <span>${m.matched ? '✓' : '×'}</span>
        </div>
    `).join('');

    document.getElementById('formatting-audit').innerHTML = job.audit.map(a => `
        <li style="color: var(--${a.type}); margin-bottom: 0.8rem; list-style: none;">
            ${a.type === 'success' ? '●' : '▲'} ${a.text}
        </li>
    `).join('');

    let recommendation = "";
    if (job.score > 85) recommendation = "Elite Match: Your resume shows high impact and perfect technical alignment.";
    else if (job.score > 70) recommendation = "Strong Match: Good visibility, but consider adding more quantifiable results.";
    else recommendation = "Low Match: Needs professional revamp of action verbs and technical keywords.";

    summaryElement.innerHTML += `<br><span style="font-size: 0.9rem; opacity: 0.8;">${recommendation}</span>`;
}

function getScoreColor(score) {
    if (score >= 80) return 'var(--success)';
    if (score >= 60) return 'var(--warning)';
    return 'var(--danger)';
}

// --- Utils (Keyword Extraction & Audit) ---
function extractKeywords(text) {
    const techTerms = ['React', 'Node', 'Python', 'Java', 'SQL', 'AWS', 'Docker', 'Kubernetes', 'Javascript', 'TypeScript', 'Machine Learning', 'AI', 'Cloud', 'Infrastructure', 'Frontend', 'Backend', 'Fullstack', 'DevOps', 'Agile', 'Scrum', 'Management', 'Strategy', 'Design', 'API', 'NoSQL', 'Database', 'Scaling', 'Architecture', 'Go', 'Rust', 'GraphQL', 'System Design'];
    const found = techTerms.filter(term => (text || "").toLowerCase().includes(term.toLowerCase()));
    return [...new Set(found)].slice(0, 15);
}

function runFormattingAudit(text) {
    const results = [];
    if (text.length > 800) results.push({ text: "Content depth is excellent for parser indexing.", type: "success" });
    else results.push({ text: "Resume content is thin. Add more technical context.", type: "warning" });

    const suspiciousSymbols = /[^\x00-\x7F]/g;
    const symbolsCount = (text.match(suspiciousSymbols) || []).length;
    if (symbolsCount < 15) results.push({ text: "Clean character encoding detected. Optimal for OCR.", type: "success" });
    else results.push({ text: "Non-standard symbols found. May cause OCR scrambling.", type: "warning" });

    if (!text.includes("          ")) results.push({ text: "Linear text flow detected. Great for Workday/Taleo.", type: "success" });
    else results.push({ text: "Suspected multi-column layout detected.", type: "warning" });

    if (/skills|technologies|expertise/i.test(text)) results.push({ text: "Technical Skills header recognized.", type: "success" });
    else results.push({ text: "Missing clear Skills section.", type: "warning" });

    return results;
}

// Tab Switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`${tabId}-tab`).classList.add('active');
    });
});
