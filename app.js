const LEGACY_DEMO_SEMESTERS = new Set(["Ganjil 2026/2027"]);

function academicTermForDate(date = new Date()) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month >= 9) return `Ganjil ${year}/${year + 1}`;
  if (month === 1) return `Ganjil ${year - 1}/${year}`;
  return `Genap ${year - 1}/${year}`;
}

const CURRENT_ACTIVE_SEMESTER = academicTermForDate();

function defaultKhsForms() {
  return [
    {
      id: "khs-form-evaluasi",
      title: "Evaluasi Pembelajaran",
      description: "Form evaluasi singkat sebelum mahasiswa mencetak KHS.",
      semester: CURRENT_ACTIVE_SEMESTER,
      requiredForPrint: true,
      active: true,
      questions: [
        { id: "q-kepuasan", label: "Bagaimana penilaian Anda terhadap proses pembelajaran semester ini?", type: "select", required: true, options: ["Sangat Baik", "Baik", "Cukup", "Perlu Perbaikan"] },
        { id: "q-masukan", label: "Tuliskan masukan untuk peningkatan pembelajaran.", type: "textarea", required: true, options: [] },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "khs-form-konfirmasi",
      title: "Konfirmasi Data Akademik",
      description: "Form konfirmasi bahwa data mahasiswa dan mata kuliah sudah diperiksa.",
      semester: CURRENT_ACTIVE_SEMESTER,
      requiredForPrint: true,
      active: true,
      questions: [
        { id: "q-data", label: "Saya menyatakan data akademik yang tampil sudah saya periksa.", type: "checkbox", required: true, options: ["Ya, saya setuju"] },
        { id: "q-catatan", label: "Catatan koreksi jika ada.", type: "textarea", required: false, options: [] },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

const roleNames = {
  student: "Mahasiswa",
  lecturer: "Dosen",
  staff: "Staf Akademik",
  admin: "Administrator",
};

const gradeLetterWeights = {
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.4,
  C: 2.0,
  "C-": 1.7,
  D: 1.0,
  E: 0.0,
};

function roundTwo(value) {
  return Math.round((Number(value) + 1e-9) * 100) / 100;
}

function gradeWeightFromLetter(letter, directWeight) {
  const mapped = gradeLetterWeights[String(letter || "").toUpperCase()];
  if (mapped !== undefined) return mapped;
  if (directWeight !== undefined && directWeight !== null && directWeight !== "") return Number(directWeight);
  return 0;
}

function gradeWeightValue(value, fallbackLetter = "") {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return roundTwo(numeric);
  return gradeWeightFromLetter(fallbackLetter);
}

function gradeLetterFromWeight(weight) {
  const target = Number(weight);
  if (!Number.isFinite(target)) return "E";
  const exact = Object.entries(gradeLetterWeights).find(([, value]) => Math.abs(value - target) < 0.001);
  if (exact) return exact[0];
  return Object.entries(gradeLetterWeights).reduce((best, current) => (Math.abs(current[1] - target) < Math.abs(best[1] - target) ? current : best))[0];
}

const seedData = createEmptyData();

function createEmptyData() {
  return {
    users: [],
    courses: [],
    materials: [],
    assignments: [],
    submissions: [],
    gradeEntries: [],
    quizzes: [],
    attendanceSessions: [],
    announcements: [],
    calendarEvents: [],
    discussions: [],
    notifications: [],
    audit: [],
    integrations: [],
    khsForms: [],
    khsFormSubmissions: [],
    settings: {
      letterheadDataUrl: "",
      letterheadName: "",
      letterheadType: "",
    },
  };
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "layout-dashboard", roles: ["student", "lecturer", "staff", "admin"] },
  { id: "grades", label: "KHS", icon: "badge-check", roles: ["student", "lecturer", "staff", "admin"] },
  { id: "announcements", label: "Pengumuman", icon: "megaphone", roles: ["student", "lecturer", "staff", "admin"] },
  { id: "calendar", label: "Kalender Akademik", icon: "calendar-days", roles: ["student", "lecturer", "staff", "admin"] },
  { id: "academic", label: "Data Akademik", icon: "graduation-cap", roles: ["staff", "admin"] },
  { id: "khs-forms", label: "Form KHS", icon: "clipboard-check", roles: ["staff", "admin"] },
  { id: "pdf-settings", label: "PDF KHS", icon: "file-cog", roles: ["admin"] },
];

const archivedNavItems = [
  { id: "courses", label: "Kelas", icon: "book-open", roles: ["student", "lecturer", "staff", "admin"] },
  { id: "materials", label: "Materi", icon: "folder-open", roles: ["student", "lecturer"] },
  { id: "assignments", label: "Tugas", icon: "clipboard-list", roles: ["student", "lecturer"] },
  { id: "quizzes", label: "Kuis", icon: "timer", roles: ["student", "lecturer"] },
  { id: "attendance", label: "Absensi", icon: "calendar-check", roles: ["student", "lecturer"] },
  { id: "reports", label: "Laporan", icon: "bar-chart-3", roles: ["lecturer", "staff", "admin"] },
  { id: "users", label: "Pengguna", icon: "users", roles: ["admin"] },
  { id: "academic", label: "Akademik", icon: "building-2", roles: ["staff", "admin"] },
  { id: "integrations", label: "Integrasi", icon: "refresh-cw", roles: ["staff", "admin"] },
  { id: "audit", label: "Audit Log", icon: "shield-check", roles: ["admin"] },
];

let data = normalizeData(structuredClone(seedData));
let saveInFlight = Promise.resolve();
let state = {
  currentUserId: null,
  activeView: "dashboard",
  courseFilter: "all",
  editAnnouncementId: null,
  editCalendarEventId: null,
  academicTab: "lecturers",
  editAcademicUserId: null,
  editCourseId: null,
  academicStudentCohortFilter: "all",
  academicEditMode: {
    lecturers: false,
    students: false,
    courses: false,
  },
  gradeStudentId: "",
  editGradeEntryId: null,
  gradeCohortFilter: "",
  khsEditMode: false,
  khsPdfSettings: null,
  khsPdfSettingsLoading: false,
  khsPdfSettingsMessage: "",
  khsFormTab: "settings",
  editKhsFormId: null,
  khsFormBuilderOpen: false,
  khsFormMasterEditMode: false,
  khsQuestionEditorCount: 6,
  khsFormCohortFilter: "all",
  khsFormStudentFilter: "all",
};

const $ = (selector) => document.querySelector(selector);
const content = $("#content");

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Permintaan ke server gagal.");
  return payload;
}

async function loadDataFromApi() {
  data = normalizeData(await apiRequest("/api/data"));
  return data;
}

function normalizeCourseTerm(term) {
  const value = String(term || "").trim();
  if (!value || LEGACY_DEMO_SEMESTERS.has(value)) return CURRENT_ACTIVE_SEMESTER;
  return value;
}

function syncActiveCourseRelations(normalized) {
  const activeCourseIds = new Set(normalized.courses.filter((course) => course.semester === CURRENT_ACTIVE_SEMESTER).map((course) => course.id));
  const activeStudentIds = new Set(normalized.users.filter((user) => user.role === "student").map((user) => user.id));

  normalized.users
    .filter((user) => user.role === "student")
    .forEach((student) => {
      const enrolled = new Set((student.enrolledCourseIds || []).filter((courseId) => activeCourseIds.has(courseId)));
      normalized.courses.forEach((course) => {
        if (course.semester === CURRENT_ACTIVE_SEMESTER && course.studentIds.includes(student.id)) enrolled.add(course.id);
      });
      student.enrolledCourseIds = [...enrolled];
    });

  normalized.courses.forEach((course) => {
    if (course.semester !== CURRENT_ACTIVE_SEMESTER) return;
    const related = new Set(course.studentIds.filter((studentId) => activeStudentIds.has(studentId)));
    normalized.users
      .filter((user) => user.role === "student" && (user.enrolledCourseIds || []).includes(course.id))
      .forEach((student) => related.add(student.id));
    course.studentIds = [...related];
  });
}

function normalizeData(source) {
  const normalized = { ...structuredClone(seedData), ...source };
  normalized.users ||= [];
  normalized.courses ||= [];
  normalized.courses = normalized.courses.map((course) => ({
    ...course,
    semester: normalizeCourseTerm(course.semester),
    semesterLevel: course.semesterLevel || course.semester_ke || "Semester 1",
    studentIds: [...new Set(course.studentIds || [])],
    instructorIds: [...new Set(course.instructorIds || [])],
  }));
  normalized.materials ||= [];
  normalized.assignments ||= [];
  normalized.submissions ||= [];
  normalized.gradeEntries ||= structuredClone(seedData.gradeEntries);
  normalized.gradeEntries = normalized.gradeEntries.map((row, index) => {
    const grade = gradeWeightValue(row.grade ?? row.bobot_angka ?? row.bobotAngka, row.letter || row.nilai_huruf);
    const credits = Number(row.credits ?? row.sks ?? 0);
    return {
      ...row,
      no: Number(row.no || index + 1),
      letter: row.letter || row.nilai_huruf || gradeLetterFromWeight(grade),
      grade,
      weighted: roundTwo(credits * grade),
      credits,
      subject: row.subject || row.mata_kuliah || "",
      code: row.code || row.kode || "",
    };
  });
  normalized.settings = { ...structuredClone(seedData.settings), ...(normalized.settings || {}) };
  normalized.settings.letterheadType ||= normalized.settings.letterheadDataUrl?.startsWith("data:application/pdf") ? "application/pdf" : normalized.settings.letterheadDataUrl ? "image/png" : "";
  normalized.quizzes ||= [];
  normalized.attendanceSessions ||= [];
  normalized.announcements ||= [];
  normalized.calendarEvents ||= structuredClone(seedData.calendarEvents);
  normalized.discussions ||= [];
  normalized.notifications ||= [];
  normalized.audit ||= [];
  normalized.integrations ||= [];
  normalized.khsForms = (normalized.khsForms || [])
    .filter((form, index, forms) => form?.id && forms.findIndex((item) => item.id === form.id) === index)
    .map((form) => ({
      ...form,
      semester: form.semester || CURRENT_ACTIVE_SEMESTER,
      requiredForPrint: form.requiredForPrint !== false,
      active: form.active !== false,
      questions: (form.questions || []).map((question, index) => ({
        id: question.id || `q-${Date.now()}-${index}`,
        label: question.label || "Pertanyaan",
        type: question.type || "text",
        required: question.required !== false,
        options: Array.isArray(question.options) ? question.options : [],
      })),
    }));
  normalized.khsFormSubmissions = (normalized.khsFormSubmissions || []).map((submission) => ({
    ...submission,
    semester: submission.semester || CURRENT_ACTIVE_SEMESTER,
    answers: submission.answers || {},
  }));
  normalized.users = normalized.users.map((user) => {
    if (user.role !== "student") return user;
    const program = user.program === "Teologi S1" ? user.program : "Teologi S1";
    const rawCohort = String(user.tahun_angkatan || "");
    const tahunAngkatan = /^20\d{2}$/.test(rawCohort) && Number(rawCohort) >= 2001 ? rawCohort : inferCohortFromIdentity(user.identity);
    return {
      ...user,
      program,
      tahun_angkatan: String(tahunAngkatan),
      currentSemester: CURRENT_ACTIVE_SEMESTER,
      enrolledCourseIds: [...new Set(user.enrolledCourseIds || [])],
    };
  });
  syncActiveCourseRelations(normalized);
  normalized.notifications = normalized.notifications.filter((item) => ["announcement", "calendar"].includes(item.entityType));
  return normalized;
}

function saveData() {
  saveInFlight = saveInFlight
    .catch(() => {})
    .then(async () => {
      data = normalizeData(await apiRequest("/api/data", { method: "PUT", body: JSON.stringify(data) }));
    })
    .catch((error) => {
      console.error(error);
      window.alert(error.message || "Data gagal disimpan ke server.");
    });
  return saveInFlight;
}

function currentUser() {
  return data.users.find((user) => user.id === state.currentUserId) || null;
}

function courseById(id) {
  return data.courses.find((course) => course.id === id);
}

function userById(id) {
  return data.users.find((user) => user.id === id);
}

function inferCohortFromIdentity(identity) {
  const value = String(identity || "");
  const fullYear = value.match(/20\d{2}/)?.[0];
  if (fullYear) return fullYear;
  const shortYear = value.match(/^\d{2}/)?.[0];
  return shortYear ? `20${shortYear}` : String(new Date().getFullYear());
}

function studentCohort(student) {
  return String(student?.tahun_angkatan || inferCohortFromIdentity(student?.identity));
}

function studentsForCohort(cohort = "all") {
  return data.users.filter((user) => user.role === "student" && (cohort === "all" || studentCohort(user) === String(cohort)));
}

function studentCohorts() {
  return [...new Set(data.users.filter((user) => user.role === "student").map(studentCohort))]
    .filter(Boolean)
    .sort((a, b) => Number(b) - Number(a));
}

function cohortOptions(selected = "all", includeAll = true) {
  const allOption = includeAll ? `<option value="all" ${selected === "all" ? "selected" : ""}>Semua angkatan</option>` : "";
  return `${allOption}${studentCohorts()
    .map((cohort) => `<option value="${escapeHtml(cohort)}" ${String(selected) === cohort ? "selected" : ""}>Angkatan ${escapeHtml(cohort)}</option>`)
    .join("")}`;
}

function khsCohortOptions(selected = "") {
  return `<option value="" ${!selected ? "selected" : ""}>Silakan pilih angkatan</option>${cohortOptions(selected, false)}`;
}

function groupStudentsByCohort(students) {
  return students.reduce((groups, student) => {
    const cohort = studentCohort(student);
    groups[cohort] ||= [];
    groups[cohort].push(student);
    return groups;
  }, {});
}

function historicalSemesters() {
  const terms = [];
  for (let startYear = 2026; startYear >= 2020; startYear -= 1) {
    terms.push(`Ganjil ${startYear}/${startYear + 1}`);
    if (startYear > 2020) terms.push(`Genap ${startYear - 1}/${startYear}`);
  }
  return terms;
}

function semesterOptions(selected = CURRENT_ACTIVE_SEMESTER) {
  return historicalSemesters()
    .map((semester) => `<option value="${escapeHtml(semester)}" ${selected === semester ? "selected" : ""}>${escapeHtml(semester)}</option>`)
    .join("");
}

function colorInputValue(value, fallback = "#000000") {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
    if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
      return `#${trimmed
        .slice(1)
        .split("")
        .map((char) => char + char)
        .join("")}`;
    }
  }
  const channels = Array.isArray(value) ? value : value && typeof value === "object" ? [value.r, value.g, value.b] : null;
  if (channels && channels.every((channel) => Number.isFinite(Number(channel)))) {
    return `#${channels
      .map((channel) => {
        const scaled = Number(channel) <= 1 ? Number(channel) * 255 : Number(channel);
        return Math.max(0, Math.min(255, Math.round(scaled))).toString(16).padStart(2, "0");
      })
      .join("")}`;
  }
  return fallback;
}

function numberInputValue(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function courseSemesterLevelOptions(selected = "Semester 1") {
  return Array.from({ length: 8 }, (_, index) => `Semester ${index + 1}`)
    .map((semester) => `<option value="${semester}" ${selected === semester ? "selected" : ""}>${semester}</option>`)
    .join("");
}

function courseFullLabel(course) {
  return `${course.code}-${course.className} ${course.name} (${course.semesterLevel || "Semester 1"}, ${course.semester})`;
}

function sortedSemesterLevels(groups) {
  return Object.keys(groups).sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));
}

function totalCredits(courses) {
  return courses.reduce((total, course) => total + Number(course.credits || 0), 0);
}

function gradeLetterOptions(selected = "A") {
  return Object.keys(gradeLetterWeights)
    .map((letter) => `<option value="${letter}" ${selected === letter ? "selected" : ""}>${letter}</option>`)
    .join("");
}

function courseCheckboxes(name, selectedIds = [], courses = data.courses) {
  const groups = groupCoursesBySemesterLevel(courses);
  if (!courses.length) return `<div class="empty-state">Belum ada mata kuliah pada semester aktif.</div>`;
  return sortedSemesterLevels(groups)
    .map(
      (semesterLevel) => `
      <details class="checkbox-group" data-course-group open>
        <summary>${escapeHtml(semesterLevel)} <span>${totalCredits(groups[semesterLevel])} SKS</span></summary>
        <div class="checkbox-list nested-checkbox-list">
          ${groups[semesterLevel]
            .map(
              (course) => `
              <label class="check-row" data-course-option data-search-text="${escapeHtml(`${course.code} ${course.className || ""} ${course.name} ${course.semesterLevel || ""}`.toLowerCase())}">
                <input type="checkbox" name="${name}" value="${course.id}" ${selectedIds.includes(course.id) ? "checked" : ""} />
                <span>${escapeHtml(`${course.code}-${course.className} ${course.name}`)} <small>${Number(course.credits || 0)} SKS</small></span>
              </label>
            `,
            )
            .join("")}
        </div>
      </details>
    `,
    )
    .join("") + `<div class="empty-state course-search-empty" hidden>Tidak ada mata kuliah yang cocok.</div>`;
}

function renderCourseDetails(courseLabels) {
  if (!courseLabels.length) return `<span class="muted">Belum mengambil mata kuliah</span>`;
  return `
    <details class="course-details">
      <summary>${courseLabels.length} mata kuliah</summary>
      <div class="course-details-list">
        ${courseLabels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
      </div>
    </details>
  `;
}

function renderCourseDetailsGrouped(courses) {
  if (!courses.length) return `<span class="muted">Belum ada mata kuliah</span>`;
  const groups = courses.reduce((result, course) => {
    const key = course?.semesterLevel || "Semester 1";
    result[key] ||= [];
    result[key].push(course);
    return result;
  }, {});
  return `
    <details class="course-details">
      <summary>${courses.length} mata kuliah</summary>
      <div class="course-details-list">
        ${Object.keys(groups)
          .sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")))
          .map(
            (semester) => `
              <strong>${escapeHtml(semester)}</strong>
              ${groups[semester].map((course) => `<span>${escapeHtml(courseFullLabel(course))}</span>`).join("")}
            `,
          )
          .join("")}
      </div>
    </details>
  `;
}

function groupCoursesBySemesterLevel(courses) {
  return courses.reduce((groups, course) => {
    const semester = course.semesterLevel || "Semester 1";
    groups[semester] ||= [];
    groups[semester].push(course);
    return groups;
  }, {});
}

function academicEditButton(tab) {
  const active = Boolean(state.academicEditMode?.[tab]);
  return `
    <button class="subtle-button ${active ? "is-active" : ""}" type="button" data-action="toggle-academic-edit-mode" data-tab="${tab}">
      <i data-lucide="${active ? "check" : "pencil"}"></i>${active ? "SELESAI" : "EDIT"}
    </button>
  `;
}

function academicActionCell(tab, buttonsHtml) {
  return state.academicEditMode?.[tab] ? buttonsHtml : `<span class="muted">Mode baca</span>`;
}

function studentCheckboxes(name, selectedIds = []) {
  return data.users
    .filter((user) => user.role === "student")
    .map(
      (student) => `
      <label class="check-row">
        <input type="checkbox" name="${name}" value="${student.id}" ${selectedIds.includes(student.id) ? "checked" : ""} />
        <span>${escapeHtml(student.name)} - ${escapeHtml(student.identity)} - ${escapeHtml(student.currentSemester || "-")}</span>
      </label>
    `,
    )
    .join("");
}

function lecturerCourseIds(lecturerId) {
  return data.courses.filter((course) => course.instructorIds.includes(lecturerId)).map((course) => course.id);
}

function coursesForStudent(studentId) {
  const student = userById(studentId);
  if (!student) return [];
  const enrolled = new Set(student.enrolledCourseIds || []);
  return data.courses.filter((course) => course.semester === CURRENT_ACTIVE_SEMESTER && (enrolled.has(course.id) || course.studentIds.includes(studentId)));
}

function courseOptionsForStudent(studentId, selectedCourseId = "") {
  const courses = coursesForStudent(studentId);
  const selectedCourse = courseById(selectedCourseId);
  if (selectedCourse && !courses.some((course) => course.id === selectedCourse.id)) courses.push(selectedCourse);
  if (!courses.length) return `<option value="">Belum ada mata kuliah yang diambil</option>`;
  return courses
    .map((course) => `<option value="${course.id}" ${course.id === selectedCourseId ? "selected" : ""}>${escapeHtml(courseFullLabel(course))}</option>`)
    .join("");
}

function renumberGradeEntries(studentId) {
  gradeRowsForStudent(studentId).forEach((row, index) => {
    row.no = index + 1;
  });
}

function renderLetterheadPreview(className = "letterhead-preview") {
  if (!data.settings.letterheadDataUrl) return `<div class="empty-state">Belum ada kop surat.</div>`;
  if (data.settings.letterheadType === "application/pdf") {
    return `<embed class="${className}" src="${data.settings.letterheadDataUrl}" type="application/pdf" aria-label="${escapeHtml(data.settings.letterheadName || "Kop surat PDF")}" />`;
  }
  return `<img class="${className}" src="${data.settings.letterheadDataUrl}" alt="Preview kop surat" />`;
}

function renderPrintLetterhead() {
  if (!data.settings.letterheadDataUrl) return "";
  if (data.settings.letterheadType === "application/pdf") {
    return `<embed class="khs-letterhead print-only" src="${data.settings.letterheadDataUrl}" type="application/pdf" aria-label="${escapeHtml(data.settings.letterheadName || "Kop surat PDF")}" />`;
  }
  return `<img class="khs-letterhead print-only" src="${data.settings.letterheadDataUrl}" alt="Kop surat" />`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function accessibleCourses(user = currentUser()) {
  if (!user) return [];
  if (user.role === "student") return data.courses.filter((course) => course.studentIds.includes(user.id));
  if (user.role === "lecturer") return data.courses.filter((course) => course.instructorIds.includes(user.id));
  return data.courses;
}

function submissionsForAssignment(assignmentId) {
  return data.submissions.filter((submission) => submission.assignmentId === assignmentId);
}

function assignmentStatus(assignment, user = currentUser()) {
  const submission = data.submissions.find((item) => item.assignmentId === assignment.id && item.studentId === user.id);
  if (submission?.grade !== null && submission?.grade !== undefined) return "Dinilai";
  if (submission) return "Sudah dikumpulkan";
  if (new Date(assignment.deadline) < new Date()) return "Terlambat";
  return "Belum dikumpulkan";
}

function statusTag(status) {
  const normalized = String(status).toLowerCase();
  let tone = "blue";
  if (["hadir", "dinilai", "berhasil", "tersinkron", "published", "aktif", "active", "terbuka", "selesai", "sudah isi"].includes(normalized)) tone = "green";
  if (["terlambat", "izin", "scheduled", "butuh validasi", "draft", "sebagian", "wajib"].includes(normalized)) tone = "amber";
  if (["alpha", "nonaktif", "gagal", "terkunci", "belum isi"].includes(normalized)) tone = "red";
  return `<span class="tag ${tone}">${escapeHtml(status)}</span>`;
}

function showLogin() {
  $("#loginScreen").classList.remove("hidden");
  $("#appShell").classList.add("hidden");
  refreshIcons();
}

function showApp() {
  const user = currentUser();
  if (!user) {
    showLogin();
    return;
  }
  $("#loginScreen").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
  $("#roleLabel").textContent = roleNames[user.role];
  $("#activeRoleText").textContent = `${roleNames[user.role]} aktif`;
  $("#userChip").innerHTML = `<span class="avatar">${user.name.slice(0, 2).toUpperCase()}</span><strong>${escapeHtml(user.name)}</strong>`;
  renderNav();
  renderNotifications();
  renderView();
}

function renderNav() {
  const user = currentUser();
  const available = navItems.filter((item) => item.roles.includes(user.role));
  if (!available.some((item) => item.id === state.activeView)) state.activeView = "dashboard";
  $("#sideNav").innerHTML = available
    .map(
      (item) => `
      <button class="nav-link ${state.activeView === item.id ? "active" : ""}" type="button" data-view="${item.id}">
        <i data-lucide="${item.icon}"></i>
        ${item.label}
      </button>
    `,
    )
    .join("");
  refreshIcons();
}

function renderNotifications() {
  const user = currentUser();
  const items = data.notifications.filter((item) => item.userId === user.id && isNotificationSourceActive(item));
  const unread = items.filter((item) => !item.read).length;
  $("#notifCount").textContent = unread;
  $("#notificationTray").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Notifikasi</h3>
        <p class="muted">${unread} belum dibaca</p>
      </div>
      <button class="subtle-button" type="button" data-action="mark-all-read">
        <i data-lucide="check-check"></i>
        Tandai dibaca
      </button>
    </div>
    <div class="item-list">
      ${
        items.length
          ? items
              .map(
                (item) => `
                <article class="item-card">
                  <div class="item-row">
                    <strong>${escapeHtml(item.title)}</strong>
                    ${item.read ? statusTag("Dibaca") : statusTag("Baru")}
                  </div>
                  <p class="muted">${escapeHtml(item.body)}</p>
                </article>
              `,
              )
              .join("")
          : `<div class="empty-state">Tidak ada notifikasi.</div>`
      }
    </div>
  `;
  refreshIcons();
}

function isNotificationSourceActive(item) {
  if (item.entityType === "announcement") return data.announcements.some((announcement) => announcement.id === item.entityId);
  if (item.entityType === "calendar") return data.calendarEvents.some((event) => event.id === item.entityId);
  return false;
}

function renderView() {
  const item = navItems.find((nav) => nav.id === state.activeView);
  $("#pageTitle").textContent = item?.label || "Dashboard";
  const renderers = {
    dashboard: renderDashboard,
    courses: renderCourses,
    materials: renderMaterials,
    assignments: renderAssignments,
    quizzes: renderQuizzes,
    attendance: renderAttendance,
    grades: renderGrades,
    announcements: renderAnnouncements,
    calendar: renderCalendar,
    reports: renderReports,
    users: renderUsers,
    academic: renderAcademic,
    "khs-forms": renderKhsFormsAdmin,
    integrations: renderIntegrations,
    audit: renderAudit,
    "pdf-settings": renderKhsPdfSettings,
  };
  content.innerHTML = renderers[state.activeView]();
  renderNav();
  refreshIcons();
}

function renderMetric(label, value, note) {
  return `
    <article class="metric-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <small class="muted">${note}</small>
    </article>
  `;
}

function renderDashboard() {
  const user = currentUser();
  const unread = data.notifications.filter((item) => item.userId === user.id && !item.read).length;
  const latestAnnouncements = data.announcements.slice(0, 3);
  const upcomingEvents = data.calendarEvents
    .filter((event) => new Date(event.date) >= new Date("2026-07-01"))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 4);

  const roleSummary = {
    student: "Pantau nilai, pengumuman, dan kalender akademik dari satu dashboard.",
    lecturer: "Lihat ringkasan pengumuman dan agenda akademik yang relevan.",
    staff: "Kelola informasi akademik, pengumuman, dan agenda kalender kampus.",
    admin: "Kelola pengumuman, kalender akademik, dan informasi umum sistem LMS.",
  };
  const identityText = user.role === "student" ? `NIM ${user.identity}` : user.role === "lecturer" ? `NIDN/NUPTK ${user.identity}` : user.identity;
  const semesterText = user.role === "student" ? user.currentSemester || CURRENT_ACTIVE_SEMESTER : `Semester ${CURRENT_ACTIVE_SEMESTER}`;

  return `
    <section class="dashboard-hero">
      <div class="hero-copy">
        <p class="eyebrow">${roleNames[user.role]}</p>
        <h2>Selamat datang, ${escapeHtml(user.name)}</h2>
        <p class="muted">${roleSummary[user.role]}</p>
        <div class="item-meta">
          <span class="tag green">${escapeHtml(identityText)}</span>
          <span class="tag blue">${escapeHtml(semesterText)}</span>
          <span class="tag blue">Session aktif</span>
          <span class="tag amber">${unread} notifikasi</span>
        </div>
      </div>
      <div class="hero-image">
        <img src="assets/campus-learning.jpeg" alt="Ilustrasi platform pembelajaran kampus" />
      </div>
    </section>

    <section class="metric-grid">
      ${renderMetric("Pengumuman aktif", data.announcements.length, "Informasi terbaru")}
      ${renderMetric("Agenda akademik", data.calendarEvents.length, "Kalender kampus")}
      ${renderMetric("Notifikasi baru", unread, "Dalam aplikasi")}
    </section>

    <section class="module-grid">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h3>Pengumuman terbaru</h3>
            <p class="muted">Informasi akademik yang diterbitkan untuk pengguna LMS.</p>
          </div>
        </div>
        <div class="item-list">
          ${
            latestAnnouncements.length
              ? latestAnnouncements
                  .map(
                    (item) => `
                    <article class="item-card">
                      <div class="item-row">
                        <strong>${escapeHtml(item.title)}</strong>
                        ${statusTag(item.target)}
                      </div>
                      <p class="muted">${escapeHtml(item.body)}</p>
                    </article>
                  `,
                  )
                  .join("")
              : `<div class="empty-state">Belum ada pengumuman.</div>`
          }
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <div>
            <h3>Agenda akademik</h3>
            <p class="muted">Tanggal penting yang dikelola staf dan admin.</p>
          </div>
        </div>
        <div class="item-list">
          ${
            upcomingEvents.length
              ? upcomingEvents
                  .map(
                    (event) => `
                    <article class="item-card">
                      <div class="item-row">
                        <strong>${escapeHtml(event.title)}</strong>
                        ${statusTag(event.category)}
                      </div>
                      <span class="muted">${formatDate(event.date)} - ${escapeHtml(event.target)}</span>
                    </article>
                  `,
                  )
                  .join("")
              : `<div class="empty-state">Belum ada agenda akademik.</div>`
          }
        </div>
      </div>
    </section>
  `;
}

function renderActivityItems(courseIds) {
  const materials = data.materials.filter((item) => courseIds.includes(item.courseId)).slice(0, 3);
  const announcements = data.announcements.filter((item) => !item.courseId || courseIds.includes(item.courseId)).slice(0, 3);
  const items = [
    ...materials.map((item) => ({ type: "Materi", title: item.title, detail: `${courseById(item.courseId)?.code} - ${item.type}` })),
    ...announcements.map((item) => ({ type: "Pengumuman", title: item.title, detail: item.target })),
  ];
  if (!items.length) return `<div class="empty-state">Belum ada aktivitas.</div>`;
  return items
    .map(
      (item) => `
      <article class="item-card">
        <div class="item-row">
          <strong>${escapeHtml(item.title)}</strong>
          ${statusTag(item.type)}
        </div>
        <span class="muted">${escapeHtml(item.detail)}</span>
      </article>
    `,
    )
    .join("");
}

function courseOptions() {
  return accessibleCourses()
    .map((course) => `<option value="${course.id}">${course.code}-${course.className} ${escapeHtml(course.name)}</option>`)
    .join("");
}

function filterByCourse(items) {
  if (state.courseFilter === "all") return items;
  return items.filter((item) => item.courseId === state.courseFilter);
}

function renderCourseFilter() {
  return `
    <select data-action="course-filter" aria-label="Filter kelas">
      <option value="all" ${state.courseFilter === "all" ? "selected" : ""}>Semua kelas</option>
      ${accessibleCourses()
        .map((course) => `<option value="${course.id}" ${state.courseFilter === course.id ? "selected" : ""}>${course.code}-${course.className}</option>`)
        .join("")}
    </select>
  `;
}

function renderCourses() {
  const user = currentUser();
  const courses = filterByCourse(accessibleCourses());
  const canManage = ["staff", "admin"].includes(user.role);
  return `
    <section class="toolbar">
      <div class="filters">${renderCourseFilter()}</div>
      ${
        canManage
          ? `<button class="primary-button" type="button" data-action="create-course"><i data-lucide="plus"></i>Tambah kelas</button>`
          : ""
      }
    </section>
    <section class="card-grid">
      ${courses
        .map((course) => {
          const lecturers = course.instructorIds.map((id) => userById(id)?.name).filter(Boolean).join(", ");
          return `
            <article class="item-card">
              <div class="item-row">
                <strong>${course.code}-${course.className}</strong>
                ${statusTag(course.status === "active" ? "Aktif" : course.status)}
              </div>
              <h3>${escapeHtml(course.name)}</h3>
              <div class="item-meta">
                <span>${course.credits} SKS</span>
                <span>${escapeHtml(course.program)}</span>
                <span>${escapeHtml(course.schedule)}</span>
              </div>
              <p class="muted">Dosen: ${escapeHtml(lecturers)}</p>
              <div class="progress"><span style="width:${course.progress}%"></span></div>
              <div class="split-row">
                <span class="muted">${course.studentIds.length} mahasiswa</span>
                <span class="tag blue">Absensi ${course.attendanceRate}%</span>
              </div>
            </article>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderMaterials() {
  const user = currentUser();
  const courseIds = accessibleCourses().map((course) => course.id);
  const materials = filterByCourse(data.materials.filter((material) => courseIds.includes(material.courseId)));
  return `
    <section class="module-grid">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h3>Materi pembelajaran</h3>
            <p class="muted">File, tautan, dan jadwal publikasi materi kelas.</p>
          </div>
          <div class="filters">${renderCourseFilter()}</div>
        </div>
        <div class="item-list">
          ${materials
            .map(
              (material) => `
              <article class="item-card">
                <div class="item-row">
                  <strong>${escapeHtml(material.title)}</strong>
                  ${statusTag(material.visibility === "published" ? "Published" : "Scheduled")}
                </div>
                <p class="muted">${escapeHtml(material.description)}</p>
                <div class="item-meta">
                  <span>${courseById(material.courseId)?.code}</span>
                  <span>${material.type}</span>
                  <span>${material.size}</span>
                  <span>${formatDate(material.publishedAt)}</span>
                </div>
                ${
                  user.role === "student"
                    ? `<button class="subtle-button" type="button" data-action="access-material" data-id="${material.id}">
                        <i data-lucide="download"></i>Akses materi
                      </button>`
                    : ""
                }
              </article>
            `,
            )
            .join("")}
        </div>
      </div>
      ${
        user.role === "lecturer"
          ? `
          <form class="panel" data-form="material">
            <div class="panel-header">
              <div>
                <h3>Unggah materi</h3>
                <p class="muted">Validasi metadata dan publikasi materi.</p>
              </div>
            </div>
            <label>Kelas<select name="courseId" required>${courseOptions()}</select></label>
            <label>Judul<input name="title" placeholder="Pertemuan 8 - ..." required /></label>
            <label>Jenis<select name="type"><option>PDF</option><option>PPTX</option><option>DOCX</option><option>Link</option><option>Video</option></select></label>
            <label>Deskripsi<textarea name="description" required></textarea></label>
            <button class="primary-button" type="submit"><i data-lucide="upload"></i>Publikasikan</button>
          </form>
        `
          : renderSidePanel("Akses materi", "Mahasiswa hanya melihat materi yang sudah dipublikasikan dan aktivitas akses dicatat oleh sistem.")
      }
    </section>
  `;
}

function renderAssignments() {
  const user = currentUser();
  const courseIds = accessibleCourses().map((course) => course.id);
  const assignments = filterByCourse(data.assignments.filter((assignment) => courseIds.includes(assignment.courseId)));
  return `
    <section class="module-grid">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h3>Tugas kelas</h3>
            <p class="muted">Deadline, status pengumpulan, nilai, dan feedback.</p>
          </div>
          <div class="filters">${renderCourseFilter()}</div>
        </div>
        <div class="item-list">
          ${assignments
            .map((assignment) => {
              const submissions = submissionsForAssignment(assignment.id);
              const ownSubmission = submissions.find((item) => item.studentId === user.id);
              return `
                <article class="item-card">
                  <div class="item-row">
                    <strong>${escapeHtml(assignment.title)}</strong>
                    ${user.role === "student" ? statusTag(assignmentStatus(assignment, user)) : statusTag(`${submissions.length} terkumpul`)}
                  </div>
                  <p class="muted">${escapeHtml(assignment.description)}</p>
                  <div class="item-meta">
                    <span>${courseById(assignment.courseId)?.code}</span>
                    <span>Deadline ${formatDateTime(assignment.deadline)}</span>
                    <span>${assignment.collectionType}</span>
                    <span>Bobot ${assignment.weight}%</span>
                  </div>
                  ${
                    user.role === "student"
                      ? `
                      <div class="split-row">
                        <span class="muted">${ownSubmission ? `Jawaban: ${escapeHtml(ownSubmission.answer)}` : `Maksimal file ${assignment.maxSize}`}</span>
                        ${
                          !ownSubmission
                            ? `<button class="primary-button" type="button" data-action="submit-assignment" data-id="${assignment.id}">
                                <i data-lucide="send"></i>Kumpulkan
                              </button>`
                            : `<span class="tag green">Nilai ${ownSubmission.grade ?? "menunggu"}</span>`
                        }
                      </div>`
                      : renderSubmissionTable(assignment, submissions)
                  }
                </article>
              `;
            })
            .join("")}
        </div>
      </div>
      ${
        user.role === "lecturer"
          ? `
          <form class="panel" data-form="assignment">
            <div class="panel-header">
              <div>
                <h3>Buat tugas</h3>
                <p class="muted">Notifikasi dikirim ke mahasiswa kelas.</p>
              </div>
            </div>
            <label>Kelas<select name="courseId" required>${courseOptions()}</select></label>
            <label>Judul<input name="title" required placeholder="Judul tugas" /></label>
            <label>Deadline<input name="deadline" type="datetime-local" required /></label>
            <label>Bobot nilai<input name="weight" type="number" min="1" max="100" value="10" required /></label>
            <label>Instruksi<textarea name="description" required></textarea></label>
            <button class="primary-button" type="submit"><i data-lucide="plus"></i>Publikasikan tugas</button>
          </form>
        `
          : renderSidePanel("Validasi pengumpulan", "Status otomatis membedakan belum dikumpulkan, terlambat, sudah dikumpulkan, dan dinilai.")
      }
    </section>
  `;
}

function renderSubmissionTable(assignment, submissions) {
  if (!submissions.length) return `<div class="empty-state">Belum ada pengumpulan.</div>`;
  return `
    <table class="data-table">
      <thead><tr><th>Mahasiswa</th><th>Waktu</th><th>Nilai</th><th>Aksi</th></tr></thead>
      <tbody>
        ${submissions
          .map(
            (submission) => `
            <tr>
              <td>${escapeHtml(userById(submission.studentId)?.name || "-")}</td>
              <td>${formatDateTime(submission.submittedAt)}</td>
              <td>${submission.grade ?? "Menunggu"}</td>
              <td>
                <button class="subtle-button" type="button" data-action="grade-submission" data-id="${submission.id}">
                  <i data-lucide="pencil"></i>Nilai
                </button>
              </td>
            </tr>
          `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderQuizzes() {
  const user = currentUser();
  const courseIds = accessibleCourses().map((course) => course.id);
  const quizzes = filterByCourse(data.quizzes.filter((quiz) => courseIds.includes(quiz.courseId)));
  return `
    <section class="module-grid">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h3>Kuis dan ujian online</h3>
            <p class="muted">Durasi, jadwal, randomisasi soal, dan hasil objektif.</p>
          </div>
          <div class="filters">${renderCourseFilter()}</div>
        </div>
        <div class="item-list">
          ${quizzes
            .map((quiz) => {
              const attempt = quiz.attempts.find((item) => item.studentId === user.id);
              return `
                <article class="item-card">
                  <div class="item-row">
                    <strong>${escapeHtml(quiz.title)}</strong>
                    ${statusTag(quiz.status === "published" ? "Published" : "Draft")}
                  </div>
                  <div class="item-meta">
                    <span>${courseById(quiz.courseId)?.code}</span>
                    <span>${quiz.duration} menit</span>
                    <span>${quiz.questionCount} soal</span>
                    <span>Mulai ${formatDateTime(quiz.startsAt)}</span>
                  </div>
                  <div class="split-row">
                    <span class="muted">Acak soal: ${quiz.randomizeQuestions ? "Ya" : "Tidak"}</span>
                    ${
                      user.role === "student"
                        ? attempt
                          ? `<span class="tag green">Skor ${attempt.score}</span>`
                          : `<button class="primary-button" type="button" data-action="start-quiz" data-id="${quiz.id}"><i data-lucide="play"></i>Mulai kuis</button>`
                        : `<span class="tag blue">${quiz.attempts.length} attempt</span>`
                    }
                  </div>
                </article>
              `;
            })
            .join("")}
        </div>
      </div>
      ${
        user.role === "lecturer"
          ? `
          <form class="panel" data-form="quiz">
            <div class="panel-header">
              <div>
                <h3>Buat kuis dasar</h3>
                <p class="muted">Bank soal detail dapat dikembangkan pada fase berikutnya.</p>
              </div>
            </div>
            <label>Kelas<select name="courseId" required>${courseOptions()}</select></label>
            <label>Judul<input name="title" required /></label>
            <label>Durasi menit<input name="duration" type="number" min="5" value="30" required /></label>
            <label>Jumlah soal<input name="questionCount" type="number" min="1" value="10" required /></label>
            <button class="primary-button" type="submit"><i data-lucide="plus"></i>Simpan kuis</button>
          </form>
        `
          : renderSidePanel("Autosave kuis", "Saat mahasiswa memulai kuis, sistem membuat attempt dan menghitung skor objektif.")
      }
    </section>
  `;
}

function renderAttendance() {
  const user = currentUser();
  const courseIds = accessibleCourses().map((course) => course.id);
  const sessions = filterByCourse(data.attendanceSessions.filter((session) => courseIds.includes(session.courseId)));
  return `
    <section class="module-grid">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h3>Absensi online</h3>
            <p class="muted">Sesi absensi, status hadir, izin, sakit, dan alpha.</p>
          </div>
          <div class="filters">${renderCourseFilter()}</div>
        </div>
        <div class="item-list">
          ${sessions
            .map((session) => {
              const course = courseById(session.courseId);
              const own = session.records.find((record) => record.studentId === user.id);
              return `
                <article class="item-card">
                  <div class="item-row">
                    <strong>${course?.code}-${course?.className} Pertemuan ${session.meeting}</strong>
                    ${statusTag(formatDate(session.date))}
                  </div>
                  <div class="item-meta">
                    <span>Buka ${session.opensAt}-${session.closesAt}</span>
                    <span>Mandiri: ${session.selfCheckin ? "Aktif" : "Nonaktif"}</span>
                    <span>${session.records.length}/${course?.studentIds.length || 0} tercatat</span>
                  </div>
                  ${
                    user.role === "student"
                      ? own
                        ? `<span class="tag green">${own.status}</span>`
                        : `<button class="primary-button" type="button" data-action="checkin" data-id="${session.id}"><i data-lucide="check"></i>Absen hadir</button>`
                      : renderAttendanceRecords(session)
                  }
                </article>
              `;
            })
            .join("")}
        </div>
      </div>
      ${
        user.role === "lecturer"
          ? `
          <form class="panel" data-form="attendance">
            <div class="panel-header">
              <div>
                <h3>Buka sesi absensi</h3>
                <p class="muted">Mahasiswa dapat check-in selama sesi aktif.</p>
              </div>
            </div>
            <label>Kelas<select name="courseId" required>${courseOptions()}</select></label>
            <label>Pertemuan<input name="meeting" type="number" min="1" value="8" required /></label>
            <label>Tanggal<input name="date" type="date" required /></label>
            <button class="primary-button" type="submit"><i data-lucide="calendar-plus"></i>Buka absensi</button>
          </form>
        `
          : renderSidePanel("Rekap otomatis", "Persentase kehadiran dihitung dan ditampilkan di dashboard kelas.")
      }
    </section>
  `;
}

function renderAttendanceRecords(session) {
  const course = courseById(session.courseId);
  return `
    <table class="data-table">
      <thead><tr><th>Mahasiswa</th><th>Status</th><th>Catatan</th></tr></thead>
      <tbody>
        ${course.studentIds
          .map((studentId) => {
            const record = session.records.find((item) => item.studentId === studentId);
            return `
              <tr>
                <td>${escapeHtml(userById(studentId)?.name || "-")}</td>
                <td>${statusTag(record?.status || "Alpha")}</td>
                <td>${escapeHtml(record?.note || "-")}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

const studentKhsRows = [
  { code: "IF61133", name: "IMPLEMENTASI PERANGKAT LUNAK", credits: 2, score: 85.0, letter: "A", weight: 8.0 },
  { code: "IF61134", name: "MANAJEMEN PROYEK", credits: 2, score: 80.5, letter: "AB", weight: 7.0 },
  { code: "IF61131", name: "METODE DAN ANALISIS NUMERIK", credits: 2, score: 34.43, letter: "E", weight: 0.0 },
  { code: "IF61135", name: "SISTEM MULTIMEDIA", credits: 2, score: 62.59, letter: "BC", weight: 5.0 },
  { code: "IF611732", name: "DATA WAREHOUSE DAN DATA MINING", credits: 2, score: 90.2, letter: "A", weight: 8.0 },
  { code: "IF612133", name: "ANALISIS KEBUTUHAN PERANGKAT LUNAK (DSE)", credits: 2, score: 82.85, letter: "A", weight: 8.0 },
  { code: "IF612134", name: "PEMODELAN PERANGKAT LUNAK (DSE)", credits: 2, score: 81.45, letter: "A", weight: 8.0 },
  { code: "IF613133", name: "PRAKTIKUM. IMPLEMENTASI PERANGKAT LUNAK", credits: 1, score: 76.0, letter: "AB", weight: 3.5 },
  { code: "IF613134", name: "PRAKTIKUM. MANAJEMEN PROYEK", credits: 1, score: 77.5, letter: "B", weight: 3.0 },
  { code: "IF613635", name: "PRAKTIKUM. SISTEM MULTIMEDIA", credits: 1, score: 68.65, letter: "BC", weight: 2.5 },
  { code: "WN611036", name: "BAHASA INDONESIA", credits: 2, score: 73.8, letter: "B", weight: 6.0 },
];

function formatKhsDecimal(value, useComma = false) {
  const formatted = Number(value).toFixed(2);
  return useComma ? formatted.replace(".", ",") : formatted;
}

function calculateKhs(courseList) {
  const rows = courseList.map((item, index) => {
    const credits = Number(item.sks ?? item.credits ?? 0);
    const nilaiHuruf = String(item.nilai_huruf ?? item.letter ?? "").toUpperCase();
    const grade = gradeWeightValue(item.bobot_angka ?? item.grade, nilaiHuruf);
    const weighted = roundTwo(credits * grade);
    return {
      no: Number(item.no || index + 1),
      kode: item.kode ?? item.code ?? "",
      mata_kuliah: item.mata_kuliah ?? item.subject ?? "",
      sks: credits,
      nilai_huruf: nilaiHuruf || gradeLetterFromWeight(grade),
      bobot_angka: grade,
      sks_x_nilai: weighted,
    };
  });
  const total_sks = rows.reduce((total, row) => total + row.sks, 0);
  const total_sks_x_nilai = roundTwo(rows.reduce((total, row) => total + row.sks_x_nilai, 0));
  const ips = total_sks ? roundTwo(total_sks_x_nilai / total_sks) : 0;
  return { rows, total_sks, total_sks_x_nilai, ips };
}

function gradeRowsForStudent(studentId) {
  return data.gradeEntries
    .filter((row) => row.studentId === studentId)
    .sort((a, b) => Number(a.no) - Number(b.no));
}

function khsRowsForStudent(studentId) {
  const courseCodes = new Set(coursesForStudent(studentId).map((course) => course.code));
  return gradeRowsForStudent(studentId).filter((row) => !courseCodes.size || courseCodes.has(row.code));
}

function studentGradeOptions(selected = "", cohort = "all", emptyLabel = "Tidak ada mahasiswa pada angkatan ini") {
  if (!cohort) return `<option value="">Mahasiswa</option>`;
  const students = studentsForCohort(cohort);
  if (!students.length) return `<option value="">${escapeHtml(emptyLabel)}</option>`;
  return students
    .map(
      (student) =>
        `<option value="${student.id}" ${selected === student.id ? "selected" : ""}>${escapeHtml(student.name)} - ${escapeHtml(student.identity)} - Angkatan ${escapeHtml(studentCohort(student))}</option>`,
    )
    .join("");
}

function activeRequiredKhsForms() {
  return data.khsForms.filter((form) => form.active !== false && form.requiredForPrint !== false && form.semester === CURRENT_ACTIVE_SEMESTER);
}

function khsSubmissionFor(formId, studentId) {
  return data.khsFormSubmissions.find((submission) => submission.formId === formId && submission.studentId === studentId && submission.semester === CURRENT_ACTIVE_SEMESTER);
}

function khsPrintStatus(studentId) {
  const requiredForms = activeRequiredKhsForms();
  const completedFormIds = requiredForms.filter((form) => khsSubmissionFor(form.id, studentId)).map((form) => form.id);
  return {
    requiredForms,
    completedFormIds,
    missingForms: requiredForms.filter((form) => !completedFormIds.includes(form.id)),
    unlocked: requiredForms.length === 0 || completedFormIds.length === requiredForms.length,
  };
}

function formatAnswerValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "-");
}

function renderKhsQuestionField(question, answer = "") {
  const name = `answer_${question.id}`;
  const required = question.required ? "required" : "";
  const value = Array.isArray(answer) ? answer : String(answer ?? "");
  if (question.type === "textarea") {
    return `<label>${escapeHtml(question.label)}<textarea name="${name}" ${required}>${escapeHtml(value)}</textarea></label>`;
  }
  if (question.type === "select") {
    return `<label>${escapeHtml(question.label)}<select name="${name}" ${required}>
      <option value="">Pilih jawaban</option>
      ${(question.options || []).map((option) => `<option value="${escapeHtml(option)}" ${value === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
    </select></label>`;
  }
  if (question.type === "radio") {
    return `
      <div class="field-group">
        <strong>${escapeHtml(question.label)}</strong>
        <div class="choice-list">
          ${(question.options || [])
            .map(
              (option) => `
              <label class="check-row">
                <input type="radio" name="${name}" value="${escapeHtml(option)}" ${value === option ? "checked" : ""} ${required} />
                <span>${escapeHtml(option)}</span>
              </label>
            `,
            )
            .join("")}
        </div>
      </div>
    `;
  }
  if (question.type === "checkbox") {
    const selected = new Set(Array.isArray(answer) ? answer : value ? [value] : []);
    return `
      <div class="field-group">
        <strong>${escapeHtml(question.label)}</strong>
        <div class="choice-list">
          ${(question.options || ["Ya"])
            .map(
              (option) => `
              <label class="check-row">
                <input type="checkbox" name="${name}" value="${escapeHtml(option)}" ${selected.has(option) ? "checked" : ""} />
                <span>${escapeHtml(option)}</span>
              </label>
            `,
            )
            .join("")}
        </div>
      </div>
    `;
  }
  const type = question.type === "date" ? "date" : "text";
  return `<label>${escapeHtml(question.label)}<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${required} /></label>`;
}

function renderKhsTable(rows) {
  const result = calculateKhs(
    rows.map((row) => ({
      no: row.no,
      kode: row.code,
      mata_kuliah: row.subject,
      sks: row.credits,
      nilai_huruf: row.letter,
      bobot_angka: row.grade,
    })),
  );
  return `
    <div class="khs-table-wrap">
      <table class="khs-table">
        <thead>
          <tr>
            <th>No.</th>
            <th>Kode</th>
            <th>Mata Kuliah</th>
            <th>SKS</th>
            <th>Nilai</th>
            <th>SKS X Nilai</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map((row, index) => ({ source: row, calculated: result.rows[index] }))
                  .map(
                    ({ source, calculated }) => `
                    <tr>
                      <td>${calculated.no}</td>
                      <td>${escapeHtml(source.code)}</td>
                      <td class="subject-cell">${escapeHtml(source.subject)}</td>
                      <td>${calculated.sks}</td>
                      <td>${escapeHtml(calculated.nilai_huruf)}</td>
                      <td>${formatKhsDecimal(calculated.sks_x_nilai)}</td>
                    </tr>
                  `,
                  )
                  .join("")
              : `<tr><td colspan="6">Belum ada data nilai.</td></tr>`
          }
          <tr class="khs-total-row">
            <td colspan="3">Total</td>
            <td>${result.total_sks}</td>
            <td></td>
            <td>${formatKhsDecimal(result.total_sks_x_nilai, true)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="khs-table-wrap">
      <table class="khs-table khs-summary-table">
        <thead>
          <tr>
            <th>Prestasi Studi</th>
            <th>SKS</th>
            <th>Bobot</th>
            <th>IPS</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Nilai Akhir</td>
            <td>${result.total_sks}</td>
            <td>${formatKhsDecimal(result.total_sks_x_nilai)}</td>
            <td>${formatKhsDecimal(result.ips)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderStudentKhsFormGate(user) {
  const status = khsPrintStatus(user.id);
  if (!status.requiredForms.length) {
    return `<section class="panel"><div class="empty-state">Belum ada form syarat cetak KHS aktif.</div></section>`;
  }
  if (status.unlocked) {
    return `
      <section class="panel">
        <div class="item-row">
          <div>
            <h3>Syarat cetak KHS lengkap</h3>
            <p class="muted">Semua form wajib semester ${escapeHtml(CURRENT_ACTIVE_SEMESTER)} sudah diisi.</p>
          </div>
          ${statusTag("Terbuka")}
        </div>
      </section>
    `;
  }
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h3>Lengkapi syarat cetak KHS</h3>
          <p class="muted">Isi ${status.missingForms.length} form yang masih kurang agar tombol cetak KHS terbuka.</p>
        </div>
        ${statusTag("Terkunci")}
      </div>
      <div class="item-list">
        ${status.requiredForms
          .map((form) => {
            const submission = khsSubmissionFor(form.id, user.id);
            return `
              <article class="item-card">
                <div class="item-row">
                  <div>
                    <strong>${escapeHtml(form.title)}</strong>
                    <p class="muted">${escapeHtml(form.description || "")}</p>
                  </div>
                  ${submission ? statusTag("Selesai") : statusTag("Wajib")}
                </div>
                ${
                  submission
                    ? `<p class="muted">Dikirim ${formatDateTime(submission.submittedAt || submission.updatedAt || new Date().toISOString())}</p>`
                    : `
                    <form class="khs-required-form" data-form="khs-form-submission" data-form-id="${form.id}">
                      <input name="formId" type="hidden" value="${form.id}" />
                      ${form.questions.map((question) => renderKhsQuestionField(question)).join("")}
                      <button class="primary-button" type="submit"><i data-lucide="send"></i>Kirim form</button>
                    </form>
                  `
                }
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderGrades() {
  const user = currentUser();
  const courses = accessibleCourses();
  if (user.role === "student") {
    const rows = khsRowsForStudent(user.id);
    const printStatus = khsPrintStatus(user.id);
    if (!printStatus.unlocked) return renderStudentKhsFormGate(user);
    return `
      ${renderStudentKhsFormGate(user)}
      <section class="khs-panel">
        <div class="khs-print-identity print-only">
          <strong>Nama: ${escapeHtml(user.name)}</strong>
          <span>NIM: ${escapeHtml(user.identity)}</span>
          <span>Prodi: ${escapeHtml(user.program || "Teologi S1")}</span>
        </div>
        <div class="khs-meta-row">
          <div class="khs-badges" aria-label="Informasi semester">
            <span class="khs-badge green">${escapeHtml(CURRENT_ACTIVE_SEMESTER)}</span>
            <span class="khs-badge blue">${escapeHtml(user.program || "Teologi S1")}</span>
          </div>
          <button class="print-khs-button" type="button" data-action="print-khs" ${printStatus.unlocked ? "" : "disabled"}>
            <i data-lucide="printer"></i>
            ${printStatus.unlocked ? "Cetak KHS" : "Cetak KHS terkunci"}
          </button>
        </div>
        ${renderKhsTable(rows)}
      </section>
    `;
  }

  if (["staff", "admin"].includes(user.role)) {
    const gradeCohort = state.gradeCohortFilter || "";
    const gradeStudents = gradeCohort ? studentsForCohort(gradeCohort) : [];
    const selectedStudentId = gradeStudents.some((student) => student.id === state.gradeStudentId) ? state.gradeStudentId : "";
    if (state.gradeStudentId !== selectedStudentId) state.gradeStudentId = selectedStudentId;
    const selectedStudent = userById(selectedStudentId);
    const rows = khsRowsForStudent(selectedStudentId)
      .map((row) => ({ ...row, student: userById(row.studentId) }))
      .sort((a, b) => (a.student?.name || "").localeCompare(b.student?.name || "") || Number(a.no) - Number(b.no));
    const editingGrade = state.editGradeEntryId ? data.gradeEntries.find((row) => row.id === state.editGradeEntryId) : null;
    const formStudentId = editingGrade?.studentId || selectedStudentId;
    const formCourse = editingGrade ? data.courses.find((course) => course.code === editingGrade.code) : null;
    const studentCourses = coursesForStudent(formStudentId);
    const formCourseId = formCourse?.id || studentCourses[0]?.id || "";
    const formGrade = Number(editingGrade?.grade ?? gradeWeightFromLetter(editingGrade?.letter || "A"));
    const formLetter = editingGrade?.letter || gradeLetterFromWeight(formGrade);
    const selectedKhs = calculateKhs(
      rows.map((row) => ({
        no: row.no,
        kode: row.code,
        mata_kuliah: row.subject,
        sks: row.credits,
        nilai_huruf: row.letter,
        bobot_angka: row.grade,
      })),
    );
    return `
      <section class="module-grid">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h3>KHS ${escapeHtml(selectedStudent?.name || "Mahasiswa")}</h3>
              <p class="muted">${gradeCohort ? "Nilai yang ditampilkan hanya milik mahasiswa yang dipilih." : "Silakan pilih angkatan terlebih dahulu untuk menampilkan data KHS."}</p>
            </div>
            <button class="subtle-button ${state.khsEditMode ? "is-active" : ""}" type="button" data-action="toggle-khs-edit-mode">
              <i data-lucide="${state.khsEditMode ? "check" : "pencil"}"></i>${state.khsEditMode ? "SELESAI" : "EDIT"}
            </button>
          </div>
          <div class="toolbar compact-toolbar">
            <div class="filters">
              <label>Angkatan<select name="gradeCohort" data-action="grade-cohort-filter">
                ${khsCohortOptions(gradeCohort)}
              </select></label>
              <label>Mahasiswa<select name="gradeStudentId" data-action="grade-view-student-filter">
                ${studentGradeOptions(selectedStudentId, gradeCohort)}
              </select></label>
            </div>
          </div>
          <table class="data-table">
            <thead><tr><th>Mahasiswa</th><th>No</th><th>Kode</th><th>Mata Kuliah</th><th>SKS</th><th>Nilai</th><th>SKS X Nilai</th><th>Aksi</th></tr></thead>
            <tbody>
              ${
                rows.length
                  ? rows
                      .map(
                        (row) => `
                        <tr>
                          <td>${escapeHtml(row.student?.name || "-")}<br /><span class="muted">${escapeHtml(row.student?.identity || "-")}</span></td>
                          <td>${Number(row.no)}</td>
                          <td>${escapeHtml(row.code)}</td>
                          <td>${escapeHtml(row.subject)}</td>
                          <td>${Number(row.credits)}</td>
                          <td>${escapeHtml(row.letter || "")}</td>
                          <td>${formatKhsDecimal(roundTwo(Number(row.credits || 0) * gradeWeightValue(row.grade, row.letter)))}</td>
                          <td>
                            ${
                              state.khsEditMode
                                ? `
                                  <button class="subtle-button" type="button" data-action="edit-grade-entry" data-id="${row.id}">
                                    <i data-lucide="pencil"></i>Edit
                                  </button>
                                  <button class="danger-button" type="button" data-action="delete-grade-entry" data-id="${row.id}">
                                    <i data-lucide="trash-2"></i>Hapus
                                  </button>
                                `
                                : `<span class="muted">Mode baca</span>`
                            }
                          </td>
                        </tr>
                      `,
                      )
                      .join("")
                  : `<tr><td colspan="8">${gradeCohort ? `Belum ada data nilai untuk ${escapeHtml(selectedStudent?.name || "mahasiswa ini")}.` : "Silakan pilih angkatan untuk menampilkan data KHS."}</td></tr>`
              }
            </tbody>
          </table>
          <div class="khs-table-wrap staff-khs-summary">
            <table class="khs-table khs-summary-table">
              <thead><tr><th>Prestasi Studi</th><th>SKS</th><th>Bobot</th><th>IPS</th></tr></thead>
              <tbody>
                <tr>
                  <td>Nilai Akhir</td>
                  <td>${selectedKhs.total_sks}</td>
                  <td>${formatKhsDecimal(selectedKhs.total_sks_x_nilai)}</td>
                  <td>${formatKhsDecimal(selectedKhs.ips)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="panel-stack">
          <form class="panel" data-form="grade-entry">
            <div class="panel-header">
              <div>
                <h3>${editingGrade ? "Edit nilai" : "Tambah nilai"}</h3>
                <p class="muted">Bobot otomatis dihitung dari SKS x Nilai.</p>
              </div>
            </div>
            <label>Mahasiswa<select name="studentId" data-action="grade-entry-student-filter" required ${editingGrade ? "disabled" : ""}>${studentGradeOptions(formStudentId, gradeCohort)}</select></label>
            ${editingGrade ? `<input name="studentId" type="hidden" value="${escapeHtml(formStudentId)}" />` : ""}
            <label>Mata kuliah<select name="courseId" required>
              ${courseOptionsForStudent(formStudentId, formCourseId)}
            </select></label>
            <label>Bobot angka<input name="grade" type="number" min="0" max="4" step="0.01" value="${Number.isFinite(formGrade) ? formGrade : 4}" required /></label>
            <label>Nilai huruf<select name="letter" required>${gradeLetterOptions(formLetter)}</select></label>
            <div class="form-actions">
              <button class="primary-button" type="submit" ${studentCourses.length || editingGrade ? "" : "disabled"}><i data-lucide="save"></i>${editingGrade ? "Simpan perubahan" : "Simpan nilai"}</button>
              ${editingGrade ? `<button class="subtle-button" type="button" data-action="cancel-edit-grade-entry"><i data-lucide="x"></i>Batal</button>` : ""}
            </div>
          </form>
        </div>
      </section>
    `;
  }

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h3>Gradebook kelas</h3>
          <p class="muted">Ringkasan komponen nilai, bobot, dan histori input.</p>
        </div>
        <button class="subtle-button" type="button" data-action="export-report"><i data-lucide="download"></i>Export CSV</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Kelas</th><th>Tugas</th><th>Bobot</th><th>Terkumpul</th><th>Rata-rata</th></tr></thead>
        <tbody>
          ${data.assignments
            .filter((assignment) => courses.some((course) => course.id === assignment.courseId))
            .map((assignment) => {
              const submissions = submissionsForAssignment(assignment.id);
              const graded = submissions.filter((item) => typeof item.grade === "number");
              const avg = graded.length ? Math.round(graded.reduce((total, item) => total + item.grade, 0) / graded.length) : "-";
              return `
                <tr>
                  <td>${courseById(assignment.courseId)?.code}</td>
                  <td>${escapeHtml(assignment.title)}</td>
                  <td>${assignment.weight}%</td>
                  <td>${submissions.length}</td>
                  <td>${avg}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderAnnouncements() {
  const user = currentUser();
  const courseIds = accessibleCourses().map((course) => course.id);
  const announcements = data.announcements.filter((item) => !item.courseId || courseIds.includes(item.courseId) || ["staff", "admin"].includes(user.role));
  const canManage = ["staff", "admin"].includes(user.role);
  const editing = state.editAnnouncementId ? data.announcements.find((item) => item.id === state.editAnnouncementId) : null;
  const targetOptions = [
    `<option value="" ${!editing?.courseId ? "selected" : ""}>Seluruh pengguna</option>`,
    ...accessibleCourses().map(
      (course) => `<option value="${course.id}" ${editing?.courseId === course.id ? "selected" : ""}>${course.code}-${course.className} ${escapeHtml(course.name)}</option>`,
    ),
  ].join("");
  return `
    <section class="module-grid">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h3>Pengumuman</h3>
            <p class="muted">Target pengumuman dapat berupa kelas, program studi, fakultas, atau seluruh universitas.</p>
          </div>
        </div>
        <div class="item-list">
          ${announcements
            .map(
              (item) => `
              <article class="item-card">
                <div class="item-row">
                  <strong>${escapeHtml(item.title)}</strong>
                  ${statusTag(item.target)}
                </div>
                  <p>${escapeHtml(item.body)}</p>
                  <div class="item-meta">
                    <span>${formatDate(item.publishedAt)}</span>
                    <span>Oleh ${escapeHtml(userById(item.createdBy)?.name || "Sistem")}</span>
                  </div>
                  ${
                    canManage
                      ? `
                      <div class="split-row">
                        <button class="subtle-button" type="button" data-action="edit-announcement" data-id="${item.id}">
                          <i data-lucide="pencil"></i>Edit
                        </button>
                        <button class="danger-button" type="button" data-action="delete-announcement" data-id="${item.id}">
                          <i data-lucide="trash-2"></i>Hapus
                        </button>
                      </div>
                    `
                      : ""
                  }
                </article>
            `,
            )
            .join("")}
        </div>
      </div>
      ${
        canManage
          ? `
          <form class="panel" data-form="announcement">
            <div class="panel-header">
              <div>
                <h3>${editing ? "Edit pengumuman" : "Buat pengumuman"}</h3>
                <p class="muted">${editing ? "Simpan perubahan pengumuman yang sudah diterbitkan." : "Pengumuman baru mengirim notifikasi dalam aplikasi."}</p>
              </div>
              ${editing ? `<button class="subtle-button" type="button" data-action="cancel-edit-announcement"><i data-lucide="x"></i>Batal</button>` : ""}
            </div>
            <label>Target<select name="courseId">${targetOptions}</select></label>
            <label>Judul<input name="title" value="${escapeHtml(editing?.title || "")}" required /></label>
            <label>Isi<textarea name="body" required>${escapeHtml(editing?.body || "")}</textarea></label>
            <button class="primary-button" type="submit"><i data-lucide="${editing ? "save" : "send"}"></i>${editing ? "Simpan perubahan" : "Publikasikan"}</button>
          </form>
        `
          : renderSidePanel("Notifikasi", "Pengumuman yang relevan muncul di dashboard dan daftar notifikasi pengguna.")
      }
    </section>
  `;
}

function renderCalendar() {
  const user = currentUser();
  const canManage = ["staff", "admin"].includes(user.role);
  const editing = state.editCalendarEventId ? data.calendarEvents.find((item) => item.id === state.editCalendarEventId) : null;
  const events = data.calendarEvents
    .map((event) => ({ ...event, day: new Date(event.date).getDate() }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  return `
    <section class="module-grid">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h3>Kalender akademik Juli 2026</h3>
            <p class="muted">Agenda akademik resmi yang dikelola staf akademik dan administrator.</p>
          </div>
        </div>
        <div class="calendar-grid">
          ${Array.from({ length: 31 }, (_, index) => {
            const day = index + 1;
            const dayEvents = events.filter((event) => event.day === day);
            return `
              <div class="calendar-day">
                <strong>${day}</strong>
                ${dayEvents.map((event) => `<span class="mini-event">${escapeHtml(event.title)}</span>`).join("")}
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <h3>Daftar agenda</h3>
            <p class="muted">Tanggal penting akademik dan target penerimanya.</p>
          </div>
        </div>
        <div class="item-list">
          ${
            events.length
              ? events
                  .map(
                    (event) => `
                    <article class="item-card">
                      <div class="item-row">
                        <strong>${escapeHtml(event.title)}</strong>
                        ${statusTag(event.category)}
                      </div>
                      <p class="muted">${escapeHtml(event.description || "-")}</p>
                      <div class="item-meta">
                        <span>${formatDate(event.date)}</span>
                        <span>${escapeHtml(event.target)}</span>
                        <span>Oleh ${escapeHtml(userById(event.createdBy)?.name || "Sistem")}</span>
                      </div>
                      ${
                        canManage
                          ? `
                          <div class="split-row">
                            <button class="subtle-button" type="button" data-action="edit-calendar-event" data-id="${event.id}">
                              <i data-lucide="pencil"></i>Edit
                            </button>
                            <button class="danger-button" type="button" data-action="delete-calendar-event" data-id="${event.id}">
                              <i data-lucide="trash-2"></i>Hapus
                            </button>
                          </div>
                        `
                          : ""
                      }
                    </article>
                  `,
                  )
                  .join("")
              : `<div class="empty-state">Belum ada agenda akademik.</div>`
          }
        </div>
      </div>

      ${
        canManage
          ? `
          <form class="panel" data-form="calendar-event">
            <div class="panel-header">
              <div>
                <h3>${editing ? "Edit agenda" : "Tambah agenda"}</h3>
                <p class="muted">${editing ? "Perbarui data kalender akademik." : "Tambahkan tanggal penting ke kalender akademik."}</p>
              </div>
              ${editing ? `<button class="subtle-button" type="button" data-action="cancel-edit-calendar-event"><i data-lucide="x"></i>Batal</button>` : ""}
            </div>
            <label>Tanggal<input name="date" type="date" value="${escapeHtml(editing?.date || "")}" required /></label>
            <label>Judul<input name="title" value="${escapeHtml(editing?.title || "")}" required /></label>
            <label>Kategori<select name="category">
              ${["Akademik", "Registrasi", "Ujian", "Libur", "Administrasi"]
                .map((category) => `<option ${editing?.category === category ? "selected" : ""}>${category}</option>`)
                .join("")}
            </select></label>
            <label>Target<input name="target" value="${escapeHtml(editing?.target || "Seluruh pengguna")}" required /></label>
            <label>Deskripsi<textarea name="description" required>${escapeHtml(editing?.description || "")}</textarea></label>
            <button class="primary-button" type="submit"><i data-lucide="${editing ? "save" : "calendar-plus"}"></i>${editing ? "Simpan perubahan" : "Tambah agenda"}</button>
          </form>
        `
          : ""
      }
    </section>
  `;
}

function renderReports() {
  const courses = accessibleCourses();
  const activeUsers = data.users.filter((user) => user.status === "active").length;
  const graded = data.submissions.filter((submission) => typeof submission.grade === "number").length;
  return `
    <section class="metric-grid">
      ${renderMetric("Pengguna aktif", activeUsers, "Mahasiswa, dosen, staf, admin")}
      ${renderMetric("Kelas aktif", data.courses.length, "Semester berjalan")}
      ${renderMetric("Submission dinilai", graded, "Tugas dan kuis")}
      ${renderMetric("Uptime target", "99%", "Kebutuhan non-fungsional")}
    </section>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h3>Laporan pembelajaran</h3>
          <p class="muted">Dapat difilter berdasarkan semester, program studi, mata kuliah, dan kelas.</p>
        </div>
        <button class="subtle-button" type="button" data-action="export-report"><i data-lucide="file-spreadsheet"></i>Export CSV</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Kelas</th><th>Dosen</th><th>Mahasiswa</th><th>Progress</th><th>Kehadiran</th><th>Risiko</th></tr></thead>
        <tbody>
          ${courses
            .map((course) => {
              const lecturers = course.instructorIds.map((id) => userById(id)?.name).filter(Boolean).join(", ");
              const risk = course.attendanceRate < 90 || course.progress < 60 ? "Perlu perhatian" : "Normal";
              return `
                <tr>
                  <td>${course.code}-${course.className}<br /><span class="muted">${escapeHtml(course.name)}</span></td>
                  <td>${escapeHtml(lecturers)}</td>
                  <td>${course.studentIds.length}</td>
                  <td>${course.progress}%</td>
                  <td>${course.attendanceRate}%</td>
                  <td>${statusTag(risk)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderUsers() {
  return `
    <section class="module-grid">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h3>Manajemen pengguna</h3>
            <p class="muted">Admin dapat menambah, mengubah status, dan mengelola role pengguna.</p>
          </div>
          <button class="subtle-button" type="button" data-action="import-users"><i data-lucide="upload"></i>Import CSV</button>
        </div>
        <table class="data-table">
          <thead><tr><th>Nama</th><th>Role</th><th>Identitas</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            ${data.users
              .map(
                (user) => `
                <tr>
                  <td>${escapeHtml(user.name)}<br /><span class="muted">${escapeHtml(user.email)}</span></td>
                  <td>${roleNames[user.role]}</td>
                  <td>${escapeHtml(user.identity)}</td>
                  <td>${statusTag(user.status === "active" ? "Aktif" : "Nonaktif")}</td>
                  <td>
                    <button class="subtle-button" type="button" data-action="toggle-user" data-id="${user.id}">
                      <i data-lucide="power"></i>${user.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </td>
                </tr>
              `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <form class="panel" data-form="user">
        <div class="panel-header">
          <div>
            <h3>Tambah pengguna</h3>
            <p class="muted">Password disimpan aman di server sebagai hash.</p>
          </div>
        </div>
        <label>Nama<input name="name" required /></label>
        <label>Email<input name="email" type="email" required /></label>
        <label>Username<input name="username" required /></label>
        <label>Password<input name="password" type="password" autocomplete="new-password" required minlength="8" /></label>
        <label>Role<select name="role"><option value="student">Mahasiswa</option><option value="lecturer">Dosen</option><option value="staff">Staf Akademik</option><option value="admin">Administrator</option></select></label>
        <button class="primary-button" type="submit"><i data-lucide="user-plus"></i>Tambah akun</button>
      </form>
    </section>
  `;
}

function renderAssetPreview(dataUrl, label) {
  if (!dataUrl) return `<div class="empty-state">Aset default dari server akan digunakan.</div>`;
  return `<img class="asset-preview" src="${dataUrl}" alt="${escapeHtml(label)}" />`;
}

function renderKhsPdfSettings() {
  const user = currentUser();
  if (user.role !== "admin") return `<section class="panel"><div class="empty-state">Akses khusus administrator.</div></section>`;
  if (!state.khsPdfSettings && !state.khsPdfSettingsLoading) loadKhsPdfSettingsForAdmin();
  if (!state.khsPdfSettings) {
    return `
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>Pengaturan PDF KHS</h3>
            <p class="muted">Memuat konfigurasi dari server.</p>
          </div>
        </div>
        <div class="empty-state">Mohon tunggu...</div>
      </section>
    `;
  }

  const settings = state.khsPdfSettings;
  const header = settings.header || {};
  const headerLogo = header.logo || {};
  const signature = settings.signature || {};
  const signatureImage = signature.image || {};
  const assets = settings.assets || {};
  const message = state.khsPdfSettingsMessage ? `<p class="form-success">${escapeHtml(state.khsPdfSettingsMessage)}</p>` : "";

  return `
    <form class="pdf-settings-layout" data-form="khs-pdf-settings">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>Kop surat KHS</h3>
            <p class="muted">Konten ini langsung dipakai saat mahasiswa atau staf mencetak KHS.</p>
          </div>
          <button class="subtle-button" type="button" data-action="reload-khs-pdf-settings">
            <i data-lucide="refresh-cw"></i>Muat ulang
          </button>
        </div>
        <div class="form-grid">
          <label>Nama STT<input name="headerTitle" value="${escapeHtml(header.title || "")}" required /></label>
          <label>Ukuran font judul<input name="headerTitleFontSize" type="number" min="6" max="30" step="0.5" value="${numberInputValue(header.titleFontSize, 15)}" required /></label>
          <label>Warna judul<input name="headerTitleColor" type="color" value="${colorInputValue(header.titleColor, "#003b7a")}" /></label>
          <label>Ukuran font isi<input name="headerBodyFontSize" type="number" min="5" max="20" step="0.5" value="${numberInputValue(header.bodyFontSize, 10)}" required /></label>
        </div>
        <label>Isi kop surat<textarea name="headerLines" rows="8" required>${escapeHtml((header.lines || []).join("\n"))}</textarea></label>
        <div class="form-grid compact-grid">
          <label>Warna isi<input name="headerBodyColor" type="color" value="${colorInputValue(header.bodyColor, "#47515c")}" /></label>
          <label>Jarak baris<input name="headerLineGap" type="number" min="6" max="18" step="0.5" value="${numberInputValue(header.lineGap, 9)}" required /></label>
        </div>
        <div class="form-grid compact-grid">
          <label>Lebar logo<input name="headerLogoWidth" type="number" min="40" max="110" step="1" value="${numberInputValue(headerLogo.width, 68)}" required /></label>
          <label>Tinggi logo<input name="headerLogoHeight" type="number" min="40" max="110" step="1" value="${numberInputValue(headerLogo.height, 68)}" required /></label>
          <label>Posisi X logo<input name="headerLogoX" type="number" min="20" max="120" step="1" value="${numberInputValue(headerLogo.x, 46)}" required /></label>
          <label>Turun logo<input name="headerLogoYOffset" type="number" min="35" max="120" step="1" value="${numberInputValue(headerLogo.yOffset, 66)}" required /></label>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>Dosen & penandatangan</h3>
            <p class="muted">Nama, jabatan, dan identitas resmi pada bagian tanda tangan PDF.</p>
          </div>
        </div>
        <div class="form-grid">
          <label>Nama<input name="signatureName" value="${escapeHtml(signature.name || "")}" required /></label>
          <label>Jabatan<input name="signatureTitle" value="${escapeHtml(signature.title || "")}" required /></label>
          <label>Program/Prodi<input name="signatureProgram" value="${escapeHtml(signature.program || "")}" /></label>
          <label>Lokasi<input name="signatureLocation" value="${escapeHtml(signature.location || "")}" /></label>
          <label>Label identitas<select name="signatureIdentifierLabel">
            ${["NUPTK", "NIDN", "NIP"].map((label) => `<option value="${label}" ${signature.identifierLabel === label ? "selected" : ""}>${label}</option>`).join("")}
          </select></label>
          <label>Nomor identitas<input name="signatureIdentifier" value="${escapeHtml(signature.identifier || "")}" /></label>
          <label>Teks tanggal<input name="signatureDatePrefix" value="${escapeHtml(signature.datePrefix || "")}" placeholder="Kosongkan agar memakai tanggal cetak otomatis" /></label>
          <label>Warna font<input name="signatureColor" type="color" value="${colorInputValue(signature.color, "#000000")}" /></label>
          <label>Ukuran font data<input name="signatureFontSize" type="number" min="6" max="18" step="0.5" value="${numberInputValue(signature.fontSize, 9.5)}" required /></label>
          <label>Ukuran font nama<input name="signatureNameFontSize" type="number" min="7" max="20" step="0.5" value="${numberInputValue(signature.nameFontSize, 10)}" required /></label>
          <label>Ukuran font identitas<input name="signatureIdentifierFontSize" type="number" min="6" max="18" step="0.5" value="${numberInputValue(signature.identifierFontSize, 9.5)}" required /></label>
          <label>Lebar tanda tangan<input name="signatureImageWidth" type="number" min="160" max="440" step="1" value="${numberInputValue(signatureImage.width, 290)}" required /></label>
          <label>Tinggi area tanda tangan<input name="signatureImageHeight" type="number" min="70" max="190" step="1" value="${numberInputValue(signatureImage.height, 115)}" required /></label>
          <label>Geser tanda tangan X<input name="signatureImageXOffset" type="number" min="-80" max="80" step="1" value="${numberInputValue(signatureImage.xOffset, 0)}" required /></label>
          <label>Naik tanda tangan<input name="signatureImageYOffset" type="number" min="-20" max="60" step="1" value="${numberInputValue(signatureImage.yOffset, 0)}" required /></label>
        </div>
      </section>

      <section class="module-grid">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h3>Aset PDF</h3>
              <p class="muted">Upload PNG/JPG untuk mengganti logo STT dan tanda tangan.</p>
            </div>
          </div>
          <div class="asset-grid">
            <div class="asset-card">
              <strong>Logo STT</strong>
              ${renderAssetPreview(assets.logoDataUrl, "Logo STT")}
              <label>Ganti logo<input name="logoAsset" type="file" accept="image/png,image/jpeg" /></label>
              <button class="subtle-button" type="button" data-action="clear-khs-asset" data-asset="logo">
                <i data-lucide="eraser"></i>Gunakan default
              </button>
            </div>
            <div class="asset-card">
              <strong>Tanda tangan</strong>
              ${renderAssetPreview(assets.signatureDataUrl, "Tanda tangan")}
              <label>Ganti tanda tangan<input name="signatureAsset" type="file" accept="image/png,image/jpeg" /></label>
              <button class="subtle-button" type="button" data-action="clear-khs-asset" data-asset="signature">
                <i data-lucide="eraser"></i>Gunakan default
              </button>
            </div>
          </div>
        </div>

        <aside class="panel">
          <div class="panel-header">
            <div>
              <h3>Simpan konfigurasi</h3>
              <p class="muted">Setelah disimpan, cetak KHS berikutnya memakai nilai terbaru.</p>
            </div>
          </div>
          ${message}
          <div class="item-list">
            <article class="item-card">
              <div class="item-row"><strong>Status</strong>${statusTag("Aktif")}</div>
              <p class="muted">Endpoint PDF membaca konfigurasi ini dari database production.</p>
            </article>
          </div>
          <button class="primary-button" type="submit"><i data-lucide="save"></i>Simpan & terapkan</button>
        </aside>
      </section>
    </form>
  `;
}

function renderCourseSemesterPanels(courseGroups) {
  const semesterLevels = sortedSemesterLevels(courseGroups);
  if (!semesterLevels.length) return `<div class="empty-state">Belum ada mata kuliah untuk semester aktif ini.</div>`;
  return `
    <div class="course-semester-panels">
      ${semesterLevels
        .map(
          (semesterLevel) => `
          <details class="course-semester-panel" open>
            <summary>
              <span>${escapeHtml(semesterLevel)}</span>
              <strong>${totalCredits(courseGroups[semesterLevel])} SKS</strong>
            </summary>
            <table class="data-table">
              <thead><tr><th>Kode</th><th>Mata Kuliah</th><th>SKS</th><th>Semester Aktif</th><th>Aksi</th></tr></thead>
              <tbody>
                ${courseGroups[semesterLevel]
                  .map(
                    (course) => `
                    <tr>
                      <td>${escapeHtml(course.code)}</td>
                      <td>${escapeHtml(course.name)}</td>
                      <td>${Number(course.credits)}</td>
                      <td>${escapeHtml(course.semester)}</td>
                      <td>
                        ${academicActionCell(
                          "courses",
                          `
                            <button class="subtle-button" type="button" data-action="edit-course" data-id="${course.id}">
                              <i data-lucide="pencil"></i>Edit
                            </button>
                            <button class="danger-button" type="button" data-action="delete-course" data-id="${course.id}">
                              <i data-lucide="trash-2"></i>Hapus
                            </button>
                          `,
                        )}
                      </td>
                    </tr>
                  `,
                  )
                  .join("")}
              </tbody>
            </table>
          </details>
        `,
        )
        .join("")}
    </div>
  `;
}

function renderKhsQuestionEditorRows(form = null) {
  const questions = [...(form?.questions || [])];
  const targetCount = Math.max(state.khsQuestionEditorCount || 6, questions.length + 1);
  while (questions.length < targetCount) questions.push({ id: "", label: "", type: "text", required: true, options: [] });
  return questions
    .map(
      (question, index) => `
      <div class="question-editor">
        <input name="questionId" type="hidden" value="${escapeHtml(question.id || "")}" />
        <label>Pertanyaan ${index + 1}<input name="questionLabel" value="${escapeHtml(question.label || "")}" placeholder="Kosongkan jika tidak dipakai" /></label>
        <label>Tipe<select name="questionType">
          ${["text", "textarea", "select", "radio", "checkbox", "date"].map((type) => `<option value="${type}" ${question.type === type ? "selected" : ""}>${type}</option>`).join("")}
        </select></label>
        <label>Opsi<input name="questionOptions" value="${escapeHtml((question.options || []).join(", "))}" placeholder="Pisahkan dengan koma untuk select/radio/checkbox" /></label>
        <label class="check-row inline-check">
          <input type="checkbox" name="questionRequired_${index}" ${question.required !== false ? "checked" : ""} />
          <span>Wajib diisi</span>
        </label>
      </div>
    `,
    )
    .join("");
}

function renderKhsFormsAdmin() {
  const user = currentUser();
  if (!["staff", "admin"].includes(user.role)) return `<section class="panel"><div class="empty-state">Akses khusus staf dan admin.</div></section>`;
  const activeTab = state.khsFormTab || "settings";
  const forms = data.khsForms.filter((form) => form.semester === CURRENT_ACTIVE_SEMESTER);
  const editing = state.editKhsFormId ? data.khsForms.find((form) => form.id === state.editKhsFormId) : null;
  const showBuilder = state.khsFormBuilderOpen || Boolean(editing);
  const masterEdit = Boolean(state.khsFormMasterEditMode);
  const students = data.users.filter((item) => item.role === "student" && (state.khsFormCohortFilter === "all" || studentCohort(item) === String(state.khsFormCohortFilter)));
  const selectedStudentId = state.khsFormStudentFilter === "all" ? "all" : state.khsFormStudentFilter;
  const visibleStudents = selectedStudentId === "all" ? students : students.filter((student) => student.id === selectedStudentId);

  return `
    <section class="toolbar">
      <div class="filters">
        <button class="subtle-button ${activeTab === "settings" ? "is-active" : ""}" type="button" data-action="khs-form-tab" data-tab="settings">
          <i data-lucide="settings"></i>Pengaturan Form
        </button>
        <button class="subtle-button ${activeTab === "responses" ? "is-active" : ""}" type="button" data-action="khs-form-tab" data-tab="responses">
          <i data-lucide="list-checks"></i>Jawaban Mahasiswa
        </button>
        <button class="subtle-button ${activeTab === "status" ? "is-active" : ""}" type="button" data-action="khs-form-tab" data-tab="status">
          <i data-lucide="lock-keyhole"></i>Status Cetak
        </button>
        <span class="tag green">${escapeHtml(CURRENT_ACTIVE_SEMESTER)}</span>
      </div>
    </section>

    ${
      activeTab === "settings"
        ? `
        <section class="module-grid">
          <div class="panel">
            <div class="panel-header">
              <div>
                <h3>Form wajib cetak KHS</h3>
                <p class="muted">Mahasiswa harus mengisi form aktif dan wajib sebelum dapat mencetak KHS.</p>
              </div>
              <div class="form-actions">
                <button class="primary-button" type="button" data-action="new-khs-form"><i data-lucide="plus"></i>Tambah Form</button>
                <button class="subtle-button ${masterEdit ? "is-active" : ""}" type="button" data-action="toggle-khs-form-master-edit">
                  <i data-lucide="${masterEdit ? "check" : "pencil"}"></i>${masterEdit ? "Selesai Edit" : "Edit Master"}
                </button>
              </div>
            </div>
            <div class="item-list">
              ${forms
                .map(
                  (form) => `
                  <article class="item-card">
                    <div class="item-row">
                      <div>
                        <strong>${escapeHtml(form.title)}</strong>
                        <p class="muted">${escapeHtml(form.description || "")}</p>
                      </div>
                      ${statusTag(form.active !== false ? "Aktif" : "Nonaktif")}
                    </div>
                    <div class="item-meta">
                      <span>${form.questions.length} pertanyaan</span>
                      <span>${form.requiredForPrint !== false ? "Wajib cetak" : "Tidak wajib"}</span>
                      <span>${escapeHtml(form.semester)}</span>
                    </div>
                    ${
                      masterEdit
                        ? `
                        <div class="form-actions">
                          <button class="subtle-button" type="button" data-action="edit-khs-form" data-id="${form.id}"><i data-lucide="pencil"></i>Edit</button>
                          <button class="danger-button" type="button" data-action="delete-khs-form" data-id="${form.id}"><i data-lucide="trash-2"></i>Hapus</button>
                        </div>
                      `
                        : ""
                    }
                  </article>
                `,
                )
                .join("")}
            </div>
          </div>
          ${
            showBuilder
              ? `
          <form class="panel" data-form="khs-form-config">
            <div class="panel-header">
              <div>
                <h3>${editing ? "Edit form" : "Tambah form"}</h3>
                <p class="muted">Gunakan minimal dua form aktif untuk membuka akses cetak KHS.</p>
              </div>
              <button class="subtle-button" type="button" data-action="cancel-edit-khs-form"><i data-lucide="x"></i>Tutup</button>
            </div>
            <input name="id" type="hidden" value="${escapeHtml(editing?.id || "")}" />
            <label>Judul form<input name="title" value="${escapeHtml(editing?.title || "")}" required /></label>
            <label>Deskripsi<textarea name="description" required>${escapeHtml(editing?.description || "")}</textarea></label>
            <div class="form-grid compact-grid">
              <label class="check-row inline-check"><input type="checkbox" name="active" ${editing?.active === false ? "" : "checked"} /><span>Aktif</span></label>
              <label class="check-row inline-check"><input type="checkbox" name="requiredForPrint" ${editing?.requiredForPrint === false ? "" : "checked"} /><span>Wajib untuk cetak</span></label>
            </div>
            <div class="field-group">
              <strong>Pertanyaan</strong>
              <div class="question-editor-list">${renderKhsQuestionEditorRows(editing)}</div>
              <button class="subtle-button" type="button" data-action="add-khs-question"><i data-lucide="plus"></i>Tambah Pertanyaan</button>
            </div>
            <button class="primary-button" type="submit"><i data-lucide="save"></i>Simpan form</button>
          </form>
          `
              : `
          <aside class="panel">
            <div class="empty-state">Klik Tambah Form untuk membuat form baru, atau aktifkan Edit Master untuk mengubah form yang sudah ada.</div>
          </aside>
          `
          }
        </section>
      `
        : ""
    }

    ${
      activeTab === "responses"
        ? `
        <section class="panel">
          <div class="panel-header">
            <div>
              <h3>Jawaban mahasiswa</h3>
              <p class="muted">Lihat isi form yang sudah dikirim oleh masing-masing mahasiswa.</p>
            </div>
            <div class="filters">
              <label>Angkatan<select data-action="khs-form-cohort-filter">${cohortOptions(state.khsFormCohortFilter)}</select></label>
              <label>Mahasiswa<select data-action="khs-form-student-filter">
                <option value="all" ${selectedStudentId === "all" ? "selected" : ""}>Semua mahasiswa</option>
                ${students.map((student) => `<option value="${student.id}" ${selectedStudentId === student.id ? "selected" : ""}>${escapeHtml(student.name)} - ${escapeHtml(student.identity)}</option>`).join("")}
              </select></label>
              <button class="primary-button" type="button" data-action="export-khs-form-responses"><i data-lucide="file-down"></i>Export PDF</button>
            </div>
          </div>
          <div class="item-list">
            ${visibleStudents
              .flatMap((student) =>
                forms.map((form) => {
                  const submission = khsSubmissionFor(form.id, student.id);
                  return `
                    <article class="item-card">
                      <div class="item-row">
                        <div>
                          <strong>${escapeHtml(student.name)} - ${escapeHtml(form.title)}</strong>
                          <p class="muted">${escapeHtml(student.identity)} - Angkatan ${escapeHtml(studentCohort(student))}</p>
                        </div>
                        ${submission ? statusTag("Sudah isi") : statusTag("Belum isi")}
                      </div>
                      ${
                        submission
                          ? `
                          <table class="data-table">
                            <tbody>
                              ${form.questions
                                .map((question) => `<tr><th>${escapeHtml(question.label)}</th><td>${escapeHtml(formatAnswerValue(submission.answers?.[question.id]))}</td></tr>`)
                                .join("")}
                            </tbody>
                          </table>
                          <p class="muted">Dikirim ${formatDateTime(submission.submittedAt || submission.updatedAt)}</p>
                        `
                          : `<p class="muted">Mahasiswa belum mengirim form ini.</p>`
                      }
                    </article>
                  `;
                }),
              )
              .join("")}
          </div>
        </section>
      `
        : ""
    }

    ${
      activeTab === "status"
        ? `
        <section class="panel">
          <div class="panel-header">
            <div>
              <h3>Status cetak KHS</h3>
              <p class="muted">Status dihitung real-time dari form wajib aktif semester ini.</p>
            </div>
            <div class="filters">
              <label>Angkatan<select data-action="khs-form-cohort-filter">${cohortOptions(state.khsFormCohortFilter)}</select></label>
            </div>
          </div>
          <table class="data-table">
            <thead><tr><th>Mahasiswa</th><th>Angkatan</th><th>Form selesai</th><th>Status</th></tr></thead>
            <tbody>
              ${students
                .map((student) => {
                  const status = khsPrintStatus(student.id);
                  return `
                    <tr>
                      <td>${escapeHtml(student.name)}<br /><span class="muted">${escapeHtml(student.identity)}</span></td>
                      <td>${escapeHtml(studentCohort(student))}</td>
                      <td>${status.completedFormIds.length}/${status.requiredForms.length}</td>
                      <td>${status.unlocked ? statusTag("Terbuka") : status.completedFormIds.length ? statusTag("Sebagian") : statusTag("Terkunci")}</td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
        </section>
      `
        : ""
    }
  `;
}

function renderAcademic() {
  const lecturers = data.users.filter((user) => user.role === "lecturer");
  const students = data.users.filter((user) => user.role === "student");
  const academicStudentCohort = state.academicStudentCohortFilter || "all";
  const visibleStudents = students.filter((student) => academicStudentCohort === "all" || studentCohort(student) === String(academicStudentCohort));
  const studentGroups = groupStudentsByCohort(visibleStudents);
  const activeTab = state.academicTab;
  const visibleCourses = data.courses.filter((course) => course.semester === CURRENT_ACTIVE_SEMESTER);
  const courseGroups = groupCoursesBySemesterLevel(visibleCourses);
  const editingLecturer = activeTab === "lecturers" ? lecturers.find((lecturer) => lecturer.id === state.editAcademicUserId) : null;
  const editingStudent = activeTab === "students" ? students.find((student) => student.id === state.editAcademicUserId) : null;
  const editingCourse = activeTab === "courses" ? courseById(state.editCourseId) : null;
  return `
    <section class="toolbar">
      <div class="filters">
        <button class="subtle-button ${activeTab === "lecturers" ? "is-active" : ""}" type="button" data-action="academic-tab" data-tab="lecturers">
          <i data-lucide="briefcase-business"></i>Dosen
        </button>
        <button class="subtle-button ${activeTab === "students" ? "is-active" : ""}" type="button" data-action="academic-tab" data-tab="students">
          <i data-lucide="graduation-cap"></i>Mahasiswa
        </button>
        <button class="subtle-button ${activeTab === "courses" ? "is-active" : ""}" type="button" data-action="academic-tab" data-tab="courses">
          <i data-lucide="book-open"></i>Mata Kuliah
        </button>
        <button class="subtle-button ${activeTab === "sync" ? "is-active" : ""}" type="button" data-action="academic-tab" data-tab="sync">
          <i data-lucide="refresh-cw"></i>Sinkronisasi
        </button>
        <span class="tag green">Semester aktif otomatis: ${escapeHtml(CURRENT_ACTIVE_SEMESTER)}</span>
      </div>
    </section>

    ${
      activeTab === "lecturers"
        ? `
        <section class="module-grid">
          <div class="panel">
            <div class="panel-header">
              <div>
                <h3>Data dosen</h3>
                <p class="muted">Dosen dapat mengampu beberapa mata kuliah lintas semester.</p>
              </div>
              ${academicEditButton("lecturers")}
            </div>
            <table class="data-table">
              <thead><tr><th>Nama</th><th>NIDN/NUPTK</th><th>Username</th><th>Mata kuliah diampu</th><th>Aksi</th></tr></thead>
              <tbody>
                ${lecturers
                  .map((lecturer) => {
                    const lecturerCourses = visibleCourses.filter((course) => course.instructorIds.includes(lecturer.id));
                    return `
                      <tr>
                        <td>${escapeHtml(lecturer.name)}</td>
                        <td>${escapeHtml(lecturer.identity)}</td>
                        <td>${escapeHtml(lecturer.username)}</td>
                        <td>${renderCourseDetailsGrouped(lecturerCourses)}</td>
                        <td>
                          ${academicActionCell(
                            "lecturers",
                            `
                              <button class="subtle-button" type="button" data-action="edit-academic-user" data-id="${lecturer.id}">
                                <i data-lucide="pencil"></i>Edit
                              </button>
                              <button class="danger-button" type="button" data-action="delete-academic-user" data-id="${lecturer.id}">
                                <i data-lucide="trash-2"></i>Hapus
                              </button>
                            `,
                          )}
                        </td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
          <form class="panel" data-form="academic-lecturer">
            <div class="panel-header">
              <div>
                <h3>${editingLecturer ? "Edit dosen" : "Tambah dosen"}</h3>
                <p class="muted">Username, password, NIDN/NUPTK, nama, dan mata kuliah diampu.</p>
              </div>
            </div>
            <label>Username<input name="username" value="${escapeHtml(editingLecturer?.username || "")}" required /></label>
            <label>Password<input name="password" type="password" autocomplete="new-password" ${editingLecturer ? 'placeholder="Kosongkan jika tidak diganti"' : "required minlength=\"8\""} /></label>
            <label>NIDN/NUPTK<input name="identity" value="${escapeHtml(editingLecturer?.identity || "")}" required /></label>
            <label>Nama dosen<input name="name" value="${escapeHtml(editingLecturer?.name || "")}" required /></label>
            <div class="field-group">
              <strong>Mata kuliah diampu</strong>
              <div class="checkbox-groups">${courseCheckboxes("courseIds", editingLecturer ? lecturerCourseIds(editingLecturer.id) : [], visibleCourses)}</div>
            </div>
            <div class="form-actions">
              <button class="primary-button" type="submit"><i data-lucide="save"></i>${editingLecturer ? "Simpan perubahan" : "Tambah dosen"}</button>
              ${editingLecturer ? `<button class="subtle-button" type="button" data-action="cancel-edit-academic-user"><i data-lucide="x"></i>Batal</button>` : ""}
            </div>
          </form>
        </div>
      `
        : ""
    }

    ${
      activeTab === "students"
        ? `
        <section class="module-grid">
          <div class="panel">
            <div class="panel-header">
              <div>
                <h3>Data mahasiswa</h3>
                <p class="muted">Mahasiswa disinkronkan dengan semester berjalan dan mata kuliah yang diambil.</p>
              </div>
              ${academicEditButton("students")}
            </div>
            <div class="toolbar compact-toolbar">
              <div class="filters">
                <label>Angkatan<select name="academicStudentCohort" data-action="academic-student-cohort-filter">
                  ${cohortOptions(academicStudentCohort)}
                </select></label>
              </div>
            </div>
            <table class="data-table">
              <thead><tr><th>Nama</th><th>NIM</th><th>Username</th><th>Prodi</th><th>Tahun Angkatan</th><th>Semester berjalan</th><th>Mata kuliah</th><th>Aksi</th></tr></thead>
              <tbody>
                ${Object.keys(studentGroups)
                  .sort((a, b) => Number(b) - Number(a))
                  .map(
                    (cohort) => `
                      <tr class="group-row"><td colspan="8">Angkatan ${escapeHtml(cohort)}</td></tr>
                      ${studentGroups[cohort]
                        .map((student) => {
                          const courseLabels = visibleCourses.filter((course) => course.studentIds.includes(student.id)).map(courseFullLabel);
                          return `
                            <tr>
                              <td>${escapeHtml(student.name)}</td>
                              <td>${escapeHtml(student.identity)}</td>
                              <td>${escapeHtml(student.username)}</td>
                              <td>${escapeHtml(student.program || "Teologi S1")}</td>
                              <td>${escapeHtml(studentCohort(student))}</td>
                              <td>${escapeHtml(student.currentSemester || "-")}</td>
                              <td>${renderCourseDetails(courseLabels)}</td>
                              <td>
                                ${academicActionCell(
                                  "students",
                                  `
                                    <button class="subtle-button" type="button" data-action="edit-academic-user" data-id="${student.id}">
                                      <i data-lucide="pencil"></i>Edit
                                    </button>
                                    <button class="danger-button" type="button" data-action="delete-academic-user" data-id="${student.id}">
                                      <i data-lucide="trash-2"></i>Hapus
                                    </button>
                                  `,
                                )}
                              </td>
                            </tr>
                          `;
                        })
                        .join("")}
                    `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          <form class="panel" data-form="academic-student">
            <div class="panel-header">
              <div>
                <h3>${editingStudent ? "Edit mahasiswa" : "Tambah mahasiswa"}</h3>
                <p class="muted">Mata kuliah otomatis difilter agar sesuai semester berjalan mahasiswa.</p>
              </div>
            </div>
            <label>Username<input name="username" value="${escapeHtml(editingStudent?.username || "")}" required /></label>
            <label>Password<input name="password" type="password" autocomplete="new-password" ${editingStudent ? 'placeholder="Kosongkan jika tidak diganti"' : "required minlength=\"8\""} /></label>
            <label>NIM<input name="identity" value="${escapeHtml(editingStudent?.identity || "")}" required /></label>
            <label>Nama mahasiswa<input name="name" value="${escapeHtml(editingStudent?.name || "")}" required /></label>
            <label>Tahun angkatan<input name="tahun_angkatan" type="number" min="2000" max="2099" value="${escapeHtml(editingStudent ? studentCohort(editingStudent) : new Date().getFullYear())}" required /></label>
            <label>Prodi<select name="program" required><option value="Teologi S1" ${(editingStudent?.program || "Teologi S1") === "Teologi S1" ? "selected" : ""}>Teologi S1</option></select></label>
            <label>Semester aktif<input value="${escapeHtml(CURRENT_ACTIVE_SEMESTER)}" readonly /></label>
            <input name="currentSemester" type="hidden" value="${escapeHtml(CURRENT_ACTIVE_SEMESTER)}" />
            <div class="field-group">
              <strong>Mata kuliah yang diambil</strong>
              <input class="search-input" type="search" data-action="course-checkbox-search" placeholder="Cari kode atau nama mata kuliah..." autocomplete="off" />
              <div class="checkbox-groups">${courseCheckboxes("courseIds", editingStudent?.enrolledCourseIds || [], visibleCourses)}</div>
            </div>
            <div class="form-actions">
              <button class="primary-button" type="submit"><i data-lucide="save"></i>${editingStudent ? "Simpan perubahan" : "Tambah mahasiswa"}</button>
              ${editingStudent ? `<button class="subtle-button" type="button" data-action="cancel-edit-academic-user"><i data-lucide="x"></i>Batal</button>` : ""}
            </div>
          </form>
        </section>
      `
        : ""
    }

    ${
      activeTab === "courses"
        ? `
        <section class="module-grid">
          <div class="panel">
            <div class="panel-header">
              <div>
                <h3>Data mata kuliah</h3>
                <p class="muted">Master mata kuliah dipakai oleh input nilai, data dosen, data mahasiswa, dan sinkronisasi.</p>
              </div>
              ${academicEditButton("courses")}
            </div>
            ${renderCourseSemesterPanels(courseGroups)}
          </div>
          <form class="panel" data-form="academic-course">
            <div class="panel-header">
              <div>
                <h3>${editingCourse ? "Edit mata kuliah" : "Tambah mata kuliah"}</h3>
                <p class="muted">Data ini menjadi pilihan mata kuliah pada input nilai dan sinkronisasi akademik.</p>
              </div>
            </div>
            <label>Kode<input name="code" value="${escapeHtml(editingCourse?.code || "")}" required /></label>
            <label>Mata Kuliah<input name="name" value="${escapeHtml(editingCourse?.name || "")}" required /></label>
            <label>SKS<input name="credits" type="number" min="1" step="1" value="${Number(editingCourse?.credits || 2)}" required /></label>
            <label>Semester<select name="semesterLevel" required>${courseSemesterLevelOptions(editingCourse?.semesterLevel || "Semester 1")}</select></label>
            <label>Semester aktif<input value="${escapeHtml(CURRENT_ACTIVE_SEMESTER)}" readonly /></label>
            <input name="semester" type="hidden" value="${escapeHtml(CURRENT_ACTIVE_SEMESTER)}" />
            <div class="form-actions">
              <button class="primary-button" type="submit"><i data-lucide="save"></i>${editingCourse ? "Simpan perubahan" : "Tambah mata kuliah"}</button>
              ${editingCourse ? `<button class="subtle-button" type="button" data-action="cancel-edit-course"><i data-lucide="x"></i>Batal</button>` : ""}
            </div>
          </form>
        </section>
      `
        : ""
    }

    ${
      activeTab === "sync"
        ? `
        <section class="module-grid">
          <div class="panel">
            <div class="panel-header">
              <div>
                <h3>Sinkronisasi semester dan mata kuliah</h3>
                <p class="muted">Pilih mata kuliah, dosen pengampu, dan mahasiswa. Sistem hanya menyimpan mahasiswa yang semester berjalannya sama dengan semester mata kuliah.</p>
              </div>
            </div>
            <table class="data-table">
              <thead><tr><th>Mata kuliah</th><th>Semester</th><th>Dosen</th><th>Mahasiswa tersinkron</th></tr></thead>
              <tbody>
                ${visibleCourses
                  .map(
                    (course) => `
                    <tr>
                      <td>${course.code}-${course.className}<br /><span class="muted">${escapeHtml(course.name)}</span></td>
                      <td>${escapeHtml(course.semester)}</td>
                      <td>${course.instructorIds.map((id) => escapeHtml(userById(id)?.name || "-")).join("<br />") || "-"}</td>
                      <td>${course.studentIds.map((id) => escapeHtml(`${userById(id)?.name || "-"} (${userById(id)?.identity || "-"})`)).join("<br />") || "-"}</td>
                    </tr>
                  `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          <form class="panel" data-form="academic-sync">
            <div class="panel-header">
              <div>
                <h3>Atur sinkronisasi</h3>
                <p class="muted">Relasi dosen-mahasiswa disimpan unik per mata kuliah dan semester.</p>
              </div>
            </div>
            <label>Mata kuliah<select name="courseId" required>
              ${visibleCourses.map((course) => `<option value="${course.id}">${escapeHtml(courseFullLabel(course))}</option>`).join("")}
            </select></label>
            <label>Dosen pengampu<select name="lecturerId" required>
              ${lecturers.map((lecturer) => `<option value="${lecturer.id}">${escapeHtml(lecturer.name)} - ${escapeHtml(lecturer.identity)}</option>`).join("")}
            </select></label>
            <div class="field-group">
              <strong>Mahasiswa peserta</strong>
              <div class="checkbox-list">${studentCheckboxes("studentIds")}</div>
            </div>
            <button class="primary-button" type="submit"><i data-lucide="refresh-cw"></i>Sinkronkan</button>
          </form>
        </section>
      `
        : ""
    }
  `;
}

function renderIntegrations() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h3>Integrasi Sistem Akademik</h3>
          <p class="muted">API, import CSV/Excel, sinkronisasi berkala, dan log validasi data.</p>
        </div>
        <button class="primary-button" type="button" data-action="sync-academic"><i data-lucide="refresh-cw"></i>Sinkronkan</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Sumber</th><th>Dataset</th><th>Sinkron terakhir</th><th>Status</th></tr></thead>
        <tbody>
          ${data.integrations
            .map(
              (item) => `
              <tr>
                <td>${escapeHtml(item.source)}</td>
                <td>${escapeHtml(item.dataset)}</td>
                <td>${escapeHtml(item.lastSync)}</td>
                <td>${statusTag(item.status)}</td>
              </tr>
            `,
            )
            .join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderAudit() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h3>Audit log dan keamanan</h3>
          <p class="muted">Aktivitas penting untuk traceability, backup, dan kontrol akses.</p>
        </div>
        <button class="subtle-button" type="button" data-action="backup"><i data-lucide="database-backup"></i>Backup sekarang</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Status</th></tr></thead>
        <tbody>
          ${data.audit
            .map(
              (item) => `
              <tr>
                <td>${escapeHtml(item.time)}</td>
                <td>${escapeHtml(item.actor)}</td>
                <td>${escapeHtml(item.action)}</td>
                <td>${statusTag(item.status)}</td>
              </tr>
            `,
            )
            .join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderSidePanel(title, body) {
  return `
    <aside class="panel">
      <div class="panel-header">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p class="muted">${escapeHtml(body)}</p>
        </div>
      </div>
    </aside>
  `;
}

function buildKhsPayloadForCurrentUser() {
  const user = currentUser();
  const rows = khsRowsForStudent(user.id);
  return {
    mahasiswa: {
      nama: user.name,
      nim: user.identity,
      prodi: user.program || "Teologi S1",
    },
    semester: CURRENT_ACTIVE_SEMESTER,
    mata_kuliah: rows.map((row) => ({
      kode: row.code,
      nama_mk: row.subject,
      sks: Number(row.credits || 0),
      nilai_huruf: row.letter || "",
      bobot_angka: gradeWeightValue(row.grade, row.letter),
    })),
  };
}

async function loadKhsPdfSettingsForAdmin(force = false) {
  if (state.khsPdfSettingsLoading) return;
  if (state.khsPdfSettings && !force) return;
  state.khsPdfSettingsLoading = true;
  try {
    const result = await apiRequest("/api/admin/settings");
    state.khsPdfSettings = result.settings;
    state.khsPdfSettingsMessage = "";
  } catch (error) {
    console.error(error);
    state.khsPdfSettingsMessage = error.message || "Pengaturan PDF KHS gagal dimuat.";
  } finally {
    state.khsPdfSettingsLoading = false;
    if (state.activeView === "pdf-settings") renderView();
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("File gagal dibaca."));
    reader.readAsDataURL(file);
  });
}

async function handleKhsPdfSettingsSubmit(formElement) {
  const submitButton = formElement.querySelector('button[type="submit"]');
  const originalHtml = submitButton?.innerHTML || "";
  const form = new FormData(formElement);
  const assets = { ...(state.khsPdfSettings?.assets || {}) };
  const logoFile = form.get("logoAsset");
  const signatureFile = form.get("signatureAsset");

  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Menyimpan...";
    }
    if (logoFile?.size) assets.logoDataUrl = await fileToDataUrl(logoFile);
    if (signatureFile?.size) assets.signatureDataUrl = await fileToDataUrl(signatureFile);

    const payload = {
      header: {
        title: form.get("headerTitle"),
        titleFontSize: Number(form.get("headerTitleFontSize")),
        titleColor: form.get("headerTitleColor"),
        bodyFontSize: Number(form.get("headerBodyFontSize")),
        bodyColor: form.get("headerBodyColor"),
        lineGap: Number(form.get("headerLineGap")),
        logo: {
          x: Number(form.get("headerLogoX")),
          yOffset: Number(form.get("headerLogoYOffset")),
          width: Number(form.get("headerLogoWidth")),
          height: Number(form.get("headerLogoHeight")),
        },
        lines: String(form.get("headerLines") || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      },
      signature: {
        name: form.get("signatureName"),
        title: form.get("signatureTitle"),
        program: form.get("signatureProgram"),
        location: form.get("signatureLocation"),
        datePrefix: form.get("signatureDatePrefix"),
        identifierLabel: form.get("signatureIdentifierLabel"),
        identifier: form.get("signatureIdentifier"),
        color: form.get("signatureColor"),
        fontSize: Number(form.get("signatureFontSize")),
        nameFontSize: Number(form.get("signatureNameFontSize")),
        identifierFontSize: Number(form.get("signatureIdentifierFontSize")),
        image: {
          width: Number(form.get("signatureImageWidth")),
          height: Number(form.get("signatureImageHeight")),
          xOffset: Number(form.get("signatureImageXOffset")),
          yOffset: Number(form.get("signatureImageYOffset")),
        },
      },
      assets,
    };

    const result = await apiRequest("/api/admin/update-settings", { method: "POST", body: JSON.stringify(payload) });
    state.khsPdfSettings = result.settings;
    state.khsPdfSettingsMessage = "Pengaturan PDF KHS berhasil disimpan.";
    addAudit("Mengubah pengaturan PDF KHS");
    saveData();
    renderView();
  } catch (error) {
    console.error(error);
    state.khsPdfSettingsMessage = error.message || "Pengaturan PDF KHS gagal disimpan.";
    renderView();
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = originalHtml;
      refreshIcons();
    }
  }
}

async function downloadKhsFormResponsesPdf(actionButton) {
  const originalHtml = actionButton?.innerHTML || "";
  try {
    if (actionButton) {
      actionButton.disabled = true;
      actionButton.textContent = "Membuat PDF...";
    }
    const params = new URLSearchParams({
      semester: CURRENT_ACTIVE_SEMESTER,
      cohort: state.khsFormCohortFilter || "all",
      studentId: state.khsFormStudentFilter || "all",
    });
    const response = await fetch(`/api/admin/khs-form-responses.pdf?${params.toString()}`, {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      const errorPayload = await response.json().catch(async () => ({ message: await response.text() }));
      throw new Error(errorPayload.message || `Export PDF gagal. Status ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jawaban-form-khs-${CURRENT_ACTIVE_SEMESTER.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    addAudit("Export jawaban form KHS PDF");
    saveData();
  } catch (error) {
    console.error(error);
    window.alert(error.message || "Export PDF gagal.");
  } finally {
    if (actionButton) {
      actionButton.disabled = false;
      actionButton.innerHTML = originalHtml;
      refreshIcons();
    }
  }
}

async function downloadKhsPdf(actionButton) {
  const button = actionButton || document.querySelector('[data-action="print-khs"]');
  const originalHtml = button?.innerHTML || "";
  const user = currentUser();

  try {
    if (user.role === "student" && !khsPrintStatus(user.id).unlocked) {
      throw new Error("Cetak KHS terkunci. Lengkapi semua form wajib terlebih dahulu.");
    }
    if (button) {
      button.disabled = true;
      button.textContent = "Membuat PDF...";
    }

    const response = await fetch("/api/cetak-khs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(buildKhsPayloadForCurrentUser()),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(async () => ({ message: await response.text() }));
      throw new Error(errorPayload.message || errorPayload.detail || `Gagal membuat PDF KHS. Status ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `KHS_${String(user.identity || "mahasiswa").replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    addAudit("Cetak KHS PDF");
    saveData();
  } catch (error) {
    console.error(error);
    addAudit("Gagal cetak KHS PDF", "Gagal");
    saveData();
    window.alert(error.message || "Gagal membuat PDF KHS.");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }
  }
}

function addAudit(action, status = "Berhasil") {
  data.audit.unshift({
    id: `log-${Date.now()}`,
    actor: currentUser()?.name || "Sistem",
    action,
    time: new Date().toLocaleString("id-ID"),
    status,
  });
}

function notifyUsers(userIds, title, body, meta = {}) {
  if (!["announcement", "calendar"].includes(meta.entityType) || !meta.entityId) return;
  [...new Set(userIds)].forEach((userId) => {
    data.notifications.unshift({
      id: `n-${Date.now()}-${userId}`,
      userId,
      title,
      body,
      read: false,
      entityType: meta.entityType,
      entityId: meta.entityId,
    });
  });
}

function removeNotifications(entityType, entityId) {
  data.notifications = data.notifications.filter((item) => item.entityType !== entityType || item.entityId !== entityId);
}

function closeNotificationTray() {
  $("#notificationTray")?.classList.add("hidden");
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

document.addEventListener("submit", async (event) => {
  if (event.target.id === "loginForm") {
    event.preventDefault();
    const username = $("#usernameInput").value.trim().toLowerCase();
    const password = $("#passwordInput").value;
    try {
      const result = await apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      await loadDataFromApi();
      state.currentUserId = result.user.id;
      $("#loginError").textContent = "";
      showApp();
    } catch (error) {
      $("#loginError").textContent = error.message || "Login gagal. Periksa username, password, atau status akun.";
    }
    return;
  }

  const formName = event.target.dataset.form;
  if (!formName) return;
  event.preventDefault();
  if (formName === "letterhead") {
    handleLetterheadUpload(event.target);
    return;
  }
  if (formName === "khs-pdf-settings") {
    await handleKhsPdfSettingsSubmit(event.target);
    return;
  }
  const form = new FormData(event.target);
  const handled = handleForm(formName, form);
  if (handled === false) return;
  event.target.reset();
  saveData();
  renderNotifications();
  renderView();
});

function handleLetterheadUpload(formElement) {
  const file = formElement.querySelector('input[name="letterhead"]')?.files?.[0];
  if (!file) return;
  const allowedTypes = ["application/pdf", "image/png"];
  if (!allowedTypes.includes(file.type)) {
    window.alert("Format kop surat harus PDF atau PNG.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    data.settings.letterheadDataUrl = String(reader.result || "");
    data.settings.letterheadName = file.name;
    data.settings.letterheadType = file.type;
    addAudit(`Upload kop surat KHS ${file.name}`);
    saveData();
    renderView();
  };
  reader.readAsDataURL(file);
}

function handleForm(formName, form) {
  const user = currentUser();
  if (formName === "khs-form-config") {
    const now = new Date().toISOString();
    const ids = form.getAll("questionId");
    const labels = form.getAll("questionLabel");
    const types = form.getAll("questionType");
    const options = form.getAll("questionOptions");
    const questions = labels
      .map((label, index) => ({
        id: ids[index] || `q-${Date.now()}-${index}`,
        label: String(label || "").trim(),
        type: types[index] || "text",
        required: form.has(`questionRequired_${index}`),
        options: String(options[index] || "")
          .split(",")
          .map((option) => option.trim())
          .filter(Boolean),
      }))
      .filter((question) => question.label);
    if (!questions.length) {
      window.alert("Minimal satu pertanyaan harus diisi.");
      return false;
    }
    const formId = form.get("id") || `khs-form-${Date.now()}`;
    const payload = {
      id: formId,
      title: form.get("title"),
      description: form.get("description"),
      semester: CURRENT_ACTIVE_SEMESTER,
      requiredForPrint: form.has("requiredForPrint"),
      active: form.has("active"),
      questions,
      createdAt: data.khsForms.find((item) => item.id === formId)?.createdAt || now,
      updatedAt: now,
    };
    const existing = data.khsForms.find((item) => item.id === formId);
    if (existing) Object.assign(existing, payload);
    else data.khsForms.push(payload);
    state.editKhsFormId = null;
    state.khsFormBuilderOpen = false;
    state.khsQuestionEditorCount = 6;
    addAudit(`${existing ? "Mengedit" : "Menambah"} form KHS ${payload.title}`);
  }

  if (formName === "khs-form-submission") {
    const formId = form.get("formId");
    const targetForm = data.khsForms.find((item) => item.id === formId);
    if (!targetForm) return;
    const answers = {};
    targetForm.questions.forEach((question) => {
      const key = `answer_${question.id}`;
      answers[question.id] = question.type === "checkbox" ? form.getAll(key) : form.get(key);
    });
    const missing = targetForm.questions.find((question) => {
      if (!question.required) return false;
      const value = answers[question.id];
      return Array.isArray(value) ? value.length === 0 : !String(value || "").trim();
    });
    if (missing) {
      window.alert(`Pertanyaan wajib belum diisi: ${missing.label}`);
      return false;
    }
    const now = new Date().toISOString();
    const existing = khsSubmissionFor(formId, user.id);
    const payload = {
      id: existing?.id || `khs-sub-${Date.now()}`,
      formId,
      studentId: user.id,
      semester: CURRENT_ACTIVE_SEMESTER,
      answers,
      submittedAt: existing?.submittedAt || now,
      updatedAt: now,
    };
    if (existing) Object.assign(existing, payload);
    else data.khsFormSubmissions.push(payload);
    addAudit(`Mengisi form KHS ${targetForm.title}`);
  }

  if (formName === "material") {
    const material = {
      id: `m-${Date.now()}`,
      courseId: form.get("courseId"),
      title: form.get("title"),
      type: form.get("type"),
      description: form.get("description"),
      publishedAt: new Date().toISOString().slice(0, 10),
      visibility: "published",
      size: "File unggahan",
      authorId: user.id,
      accessedBy: [],
    };
    data.materials.unshift(material);
    notifyUsers(courseById(material.courseId).studentIds, "Materi baru", material.title);
    addAudit(`Publikasi materi ${material.title}`);
  }

  if (formName === "assignment") {
    const assignment = {
      id: `a-${Date.now()}`,
      courseId: form.get("courseId"),
      title: form.get("title"),
      description: form.get("description"),
      deadline: form.get("deadline"),
      collectionType: "File upload",
      maxSize: "10 MB",
      weight: Number(form.get("weight")),
      allowLate: false,
      published: true,
    };
    data.assignments.unshift(assignment);
    notifyUsers(courseById(assignment.courseId).studentIds, "Tugas baru", assignment.title);
    addAudit(`Publikasi tugas ${assignment.title}`);
  }

  if (formName === "quiz") {
    const now = new Date();
    const startsAt = new Date(now.getTime() + 86400000);
    const endsAt = new Date(startsAt.getTime() + Number(form.get("duration")) * 60000);
    data.quizzes.unshift({
      id: `q-${Date.now()}`,
      courseId: form.get("courseId"),
      title: form.get("title"),
      duration: Number(form.get("duration")),
      startsAt: startsAt.toISOString().slice(0, 16),
      endsAt: endsAt.toISOString().slice(0, 16),
      questionCount: Number(form.get("questionCount")),
      randomizeQuestions: true,
      status: "published",
      attempts: [],
    });
    addAudit(`Membuat kuis ${form.get("title")}`);
  }

  if (formName === "attendance") {
    data.attendanceSessions.unshift({
      id: `att-${Date.now()}`,
      courseId: form.get("courseId"),
      meeting: Number(form.get("meeting")),
      date: form.get("date"),
      opensAt: "08:00",
      closesAt: "23:59",
      selfCheckin: true,
      records: [],
    });
    addAudit(`Membuka absensi pertemuan ${form.get("meeting")}`);
  }

  if (formName === "announcement") {
    const courseId = form.get("courseId") || null;
    const payload = {
      title: form.get("title"),
      body: form.get("body"),
      target: courseId ? `${courseById(courseId).code}-${courseById(courseId).className}` : "Seluruh pengguna",
      courseId,
    };
    if (state.editAnnouncementId) {
      const announcement = data.announcements.find((item) => item.id === state.editAnnouncementId);
      Object.assign(announcement, payload, { updatedBy: user.id, updatedAt: new Date().toISOString().slice(0, 10) });
      const targets = courseId ? courseById(courseId).studentIds : data.users.map((item) => item.id);
      notifyUsers(targets, "Pengumuman diperbarui", announcement.title, { entityType: "announcement", entityId: announcement.id });
      addAudit(`Mengedit pengumuman ${announcement.title}`);
      state.editAnnouncementId = null;
    } else {
      const announcement = {
        id: `ann-${Date.now()}`,
        ...payload,
        createdBy: user.id,
        publishedAt: new Date().toISOString().slice(0, 10),
      };
      data.announcements.unshift(announcement);
      const targets = courseId ? courseById(courseId).studentIds : data.users.map((item) => item.id);
      notifyUsers(targets, "Pengumuman baru", announcement.title, { entityType: "announcement", entityId: announcement.id });
      addAudit(`Publikasi pengumuman ${announcement.title}`);
    }
  }

  if (formName === "calendar-event") {
    const payload = {
      title: form.get("title"),
      date: form.get("date"),
      category: form.get("category"),
      target: form.get("target"),
      description: form.get("description"),
    };
    if (state.editCalendarEventId) {
      const event = data.calendarEvents.find((item) => item.id === state.editCalendarEventId);
      Object.assign(event, payload, { updatedBy: user.id, updatedAt: new Date().toISOString().slice(0, 10) });
      notifyUsers(data.users.map((item) => item.id), "Kalender akademik diperbarui", event.title, { entityType: "calendar", entityId: event.id });
      addAudit(`Mengedit agenda kalender ${event.title}`);
      state.editCalendarEventId = null;
    } else {
      const event = {
        id: `cal-${Date.now()}`,
        ...payload,
        createdBy: user.id,
      };
      data.calendarEvents.unshift(event);
      notifyUsers(data.users.map((item) => item.id), "Agenda akademik baru", event.title, { entityType: "calendar", entityId: event.id });
      addAudit(`Menambah agenda kalender ${payload.title}`);
    }
  }

  if (formName === "grade-entry") {
    const course = courseById(form.get("courseId"));
    if (!course) {
      window.alert("Mahasiswa ini belum memiliki mata kuliah aktif untuk diinput nilainya.");
      return;
    }
    const credits = Number(course?.credits || 0);
    const grade = roundTwo(Number(form.get("grade") || 0));
    const letter = form.get("letter") || gradeLetterFromWeight(grade);
    const studentId = form.get("studentId");
    const target = state.editGradeEntryId ? data.gradeEntries.find((row) => row.id === state.editGradeEntryId) : null;
    const existingForCourse = data.gradeEntries.find((row) => row.studentId === studentId && row.code === course?.code && row.id !== target?.id);
    const nextNo = gradeRowsForStudent(studentId).reduce((max, row) => Math.max(max, Number(row.no) || 0), 0) + 1;
    const no = target?.no || existingForCourse?.no || nextNo;
    data.gradeEntries = data.gradeEntries.filter((row) => row.id !== target?.id && !(row.studentId === studentId && row.code === course?.code));
    data.gradeEntries.push({
      id: target?.id || existingForCourse?.id || `gr-${Date.now()}`,
      studentId,
      no,
      code: course?.code || "",
      subject: course?.name || "",
      credits,
      letter,
      grade,
      weighted: roundTwo(credits * grade),
    });
    renumberGradeEntries(studentId);
    state.gradeStudentId = studentId;
    state.editGradeEntryId = null;
    addAudit(`${target ? "Mengedit" : "Input"} nilai ${userById(studentId)?.name || studentId} ${course?.code || ""}`);
  }

  if (formName === "academic-lecturer") {
    const lecturerId = state.editAcademicUserId || `u-lect-${Date.now()}`;
    const courseIds = form.getAll("courseIds");
    const payload = {
      id: lecturerId,
      name: form.get("name"),
      username: form.get("username"),
      email: `${form.get("username")}@saintpaul.ac.id`,
      role: "lecturer",
      status: "active",
      identity: form.get("identity"),
      program: "Belum diatur",
      faculty: "Belum diatur",
    };
    if (form.get("password")) payload.password = form.get("password");
    const existing = data.users.find((item) => item.id === lecturerId);
    if (existing) Object.assign(existing, payload);
    else data.users.push(payload);
    data.courses.forEach((course) => {
      course.instructorIds = course.instructorIds.filter((id) => id !== lecturerId);
      if (courseIds.includes(course.id) && !course.instructorIds.includes(lecturerId)) course.instructorIds.push(lecturerId);
    });
    addAudit(`${existing ? "Mengedit" : "Menambah"} dosen ${form.get("name")} dan sinkron mata kuliah`);
    state.editAcademicUserId = null;
  }

  if (formName === "academic-student") {
    const studentId = state.editAcademicUserId || `u-stu-${Date.now()}`;
    const currentSemester = form.get("currentSemester");
    const courseIds = form.getAll("courseIds").filter((courseId) => courseById(courseId)?.semester === currentSemester);
    const payload = {
      id: studentId,
      name: form.get("name"),
      username: form.get("username"),
      email: `${form.get("username")}@sttsaintpaul.ac.id`,
      role: "student",
      status: "active",
      identity: form.get("identity"),
      tahun_angkatan: String(form.get("tahun_angkatan") || inferCohortFromIdentity(form.get("identity"))),
      program: form.get("program"),
      faculty: "Belum diatur",
      currentSemester,
      enrolledCourseIds: courseIds,
    };
    if (form.get("password")) payload.password = form.get("password");
    const existing = data.users.find((item) => item.id === studentId);
    if (existing) Object.assign(existing, payload);
    else data.users.push(payload);
    data.courses.forEach((course) => {
      course.studentIds = course.studentIds.filter((id) => id !== studentId);
      if (courseIds.includes(course.id) && !course.studentIds.includes(studentId)) course.studentIds.push(studentId);
    });
    addAudit(`${existing ? "Mengedit" : "Menambah"} mahasiswa ${form.get("name")} dan sinkron mata kuliah semester ${currentSemester}`);
    state.editAcademicUserId = null;
  }

  if (formName === "academic-course") {
    const courseId = state.editCourseId || `c-${Date.now()}`;
    const existing = courseById(courseId);
    const previousCode = existing?.code;
    const payload = {
      id: courseId,
      code: form.get("code"),
      name: form.get("name"),
      className: existing?.className || "A",
      credits: Number(form.get("credits") || 0),
      semester: normalizeCourseTerm(form.get("semester") || existing?.semester || CURRENT_ACTIVE_SEMESTER),
      semesterLevel: form.get("semesterLevel") || existing?.semesterLevel || "Semester 1",
      program: existing?.program || "Teologi S1",
      schedule: existing?.schedule || "Belum dijadwalkan",
      room: existing?.room || "-",
      instructorIds: existing?.instructorIds || [],
      studentIds: existing?.studentIds || [],
      progress: existing?.progress || 0,
      attendanceRate: existing?.attendanceRate || 0,
      status: existing?.status || "active",
    };
    if (existing) Object.assign(existing, payload);
    else data.courses.push(payload);
    data.gradeEntries
      .filter((row) => row.code === previousCode || row.code === payload.code)
      .forEach((row) => {
        row.code = payload.code;
        row.subject = payload.name;
        row.credits = payload.credits;
        row.weighted = roundTwo(payload.credits * Number(row.grade || 0));
      });
    addAudit(`${existing ? "Mengedit" : "Menambah"} mata kuliah ${payload.code}`);
    state.editCourseId = null;
  }

  if (formName === "academic-sync") {
    const course = courseById(form.get("courseId"));
    const lecturerId = form.get("lecturerId");
    const studentIds = form.getAll("studentIds").filter((studentId) => userById(studentId)?.currentSemester === course.semester);
    course.instructorIds = lecturerId ? [lecturerId] : [];
    course.studentIds = [...new Set(studentIds)];
    data.users
      .filter((item) => item.role === "student")
      .forEach((student) => {
        const enrolled = new Set(student.enrolledCourseIds || []);
        if (course.studentIds.includes(student.id)) enrolled.add(course.id);
        else enrolled.delete(course.id);
        student.enrolledCourseIds = [...enrolled];
      });
    addAudit(`Sinkronisasi ${course.code}-${course.className} dengan dosen dan mahasiswa semester ${course.semester}`);
  }

  if (formName === "user") {
    data.users.push({
      id: `u-${Date.now()}`,
      name: form.get("name"),
      username: form.get("username"),
      email: form.get("email"),
      password: form.get("password"),
      role: form.get("role"),
      status: "active",
      identity: `NEW-${data.users.length + 1}`,
      program: "Belum diatur",
      faculty: "Belum diatur",
      enrolledCourseIds: [],
    });
    addAudit(`Menambah pengguna ${form.get("username")}`);
  }
}

document.addEventListener("click", (event) => {
  const clickedNotificationButton = event.target.closest("#notifButton");
  const clickedNotificationTray = event.target.closest("#notificationTray");
  if (!clickedNotificationButton && !clickedNotificationTray) closeNotificationTray();

  const nav = event.target.closest("[data-view]");
  if (nav) {
    state.activeView = nav.dataset.view;
    state.editAnnouncementId = null;
    state.editCalendarEventId = null;
    state.editAcademicUserId = null;
    state.editCourseId = null;
    state.editGradeEntryId = null;
    state.editKhsFormId = null;
    state.khsEditMode = false;
    document.body.classList.remove("nav-open");
    renderView();
    return;
  }

  if (event.target.closest("#menuToggle")) {
    document.body.classList.toggle("nav-open");
    return;
  }

  if (event.target.closest("#logoutButton")) {
    apiRequest("/api/auth/logout", { method: "POST", body: "{}" }).catch(console.error);
    state.currentUserId = null;
    data = normalizeData(structuredClone(seedData));
    showLogin();
    return;
  }

  if (clickedNotificationButton) {
    $("#notificationTray").classList.toggle("hidden");
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  if (["SELECT", "OPTION", "INPUT", "TEXTAREA"].includes(actionButton.tagName)) return;
  handleAction(actionButton.dataset.action, actionButton.dataset.id, actionButton);
});

document.addEventListener("change", (event) => {
  if (event.target.dataset.action === "course-filter") {
    state.courseFilter = event.target.value;
    renderView();
  }
  if (event.target.dataset.action === "grade-view-student-filter") {
    state.gradeStudentId = event.target.value;
    state.editGradeEntryId = null;
    state.khsEditMode = false;
    renderView();
  }
  if (event.target.dataset.action === "grade-entry-student-filter") {
    state.gradeStudentId = event.target.value;
    state.editGradeEntryId = null;
    renderView();
  }
  if (event.target.dataset.action === "grade-cohort-filter") {
    state.gradeCohortFilter = event.target.value;
    state.gradeStudentId = studentsForCohort(state.gradeCohortFilter)[0]?.id || "";
    state.editGradeEntryId = null;
    state.khsEditMode = false;
    renderView();
  }
  if (event.target.dataset.action === "academic-student-cohort-filter") {
    state.academicStudentCohortFilter = event.target.value;
    state.editAcademicUserId = null;
    renderView();
  }
  if (event.target.dataset.action === "khs-form-cohort-filter") {
    state.khsFormCohortFilter = event.target.value;
    state.khsFormStudentFilter = "all";
    renderView();
  }
  if (event.target.dataset.action === "khs-form-student-filter") {
    state.khsFormStudentFilter = event.target.value;
    renderView();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.dataset.action === "course-checkbox-search") {
    const query = event.target.value.trim().toLowerCase();
    const container = event.target.closest(".field-group");
    let visibleCount = 0;
    container?.querySelectorAll("[data-course-option]").forEach((option) => {
      const haystack = option.dataset.searchText || option.textContent.toLowerCase();
      const visible = !query || haystack.includes(query);
      option.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    container?.querySelectorAll("[data-course-group]").forEach((group) => {
      const hasVisibleCourse = Boolean(group.querySelector("[data-course-option]:not([hidden])"));
      group.hidden = Boolean(query) && !hasVisibleCourse;
      if (query && hasVisibleCourse) group.open = true;
    });
    const empty = container?.querySelector(".course-search-empty");
    if (empty) empty.hidden = !query || visibleCount > 0;
  }
});

function handleAction(action, id, actionButton) {
  const user = currentUser();
  if (action === "toggle-khs-edit-mode") {
    state.khsEditMode = !state.khsEditMode;
    if (!state.khsEditMode) state.editGradeEntryId = null;
    renderView();
    return;
  }

  if (action === "academic-tab") {
    state.academicTab = actionButton?.dataset.tab || "lecturers";
    state.editAcademicUserId = null;
    state.editCourseId = null;
    renderView();
    return;
  }

  if (action === "khs-form-tab") {
    state.khsFormTab = actionButton?.dataset.tab || "settings";
    state.editKhsFormId = null;
    state.khsFormBuilderOpen = false;
    renderView();
    return;
  }

  if (action === "new-khs-form") {
    state.editKhsFormId = null;
    state.khsFormBuilderOpen = true;
    state.khsQuestionEditorCount = 6;
    renderView();
    return;
  }

  if (action === "toggle-khs-form-master-edit") {
    state.khsFormMasterEditMode = !state.khsFormMasterEditMode;
    if (!state.khsFormMasterEditMode) {
      state.editKhsFormId = null;
      state.khsFormBuilderOpen = false;
    }
    renderView();
    return;
  }

  if (action === "add-khs-question") {
    state.khsQuestionEditorCount = Number(state.khsQuestionEditorCount || 6) + 1;
    renderView();
    return;
  }

  if (action === "export-khs-form-responses") {
    downloadKhsFormResponsesPdf(actionButton);
    return;
  }

  if (action === "edit-khs-form") {
    state.editKhsFormId = id;
    state.khsFormTab = "settings";
    state.khsFormBuilderOpen = true;
    const target = data.khsForms.find((form) => form.id === id);
    state.khsQuestionEditorCount = Math.max(6, (target?.questions?.length || 0) + 1);
    renderView();
    return;
  }

  if (action === "cancel-edit-khs-form") {
    state.editKhsFormId = null;
    state.khsFormBuilderOpen = false;
    state.khsQuestionEditorCount = 6;
    renderView();
    return;
  }

  if (action === "delete-khs-form") {
    const target = data.khsForms.find((form) => form.id === id);
    data.khsForms = data.khsForms.filter((form) => form.id !== id);
    data.khsFormSubmissions = data.khsFormSubmissions.filter((submission) => submission.formId !== id);
    if (state.editKhsFormId === id) state.editKhsFormId = null;
    addAudit(`Menghapus form KHS ${target?.title || id}`);
  }

  if (action === "toggle-academic-edit-mode") {
    const tab = actionButton?.dataset.tab || state.academicTab;
    state.academicEditMode[tab] = !state.academicEditMode[tab];
    if (!state.academicEditMode[tab]) {
      if (tab === "courses") state.editCourseId = null;
      else state.editAcademicUserId = null;
    }
    renderView();
    return;
  }

  if (action === "mark-all-read") {
    data.notifications.forEach((item) => {
      if (item.userId === user.id) item.read = true;
    });
    saveData();
    renderNotifications();
    return;
  }

  if (action === "reload-khs-pdf-settings") {
    state.khsPdfSettings = null;
    state.khsPdfSettingsMessage = "";
    loadKhsPdfSettingsForAdmin(true);
    renderView();
    return;
  }

  if (action === "clear-khs-asset") {
    const asset = actionButton?.dataset.asset;
    state.khsPdfSettings ||= {};
    state.khsPdfSettings.assets ||= {};
    if (asset === "logo") state.khsPdfSettings.assets.logoDataUrl = "";
    if (asset === "signature") state.khsPdfSettings.assets.signatureDataUrl = "";
    state.khsPdfSettingsMessage = "Aset akan memakai file default setelah disimpan.";
    renderView();
    return;
  }

  if (action === "edit-announcement") {
    state.editAnnouncementId = id;
    renderView();
    return;
  }

  if (action === "cancel-edit-announcement") {
    state.editAnnouncementId = null;
    renderView();
    return;
  }

  if (action === "delete-announcement") {
    const target = data.announcements.find((item) => item.id === id);
    data.announcements = data.announcements.filter((item) => item.id !== id);
    removeNotifications("announcement", id);
    if (state.editAnnouncementId === id) state.editAnnouncementId = null;
    addAudit(`Menghapus pengumuman ${target?.title || id}`);
  }

  if (action === "edit-calendar-event") {
    state.editCalendarEventId = id;
    renderView();
    return;
  }

  if (action === "cancel-edit-calendar-event") {
    state.editCalendarEventId = null;
    renderView();
    return;
  }

  if (action === "delete-calendar-event") {
    const target = data.calendarEvents.find((item) => item.id === id);
    data.calendarEvents = data.calendarEvents.filter((item) => item.id !== id);
    removeNotifications("calendar", id);
    if (state.editCalendarEventId === id) state.editCalendarEventId = null;
    addAudit(`Menghapus agenda kalender ${target?.title || id}`);
  }

  if (action === "delete-grade-entry") {
    const target = data.gradeEntries.find((row) => row.id === id);
    data.gradeEntries = data.gradeEntries.filter((row) => row.id !== id);
    if (target) renumberGradeEntries(target.studentId);
    if (state.editGradeEntryId === id) state.editGradeEntryId = null;
    addAudit(`Menghapus nilai ${target?.code || id}`);
  }

  if (action === "edit-grade-entry") {
    const target = data.gradeEntries.find((row) => row.id === id);
    if (target) {
      state.gradeStudentId = target.studentId;
      state.editGradeEntryId = id;
    }
    renderView();
    return;
  }

  if (action === "cancel-edit-grade-entry") {
    state.editGradeEntryId = null;
    renderView();
    return;
  }

  if (action === "edit-academic-user") {
    state.editAcademicUserId = id;
    renderView();
    return;
  }

  if (action === "cancel-edit-academic-user") {
    state.editAcademicUserId = null;
    renderView();
    return;
  }

  if (action === "delete-academic-user") {
    const target = data.users.find((item) => item.id === id);
    if (target && target.id !== user.id) {
      data.users = data.users.filter((item) => item.id !== id);
      data.courses.forEach((course) => {
        course.instructorIds = course.instructorIds.filter((lecturerId) => lecturerId !== id);
        course.studentIds = course.studentIds.filter((studentId) => studentId !== id);
      });
      data.gradeEntries = data.gradeEntries.filter((row) => row.studentId !== id);
      data.notifications = data.notifications.filter((item) => item.userId !== id);
      if (state.editAcademicUserId === id) state.editAcademicUserId = null;
      addAudit(`Menghapus data ${roleNames[target.role]} ${target.name}`);
    }
    saveData();
    renderNotifications();
    renderView();
    return;
  }

  if (action === "edit-course") {
    state.editCourseId = id;
    renderView();
    return;
  }

  if (action === "cancel-edit-course") {
    state.editCourseId = null;
    renderView();
    return;
  }

  if (action === "delete-course") {
    const target = courseById(id);
    if (target) {
      data.courses = data.courses.filter((course) => course.id !== id);
      data.users
        .filter((item) => item.role === "student")
        .forEach((student) => {
          student.enrolledCourseIds = (student.enrolledCourseIds || []).filter((courseId) => courseId !== id);
        });
      data.gradeEntries = data.gradeEntries.filter((row) => row.code !== target.code);
      data.users.filter((item) => item.role === "student").forEach((student) => renumberGradeEntries(student.id));
      if (state.editCourseId === id) state.editCourseId = null;
      addAudit(`Menghapus mata kuliah ${target.code}`);
    }
  }

  if (action === "delete-letterhead") {
    data.settings.letterheadDataUrl = "";
    data.settings.letterheadName = "";
    data.settings.letterheadType = "";
    addAudit("Menghapus kop surat KHS");
  }

  if (action === "access-material") {
    const material = data.materials.find((item) => item.id === id);
    if (material && !material.accessedBy.includes(user.id)) material.accessedBy.push(user.id);
    addAudit(`${user.name} mengakses materi ${material?.title}`);
  }

  if (action === "submit-assignment") {
    const assignment = data.assignments.find((item) => item.id === id);
    data.submissions.push({
      id: `s-${Date.now()}`,
      assignmentId: id,
      studentId: user.id,
      submittedAt: new Date().toISOString().slice(0, 16),
      answer: `${user.username}-${assignment.title.toLowerCase().replaceAll(" ", "-")}.pdf`,
      status: new Date(assignment.deadline) < new Date() ? "late" : "submitted",
      grade: null,
      feedback: "",
    });
    notifyUsers(courseById(assignment.courseId).instructorIds, "Pengumpulan masuk", assignment.title);
    addAudit(`${user.name} mengumpulkan tugas ${assignment.title}`);
  }

  if (action === "grade-submission") {
    const submission = data.submissions.find((item) => item.id === id);
    submission.grade = 90;
    submission.feedback = "Dinilai melalui gradebook. Struktur jawaban sudah memenuhi kriteria.";
    notifyUsers([submission.studentId], "Nilai baru", "Feedback tugas sudah diterbitkan.");
    addAudit(`Memberi nilai submission ${id}`);
  }

  if (action === "start-quiz") {
    const quiz = data.quizzes.find((item) => item.id === id);
    quiz.attempts.push({ studentId: user.id, score: 84, submittedAt: new Date().toISOString().slice(0, 16) });
    notifyUsers([user.id], "Kuis selesai", `Skor objektif ${quiz.title}: 84`);
    addAudit(`${user.name} menyelesaikan kuis ${quiz.title}`);
  }

  if (action === "checkin") {
    const session = data.attendanceSessions.find((item) => item.id === id);
    session.records.push({ studentId: user.id, status: "Hadir", note: "Check-in mandiri" });
    addAudit(`${user.name} melakukan absensi mandiri`);
  }

  if (action === "toggle-user") {
    const target = data.users.find((item) => item.id === id);
    if (target.id !== user.id) {
      target.status = target.status === "active" ? "inactive" : "active";
      addAudit(`Mengubah status pengguna ${target.username}`);
    }
  }

  if (action === "import-users") {
    addAudit("Import pengguna dari CSV");
    data.notifications.unshift({ id: `n-${Date.now()}`, userId: user.id, title: "Import selesai", body: "Validasi format CSV berhasil.", read: false });
  }

  if (action === "sync-academic") {
    data.integrations[0].lastSync = new Date().toLocaleString("id-ID");
    data.integrations[0].status = "Tersinkron";
    addAudit("Sinkronisasi data akademik dari SIAKAD");
  }

  if (action === "backup") {
    addAudit("Backup manual");
    data.notifications.unshift({ id: `n-${Date.now()}`, userId: user.id, title: "Backup berhasil", body: "Snapshot data aplikasi selesai dibuat.", read: false });
  }

  if (action === "export-report") {
    const csv = ["kelas,progress,kehadiran", ...data.courses.map((course) => `${course.code}-${course.className},${course.progress},${course.attendanceRate}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "laporan-lms.csv";
    link.click();
    URL.revokeObjectURL(url);
    addAudit("Export laporan CSV");
  }

  if (action === "print-khs") {
    downloadKhsPdf(actionButton);
    return;
  }

  if (action === "create-course") {
    data.courses.push({
      id: `c-${Date.now()}`,
      code: "MK" + (100 + data.courses.length),
      name: "Mata Kuliah Baru",
      className: "A",
      credits: 3,
      semester: CURRENT_ACTIVE_SEMESTER,
      semesterLevel: "Semester 1",
      program: "Belum diatur",
      schedule: "Belum dijadwalkan",
      room: "-",
      instructorIds: data.users.filter((item) => item.role === "lecturer").slice(0, 1).map((item) => item.id),
      studentIds: [],
      progress: 0,
      attendanceRate: 0,
      status: "active",
    });
    addAudit("Membuat kelas baru");
  }

  saveData();
  renderNotifications();
  renderView();
}

async function initApp() {
  try {
    const session = await apiRequest("/api/auth/me");
    await loadDataFromApi();
    state.currentUserId = session.user.id;
    showApp();
  } catch {
    state.currentUserId = null;
    data = normalizeData(structuredClone(seedData));
    showLogin();
  }
}

initApp();
