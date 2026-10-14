// Verminord Dagslogg – Google Apps Script
// Spreadsheet ID: 1l6buGufQJSfziF1sXq5T4yUcjmSBLs-_aKy61Q6xNOw

var SPREADSHEET_ID = '1l6buGufQJSfziF1sXq5T4yUcjmSBLs-_aKy61Q6xNOw';

// ---------------------------------------------------------------------------
// doGet – serve the mobile-optimised HTML form
// ---------------------------------------------------------------------------
function doGet() {
  var html = HtmlService.createHtmlOutput(getHtml());
  html.setTitle('Verminord Dagslogg');
  html.setSandboxMode(HtmlService.SandboxMode.IFRAME);
  html.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return html;
}

// ---------------------------------------------------------------------------
// logProduksjon – called via google.script.run from the HTML form
// data: { system, who, temp, ph, fukt, forTilfort, kommentar }
// ---------------------------------------------------------------------------
function logProduksjon(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Produksjon');
  if (!sheet) throw new Error('Fant ikke arket "Produksjon"');

  var ts = new Date();
  sheet.appendRow([
    ts,
    data.system    || '',
    data.who       || '',
    data.temp      !== '' && data.temp      !== undefined ? Number(data.temp)      : '',
    data.ph        !== '' && data.ph        !== undefined ? Number(data.ph)        : '',
    data.fukt      !== '' && data.fukt      !== undefined ? Number(data.fukt)      : '',
    data.forTilfort !== '' && data.forTilfort !== undefined ? Number(data.forTilfort) : '',
    data.kommentar || ''
  ]);

  oppdaterDashboard_(ss, ts);
  return { ok: true, ts: formatTs_(ts), system: data.system };
}

// ---------------------------------------------------------------------------
// logForkompost – called via google.script.run from the HTML form
// data: { system, who, temp, ph, fukt, kommentar }
// ---------------------------------------------------------------------------
function logForkompost(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Forkompost');
  if (!sheet) throw new Error('Fant ikke arket "Forkompost"');

  var ts = new Date();
  sheet.appendRow([
    ts,
    data.system    || '',
    data.who       || '',
    data.temp      !== '' && data.temp      !== undefined ? Number(data.temp)      : '',
    data.ph        !== '' && data.ph        !== undefined ? Number(data.ph)        : '',
    data.fukt      !== '' && data.fukt      !== undefined ? Number(data.fukt)      : '',
    data.kommentar || ''
  ]);

  oppdaterDashboard_(ss, ts);

  var tempNum = (data.temp !== '' && data.temp !== undefined) ? Number(data.temp) : null;
  oppdaterHygienisering_(ss, data.system, ts, tempNum);

  return { ok: true, ts: formatTs_(ts), system: data.system };
}

// ---------------------------------------------------------------------------
// oppdaterDashboard_ – writes "Man 05.06 14:30" next to "Sist oppdatert:"
// ---------------------------------------------------------------------------
function oppdaterDashboard_(ss, ts) {
  var sheet = ss.getSheetByName('Dashboard');
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  for (var r = 0; r < data.length; r++) {
    for (var c = 0; c < data[r].length; c++) {
      if (String(data[r][c]).indexOf('Sist oppdatert') !== -1) {
        sheet.getRange(r + 1, c + 2).setValue(formatTs_(ts));
        return;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// oppdaterHygienisering_ – updates the Hygienisering row for the given system
// Columns: System(A), Siste loggdag(B), Siste maks C(C),
//          Doegn >=55C paa rad(D), Status(E), Oppdatert(F)
// ---------------------------------------------------------------------------
function oppdaterHygienisering_(ss, system, ts, temp) {
  var sheet = ss.getSheetByName('Hygienisering');
  if (!sheet) return;
  if (temp === null || temp === undefined) return;

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var r = 0; r < data.length; r++) {
    if (String(data[r][0]).trim() === String(system).trim()) {
      rowIndex = r;
      break;
    }
  }
  if (rowIndex === -1) return; // system not found in sheet

  var row        = data[rowIndex];
  var prevDayStr = row[1] ? Utilities.formatDate(new Date(row[1]), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
  var prevMaxC   = (row[2] !== '' && row[2] !== undefined) ? Number(row[2]) : null;
  var prevStreak = (row[3] !== '' && row[3] !== undefined) ? Number(row[3]) : 0;

  var today    = Utilities.formatDate(ts, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var isNewDay = (prevDayStr !== today);

  var newStreak;
  var newMaxC;

  if (isNewDay) {
    // New calendar day
    newMaxC   = temp;
    newStreak = (temp >= 55) ? prevStreak + 1 : 0;
  } else {
    // Same day – update running max
    newMaxC = (prevMaxC !== null) ? Math.max(prevMaxC, temp) : temp;
    // If today's previous max was < 55 but this reading crosses >=55, increment streak
    if (prevMaxC !== null && prevMaxC < 55 && newMaxC >= 55) {
      newStreak = prevStreak + 1;
    } else {
      newStreak = prevStreak;
    }
  }

  var status;
  if (newStreak >= 5) {
    status = 'GRØNN Oppnådd ≥55C i 5+ døgn';
  } else if (newMaxC >= 55) {
    status = 'GUL Pågår: ' + newStreak + '/5 døgn ≥55C';
  } else {
    status = 'RØD Under 55C - nullstilt';
  }

  var sheetRow = rowIndex + 1;
  sheet.getRange(sheetRow, 2).setValue(today);
  sheet.getRange(sheetRow, 3).setValue(newMaxC);
  sheet.getRange(sheetRow, 4).setValue(newStreak);
  sheet.getRange(sheetRow, 5).setValue(status);
  sheet.getRange(sheetRow, 6).setValue(Utilities.formatDate(ts, Session.getScriptTimeZone(), 'M/d/yyyy'));
}

// ---------------------------------------------------------------------------
// formatTs_ – "Man 05.06 14:30"
// ---------------------------------------------------------------------------
function formatTs_(ts) {
  var tz   = Session.getScriptTimeZone();
  var days = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
  var day  = days[ts.getDay()];
  var ddMM = Utilities.formatDate(ts, tz, 'dd.MM');
  var hhmm = Utilities.formatDate(ts, tz, 'HH:mm');
  return day + ' ' + ddMM + ' ' + hhmm;
}

// ---------------------------------------------------------------------------
// getHtml – returns the complete HTML form as a string
// ---------------------------------------------------------------------------
function getHtml() {
  return '<!DOCTYPE html>\n' +
'<html lang="no">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'<title>Verminord Dagslogg</title>\n' +
'<style>\n' +
'  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\n' +
'\n' +
'  :root {\n' +
'    --navy:  #1C3A5C;\n' +
'    --navy2: #15304F;\n' +
'    --gold:  #C9A227;\n' +
'    --gold2: #A8851F;\n' +
'    --cream: #F5F0E8;\n' +
'    --white: #FFFFFF;\n' +
'    --grey:  #E8E3D8;\n' +
'    --text:  #1A1A2E;\n' +
'    --muted: #6B7280;\n' +
'    --red:   #C0392B;\n' +
'    --green: #27AE60;\n' +
'    --radius: 10px;\n' +
'    --shadow: 0 2px 12px rgba(28,58,92,0.12);\n' +
'  }\n' +
'\n' +
'  body {\n' +
'    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\n' +
'    background: var(--cream);\n' +
'    color: var(--text);\n' +
'    min-height: 100vh;\n' +
'    display: flex;\n' +
'    flex-direction: column;\n' +
'    align-items: center;\n' +
'  }\n' +
'\n' +
'  /* ── Header ── */\n' +
'  header {\n' +
'    width: 100%;\n' +
'    background: linear-gradient(135deg, var(--navy) 0%, var(--navy2) 100%);\n' +
'    color: var(--white);\n' +
'    padding: 20px 24px 16px;\n' +
'    display: flex;\n' +
'    align-items: center;\n' +
'    gap: 14px;\n' +
'    box-shadow: 0 3px 16px rgba(0,0,0,0.25);\n' +
'  }\n' +
'\n' +
'  .logo {\n' +
'    width: 46px; height: 46px;\n' +
'    background: var(--gold);\n' +
'    border-radius: 50%;\n' +
'    display: flex; align-items: center; justify-content: center;\n' +
'    font-size: 22px; font-weight: 800;\n' +
'    color: var(--navy);\n' +
'    flex-shrink: 0;\n' +
'    box-shadow: 0 2px 8px rgba(0,0,0,0.3);\n' +
'  }\n' +
'\n' +
'  .header-text h1 {\n' +
'    font-size: 22px; font-weight: 700;\n' +
'    letter-spacing: 0.5px;\n' +
'  }\n' +
'\n' +
'  .header-text p {\n' +
'    font-size: 12px;\n' +
'    color: rgba(255,255,255,0.7);\n' +
'    margin-top: 2px;\n' +
'  }\n' +
'\n' +
'  /* ── Main card ── */\n' +
'  main {\n' +
'    width: 100%;\n' +
'    max-width: 520px;\n' +
'    padding: 20px 16px 40px;\n' +
'  }\n' +
'\n' +
'  /* ── Tab switcher ── */\n' +
'  .tabs {\n' +
'    display: flex;\n' +
'    background: var(--white);\n' +
'    border-radius: var(--radius);\n' +
'    padding: 4px;\n' +
'    box-shadow: var(--shadow);\n' +
'    margin-bottom: 20px;\n' +
'  }\n' +
'\n' +
'  .tab-btn {\n' +
'    flex: 1;\n' +
'    padding: 10px 6px;\n' +
'    border: none;\n' +
'    background: transparent;\n' +
'    border-radius: 8px;\n' +
'    font-size: 14px;\n' +
'    font-weight: 600;\n' +
'    color: var(--muted);\n' +
'    cursor: pointer;\n' +
'    transition: background 0.2s, color 0.2s;\n' +
'  }\n' +
'\n' +
'  .tab-btn.active {\n' +
'    background: var(--navy);\n' +
'    color: var(--white);\n' +
'    box-shadow: 0 2px 8px rgba(28,58,92,0.3);\n' +
'  }\n' +
'\n' +
'  /* ── Form card ── */\n' +
'  .card {\n' +
'    background: var(--white);\n' +
'    border-radius: var(--radius);\n' +
'    box-shadow: var(--shadow);\n' +
'    padding: 20px;\n' +
'    margin-bottom: 16px;\n' +
'  }\n' +
'\n' +
'  .card-title {\n' +
'    font-size: 12px;\n' +
'    font-weight: 700;\n' +
'    color: var(--muted);\n' +
'    text-transform: uppercase;\n' +
'    letter-spacing: 0.8px;\n' +
'    margin-bottom: 14px;\n' +
'  }\n' +
'\n' +
'  /* ── Form controls ── */\n' +
'  .field {\n' +
'    margin-bottom: 14px;\n' +
'  }\n' +
'\n' +
'  label {\n' +
'    display: block;\n' +
'    font-size: 13px;\n' +
'    font-weight: 600;\n' +
'    color: var(--navy);\n' +
'    margin-bottom: 5px;\n' +
'  }\n' +
'\n' +
'  select, input[type="number"], textarea {\n' +
'    width: 100%;\n' +
'    padding: 11px 13px;\n' +
'    border: 1.5px solid var(--grey);\n' +
'    border-radius: 8px;\n' +
'    font-size: 15px;\n' +
'    color: var(--text);\n' +
'    background: var(--cream);\n' +
'    -webkit-appearance: none;\n' +
'    appearance: none;\n' +
'    transition: border-color 0.15s, box-shadow 0.15s;\n' +
'    outline: none;\n' +
'  }\n' +
'\n' +
'  select {\n' +
'    background-image: url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%231C3A5C\' stroke-width=\'1.8\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E");\n' +
'    background-repeat: no-repeat;\n' +
'    background-position: right 13px center;\n' +
'    padding-right: 36px;\n' +
'  }\n' +
'\n' +
'  select:focus, input[type="number"]:focus, textarea:focus {\n' +
'    border-color: var(--navy);\n' +
'    box-shadow: 0 0 0 3px rgba(28,58,92,0.12);\n' +
'    background: var(--white);\n' +
'  }\n' +
'\n' +
'  /* ── Grid of 3 number inputs ── */\n' +
'  .grid3 {\n' +
'    display: grid;\n' +
'    grid-template-columns: 1fr 1fr 1fr;\n' +
'    gap: 10px;\n' +
'  }\n' +
'\n' +
'  .grid3 label {\n' +
'    font-size: 12px;\n' +
'  }\n' +
'\n' +
'  .grid3 input {\n' +
'    font-size: 16px;\n' +
'    padding: 10px 8px;\n' +
'    text-align: center;\n' +
'  }\n' +
'\n' +
'  textarea {\n' +
'    resize: vertical;\n' +
'    min-height: 80px;\n' +
'    font-family: inherit;\n' +
'  }\n' +
'\n' +
'  /* ── Submit button ── */\n' +
'  .btn-submit {\n' +
'    width: 100%;\n' +
'    padding: 15px;\n' +
'    background: linear-gradient(135deg, var(--gold) 0%, var(--gold2) 100%);\n' +
'    color: var(--navy);\n' +
'    border: none;\n' +
'    border-radius: var(--radius);\n' +
'    font-size: 17px;\n' +
'    font-weight: 700;\n' +
'    letter-spacing: 0.5px;\n' +
'    cursor: pointer;\n' +
'    box-shadow: 0 3px 12px rgba(201,162,39,0.4);\n' +
'    transition: opacity 0.2s, transform 0.1s;\n' +
'  }\n' +
'\n' +
'  .btn-submit:active {\n' +
'    transform: scale(0.98);\n' +
'  }\n' +
'\n' +
'  .btn-submit:disabled {\n' +
'    opacity: 0.6;\n' +
'    cursor: not-allowed;\n' +
'    transform: none;\n' +
'  }\n' +
'\n' +
'  /* ── Alerts ── */\n' +
'  .alert {\n' +
'    display: none;\n' +
'    padding: 14px 16px;\n' +
'    border-radius: var(--radius);\n' +
'    font-size: 14px;\n' +
'    font-weight: 600;\n' +
'    margin-bottom: 16px;\n' +
'    text-align: center;\n' +
'    animation: slideIn 0.25s ease;\n' +
'  }\n' +
'\n' +
'  .alert.show { display: block; }\n' +
'\n' +
'  .alert-success {\n' +
'    background: #D4EDDA;\n' +
'    color: #155724;\n' +
'    border: 1.5px solid #C3E6CB;\n' +
'  }\n' +
'\n' +
'  .alert-error {\n' +
'    background: #F8D7DA;\n' +
'    color: #721C24;\n' +
'    border: 1.5px solid #F5C6CB;\n' +
'  }\n' +
'\n' +
'  @keyframes slideIn {\n' +
'    from { opacity: 0; transform: translateY(-8px); }\n' +
'    to   { opacity: 1; transform: translateY(0); }\n' +
'  }\n' +
'\n' +
'  .hidden { display: none !important; }\n' +
'\n' +
'  /* ── Footer ── */\n' +
'  footer {\n' +
'    text-align: center;\n' +
'    font-size: 11px;\n' +
'    color: var(--muted);\n' +
'    padding-bottom: 20px;\n' +
'  }\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'\n' +
'<header>\n' +
'  <div class="logo">V</div>\n' +
'  <div class="header-text">\n' +
'    <h1>Verminord</h1>\n' +
'    <p>Dagslogg</p>\n' +
'  </div>\n' +
'</header>\n' +
'\n' +
'<main>\n' +
'\n' +
'  <!-- Alerts -->\n' +
'  <div class="alert alert-success" id="alertOk"></div>\n' +
'  <div class="alert alert-error"   id="alertErr"></div>\n' +
'\n' +
'  <!-- Tab switcher -->\n' +
'  <div class="tabs">\n' +
'    <button class="tab-btn active" id="tabProd"     onclick="switchTab(\'prod\')"    >Produksjon</button>\n' +
'    <button class="tab-btn"        id="tabFork"     onclick="switchTab(\'fork\')"    >Forkompost</button>\n' +
'  </div>\n' +
'\n' +
'  <!-- Form -->\n' +
'  <form id="logForm" onsubmit="submitForm(event)">\n' +
'\n' +
'    <!-- System & Who -->\n' +
'    <div class="card">\n' +
'      <div class="card-title">Registrering</div>\n' +
'\n' +
'      <div class="field">\n' +
'        <label for="selSystem">System</label>\n' +
'        <select id="selSystem" required></select>\n' +
'      </div>\n' +
'\n' +
'      <div class="field">\n' +
'        <label for="selWho">Hvem logger?</label>\n' +
'        <select id="selWho" required>\n' +
'          <option value="">Velg person…</option>\n' +
'          <option value="Martin">Martin</option>\n' +
'          <option value="Mathias">Mathias</option>\n' +
'          <option value="Rune">Rune</option>\n' +
'        </select>\n' +
'      </div>\n' +
'    </div>\n' +
'\n' +
'    <!-- Measurements -->\n' +
'    <div class="card">\n' +
'      <div class="card-title">Målinger</div>\n' +
'\n' +
'      <div class="field">\n' +
'        <div class="grid3">\n' +
'          <div>\n' +
'            <label for="inTemp">Temp °C</label>\n' +
'            <input type="number" id="inTemp" placeholder="–" step="0.1">\n' +
'          </div>\n' +
'          <div>\n' +
'            <label for="inPh">pH</label>\n' +
'            <input type="number" id="inPh" placeholder="–" step="0.01" min="0" max="14">\n' +
'          </div>\n' +
'          <div>\n' +
'            <label for="inFukt">Fukt %</label>\n' +
'            <input type="number" id="inFukt" placeholder="–" step="0.1" min="0" max="100">\n' +
'          </div>\n' +
'        </div>\n' +
'      </div>\n' +
'\n' +
'      <div class="field" id="fieldFor">\n' +
'        <label for="inFor">Fôr tilsatt (L)</label>\n' +
'        <input type="number" id="inFor" placeholder="0" step="0.1" min="0">\n' +
'      </div>\n' +
'    </div>\n' +
'\n' +
'    <!-- Kommentar -->\n' +
'    <div class="card">\n' +
'      <div class="card-title">Kommentar</div>\n' +
'      <div class="field">\n' +
'        <textarea id="inKommentar" placeholder="Valgfri kommentar…" rows="3"></textarea>\n' +
'      </div>\n' +
'    </div>\n' +
'\n' +
'    <button type="submit" class="btn-submit" id="btnSubmit">Logg</button>\n' +
'\n' +
'  </form>\n' +
'\n' +
'</main>\n' +
'\n' +
'<footer>Verminord &copy; 2025</footer>\n' +
'\n' +
'<script>\n' +
'  var currentTab = "prod";\n' +
'\n' +
'  var SYSTEMS = {\n' +
'    prod: ["CFT1","CFT2","CFT3","Wedge 1","Wedge 2","Breeder Bin"],\n' +
'    fork: ["Forkompost 1","Forkompost 2","Forkompost 3"]\n' +
'  };\n' +
'\n' +
'  function populateSystems(tab) {\n' +
'    var sel = document.getElementById("selSystem");\n' +
'    sel.innerHTML = \'<option value="">Velg system\\u2026</option>\';\n' +
'    var list = SYSTEMS[tab];\n' +
'    for (var i = 0; i < list.length; i++) {\n' +
'      var opt = document.createElement("option");\n' +
'      opt.value = list[i];\n' +
'      opt.textContent = list[i];\n' +
'      sel.appendChild(opt);\n' +
'    }\n' +
'  }\n' +
'\n' +
'  function switchTab(tab) {\n' +
'    currentTab = tab;\n' +
'    document.getElementById("tabProd").classList.toggle("active", tab === "prod");\n' +
'    document.getElementById("tabFork").classList.toggle("active", tab === "fork");\n' +
'    document.getElementById("fieldFor").classList.toggle("hidden", tab !== "prod");\n' +
'    populateSystems(tab);\n' +
'    hideAlerts();\n' +
'  }\n' +
'\n' +
'  function hideAlerts() {\n' +
'    document.getElementById("alertOk").classList.remove("show");\n' +
'    document.getElementById("alertErr").classList.remove("show");\n' +
'  }\n' +
'\n' +
'  function showSuccess(msg) {\n' +
'    var el = document.getElementById("alertOk");\n' +
'    el.textContent = msg;\n' +
'    el.classList.add("show");\n' +
'    document.getElementById("alertErr").classList.remove("show");\n' +
'    el.scrollIntoView({ behavior: "smooth", block: "nearest" });\n' +
'  }\n' +
'\n' +
'  function showError(msg) {\n' +
'    var el = document.getElementById("alertErr");\n' +
'    el.textContent = "Feil: " + msg;\n' +
'    el.classList.add("show");\n' +
'    document.getElementById("alertOk").classList.remove("show");\n' +
'    el.scrollIntoView({ behavior: "smooth", block: "nearest" });\n' +
'  }\n' +
'\n' +
'  function getVal(id) {\n' +
'    var v = document.getElementById(id).value.trim();\n' +
'    return v === "" ? "" : v;\n' +
'  }\n' +
'\n' +
'  function submitForm(e) {\n' +
'    e.preventDefault();\n' +
'    hideAlerts();\n' +
'\n' +
'    var system = getVal("selSystem");\n' +
'    var who    = getVal("selWho");\n' +
'\n' +
'    if (!system) { showError("Velg et system."); return; }\n' +
'    if (!who)    { showError("Velg hvem som logger."); return; }\n' +
'\n' +
'    var btn = document.getElementById("btnSubmit");\n' +
'    btn.disabled = true;\n' +
'    btn.textContent = "Lagrer\\u2026";\n' +
'\n' +
'    var data = {\n' +
'      system:     system,\n' +
'      who:        who,\n' +
'      temp:       getVal("inTemp"),\n' +
'      ph:         getVal("inPh"),\n' +
'      fukt:       getVal("inFukt"),\n' +
'      forTilfort: getVal("inFor"),\n' +
'      kommentar:  getVal("inKommentar")\n' +
'    };\n' +
'\n' +
'    function onSuccess(result) {\n' +
'      btn.disabled = false;\n' +
'      btn.textContent = "Logg";\n' +
'      showSuccess("\\u2713 Logget: " + result.system + " (" + result.ts + ")");\n' +
'      document.getElementById("logForm").reset();\n' +
'      populateSystems(currentTab);\n' +
'    }\n' +
'\n' +
'    function onFailure(err) {\n' +
'      btn.disabled = false;\n' +
'      btn.textContent = "Logg";\n' +
'      showError(err.message || String(err));\n' +
'    }\n' +
'\n' +
'    if (currentTab === "prod") {\n' +
'      google.script.run\n' +
'        .withSuccessHandler(onSuccess)\n' +
'        .withFailureHandler(onFailure)\n' +
'        .logProduksjon(data);\n' +
'    } else {\n' +
'      google.script.run\n' +
'        .withSuccessHandler(onSuccess)\n' +
'        .withFailureHandler(onFailure)\n' +
'        .logForkompost(data);\n' +
'    }\n' +
'  }\n' +
'\n' +
'  // Initialise\n' +
'  populateSystems("prod");\n' +
'</script>\n' +
'\n' +
'</body>\n' +
'</html>';
}
