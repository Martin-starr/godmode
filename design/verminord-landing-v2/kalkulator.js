/* ============================================================
   Verminord — mengdekalkulator (dyrkerspor)
   Ett spørsmål om gangen, fire spørsmål, resultat med én gang.

   Alle doseringstall kommer fra Verminords egen dokumentasjon:
     · toppdressing  100–200 g/m²
     · innblanding   5–10 % av pottejordvolumet
     · salgsenhet    5 liters sekk
   ANTAKELSE som må bekreftes av Martin: 5 L ≈ 2 kg (0,4 kg/l).
   Endres den, endres bare KG_PER_LITER under.
   ============================================================ */

(function () {
  "use strict";

  var boks = document.getElementById("kalk-box");
  if (!boks) return;

  var SEKK_LITER = 5;
  var KG_PER_LITER = 0.4;
  var KG_PER_SEKK = SEKK_LITER * KG_PER_LITER; // 2 kg

  /* Hvor mye som brukes, avhengig av hvor innarbeidet jorda er.
     Ytterpunktene er nøyaktig de dokumenterte bandene. */
  var RATE = { forste: 200, avogtil: 150, arlig: 100 };        // g/m²
  var ANDEL = { forste: 0.10, avogtil: 0.075, arlig: 0.05 };   // andel av pottevolum

  var TYPER = {
    potter:  { navn: "Potter og kar",        ord: "potter",       enhet: "potter" },
    bed:     { navn: "Bed og grønnsakshage", ord: "grønnsaksbed", enhet: "m²" },
    drivhus: { navn: "Drivhus",              ord: "drivhus",      enhet: "m²" },
    plen:    { navn: "Plen",                 ord: "plen",         enhet: "m²" },
    annet:   { navn: "Annet",                ord: "dyrkeareal",   enhet: "m²" }
  };

  var MENGDE_SPM = {
    potter:  "Hvor mange potter?",
    bed:     "Hvor stort er bedet?",
    drivhus: "Hvor stort er drivhuset?",
    plen:    "Hvor stor er plenen?",
    annet:   "Hvor stort er arealet?"
  };

  var PRESETS = {
    potter:  [5, 10, 20, 50],
    bed:     [5, 10, 20, 40],
    drivhus: [6, 12, 20, 30],
    plen:    [50, 100, 200, 400],
    annet:   [5, 10, 20, 50]
  };

  var STANDARD_MENGDE = { potter: 10, bed: 20, drivhus: 12, plen: 100, annet: 20 };
  var POTTESTORRELSER = [2, 5, 10, 20];

  var svar = {
    bruk: null,          // oppstart | vedlikehold | begge
    type: null,          // potter | bed | drivhus | plen | annet
    mengde: null,        // m² eller antall potter
    pottestorrelse: 5,   // liter
    historikk: null      // forste | avogtil | arlig
  };

  var steg = 1;          // 1–4, deretter 5 = resultat

  /* --- tall og språk ------------------------------------------ */

  function nb(n) {
    return n.toLocaleString("nb-NO", { maximumFractionDigits: 1 });
  }

  function rund(v) {
    if (v >= 10) return Math.round(v);        // 43 kg
    if (v >= 1)  return Math.round(v * 2) / 2; // 3 kg, 4,5 kg
    return Math.round(v * 10) / 10;            // 0,1 kg — aldri "ca. 0"
  }

  function sekkeord(n) { return n === 1 ? "sekk" : "sekker"; }

  /* --- regnestykket -------------------------------------------- */

  function regn() {
    var sekker, tekst;

    if (svar.type === "potter") {
      var totalvolum = svar.mengde * svar.pottestorrelse;
      var liter = rund(totalvolum * ANDEL[svar.historikk]);
      sekker = Math.max(1, Math.ceil(liter / SEKK_LITER));
      tekst = "Til " + nb(svar.mengde) + " " + (svar.mengde === 1 ? "potte" : "potter") +
              " à " + nb(svar.pottestorrelse) + " liter går det med ca. " + nb(liter) +
              " liter vermikompost — omtrent " + nb(sekker) + " " + sekkeord(sekker) + " à 5 liter.";
    } else {
      var kg = rund(svar.mengde * RATE[svar.historikk] / 1000);
      sekker = Math.max(1, Math.ceil(kg / KG_PER_SEKK));
      tekst = "Til " + nb(svar.mengde) + " m² " + TYPER[svar.type].ord +
              " går det med ca. " + nb(kg) + " kg vermikompost per sesong — omtrent " +
              nb(sekker) + " " + sekkeord(sekker) + " à 5 liter.";
    }

    return { tekst: tekst, stotte: stottelinje() };
  }

  function stottelinje() {
    if (svar.type === "potter") return "Bland inn 5–10 % i pottejorda. Det er nok.";
    if (svar.type === "plen")   return "Kost inn 100–200 g/m² etter lufting om våren. Det er nok.";
    if (svar.bruk === "oppstart")     return "Bland inn i jorda før planting, eller toppdress 100–200 g/m² etterpå. Det er nok.";
    if (svar.bruk === "vedlikehold")  return "Toppdress 100–200 g/m² på våren. Det er nok.";
    return "Toppdress 100–200 g/m² på våren, eller bland inn i jorda før planting. Det er nok.";
  }

  /* --- byggeklosser -------------------------------------------- */

  function el(tag, klasse, tekst) {
    var n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (tekst != null) n.textContent = tekst;
    return n;
  }

  /* ferdige === null betyr resultatsteget: da er stegstripa ferdig med
     jobben sin, og en fylt stripe rett over resultatets navy-strek blir
     bare to tunge linjer oppå hverandre. */
  function hode(merkelapp, kanGaTilbake, ferdige) {
    var frag = document.createDocumentFragment();

    var head = el("div", "kalk-head");
    var back = el("button", "kalk-back", "←");
    back.type = "button";
    back.setAttribute("aria-label", "Ett steg tilbake");
    if (!kanGaTilbake) back.hidden = true;
    back.addEventListener("click", tilbake);
    head.appendChild(back);
    head.appendChild(el("span", "kalk-step", merkelapp));
    frag.appendChild(head);

    if (ferdige !== null) {
      var prog = el("div", "kalk-progress");
      prog.setAttribute("aria-hidden", "true");
      for (var i = 0; i < 4; i++) {
        prog.appendChild(el("span", i < ferdige ? "on" : null));
      }
      frag.appendChild(prog);
    }

    return frag;
  }

  function sporsmal(tekst) {
    var h = el("h3", "kalk-q", tekst);
    h.setAttribute("tabindex", "-1");
    return h;
  }

  function valgliste(valg, valgtVerdi, velg) {
    var liste = el("div", "options");
    valg.forEach(function (v) {
      var b = el("button", "option", v.tekst);
      b.type = "button";
      b.setAttribute("aria-pressed", String(valgtVerdi === v.verdi));
      b.addEventListener("click", function () { velg(v.verdi); });
      liste.appendChild(b);
    });
    return liste;
  }

  /* --- stegene ------------------------------------------------- */

  function stegBruk() {
    var frag = document.createDocumentFragment();
    frag.appendChild(hode("Spørsmål 1 av 4", false, 0));
    frag.appendChild(sporsmal("Hva skal du bruke den til?"));
    frag.appendChild(valgliste([
      { verdi: "oppstart",    tekst: "Bygge opp jord før planting" },
      { verdi: "vedlikehold", tekst: "Holde jorda i gang gjennom sesongen" },
      { verdi: "begge",       tekst: "Begge deler" }
    ], svar.bruk, function (v) { svar.bruk = v; steg = 2; tegn(true); }));
    return frag;
  }

  function stegType() {
    var frag = document.createDocumentFragment();
    frag.appendChild(hode("Spørsmål 2 av 4", true, 1));
    frag.appendChild(sporsmal("Hva dyrker du?"));
    frag.appendChild(valgliste([
      { verdi: "potter",  tekst: "Potter og kar" },
      { verdi: "bed",     tekst: "Bed og grønnsakshage" },
      { verdi: "drivhus", tekst: "Drivhus" },
      { verdi: "plen",    tekst: "Plen" },
      { verdi: "annet",   tekst: "Annet" }
    ], svar.type, function (v) {
      if (svar.type !== v) svar.mengde = STANDARD_MENGDE[v];
      svar.type = v;
      steg = 3;
      tegn(true);
    }));
    return frag;
  }

  function stegMengde() {
    var frag = document.createDocumentFragment();
    frag.appendChild(hode("Spørsmål 3 av 4", true, 2));
    frag.appendChild(sporsmal(MENGDE_SPM[svar.type]));

    var enhet = TYPER[svar.type].enhet;

    var rad = el("div", "amount");

    var ned = el("button", null, "−");
    ned.type = "button";
    ned.setAttribute("aria-label", "Mindre");

    var felt = el("div", "amount-field");
    var input = document.createElement("input");
    input.type = "number";
    input.inputMode = "numeric";
    input.min = "1";
    input.max = "100000";
    input.step = "1";
    input.value = String(svar.mengde);
    input.id = "kalk-mengde";
    input.setAttribute("aria-label", MENGDE_SPM[svar.type] + " (" + enhet + ")");
    felt.appendChild(input);
    felt.appendChild(el("span", "amount-unit", enhet));

    var opp = el("button", null, "+");
    opp.type = "button";
    opp.setAttribute("aria-label", "Mer");

    function sett(v) {
      svar.mengde = Math.min(100000, Math.max(1, Math.round(v)));
      input.value = String(svar.mengde);
    }

    var trinn = svar.type === "plen" ? 10 : 1;
    ned.addEventListener("click", function () { sett(svar.mengde - trinn); });
    opp.addEventListener("click", function () { sett(svar.mengde + trinn); });
    input.addEventListener("input", function () {
      var v = parseInt(input.value, 10);
      if (!isNaN(v)) svar.mengde = Math.min(100000, Math.max(1, v));
    });
    input.addEventListener("blur", function () { sett(svar.mengde); });

    rad.appendChild(ned);
    rad.appendChild(felt);
    rad.appendChild(opp);
    frag.appendChild(rad);

    var presets = el("div", "presets");
    PRESETS[svar.type].forEach(function (v) {
      var p = el("button", "preset", nb(v) + " " + enhet);
      p.type = "button";
      p.addEventListener("click", function () { sett(v); });
      presets.appendChild(p);
    });
    frag.appendChild(presets);

    if (svar.type === "potter") {
      var sub = el("div", "subq");
      sub.appendChild(el("span", "subq-label", "Typisk pottestørrelse"));
      var chips = el("div", "presets");
      POTTESTORRELSER.forEach(function (v) {
        var c = el("button", "preset", nb(v) + " liter");
        c.type = "button";
        c.setAttribute("aria-pressed", String(svar.pottestorrelse === v));
        c.addEventListener("click", function () {
          svar.pottestorrelse = v;
          /* Oppdater på stedet, slik at fokus blir stående på knappen. */
          Array.prototype.forEach.call(chips.children, function (annen) {
            annen.setAttribute("aria-pressed", String(annen === c));
          });
        });
        chips.appendChild(c);
      });
      sub.appendChild(chips);
      frag.appendChild(sub);
    }

    var neste = el("button", "btn btn--outline kalk-next", "Neste");
    neste.type = "button";
    neste.addEventListener("click", function () { steg = 4; tegn(true); });
    frag.appendChild(neste);

    return frag;
  }

  function stegHistorikk() {
    var frag = document.createDocumentFragment();
    frag.appendChild(hode("Spørsmål 4 av 4", true, 3));
    frag.appendChild(sporsmal("Har du gitt vermikompost her før?"));
    frag.appendChild(valgliste([
      { verdi: "forste",  tekst: "Nei, første sesong" },
      { verdi: "avogtil", tekst: "Ja, men ikke hvert år" },
      { verdi: "arlig",   tekst: "Ja, hvert år" }
    ], svar.historikk, function (v) { svar.historikk = v; steg = 5; tegn(true); }));
    return frag;
  }

  /* --- resultat ------------------------------------------------- */

  function stegResultat() {
    var frag = document.createDocumentFragment();
    var r = regn();

    frag.appendChild(hode("Resultat", true, null));

    var res = el("div", "resultat");
    var hoved = el("p", "resultat-hoved", r.tekst);
    hoved.setAttribute("tabindex", "-1");
    hoved.id = "kalk-resultat";
    res.appendChild(hoved);
    res.appendChild(el("p", "resultat-stotte", r.stotte));
    frag.appendChild(res);

    /* Sekundært: planen på e-post. Navy omriss — svakere enn
       engros-CTA-en, som er den eneste gule flaten på siden. */
    var plan = el("div", "plan");
    plan.appendChild(el("p", "plan-tittel", "Vil du ha den skriftlig?"));

    var felt = el("div", "field");
    var lab = el("label", null, "E-post");
    lab.setAttribute("for", "plan-epost");
    var inp = document.createElement("input");
    inp.type = "email";
    inp.id = "plan-epost";
    inp.name = "epost";
    inp.autocomplete = "email";
    inp.inputMode = "email";
    felt.appendChild(lab);
    felt.appendChild(inp);
    plan.appendChild(felt);

    var send = el("button", "btn btn--outline", "Send meg planen");
    send.type = "button";
    plan.appendChild(send);

    var consent = el("label", "consent");
    var boksje = document.createElement("input");
    boksje.type = "checkbox";
    boksje.id = "plan-samtykke";
    consent.appendChild(boksje);
    var ctekst = el("span");
    ctekst.appendChild(document.createTextNode("Jeg samtykker til at Martin lagrer e-postadressen min for å sende planen og svare meg. "));
    var plink = el("a", "textlink", "Personvern");
    plink.href = "#personvern";
    ctekst.appendChild(plink);
    consent.appendChild(ctekst);
    plan.appendChild(consent);

    frag.appendChild(plan);

    /* Stillere: hvor den finnes. */
    frag.appendChild(el("p", "forhandler-note",
      "VermiCast selges gjennom utvalgte forhandlere. Ta kontakt, så sier jeg hvor du får tak i den nærmest deg."));

    /* Stillest: det lokale sporet. Samme vekt som den sekundære
       lenken i heroen — ren tekst, ingen knapp, ingen gull. */
    var lokal = el("p", "lokal-link");
    var a = el("a", "quiet-link", "Er du fra Jæren og vil hente selv? Se lokalt utsalg →");
    a.href = "lokalt-utsalg.html";
    lokal.appendChild(a);
    frag.appendChild(lokal);

    return frag;
  }

  /* --- navigasjon og tegning ------------------------------------ */

  function tilbake() {
    if (steg > 1) { steg -= 1; tegn(true); }
  }

  function tegn(flyttFokus) {
    var frag;
    if (steg === 1) frag = stegBruk();
    else if (steg === 2) frag = stegType();
    else if (steg === 3) frag = stegMengde();
    else if (steg === 4) frag = stegHistorikk();
    else frag = stegResultat();

    boks.textContent = "";
    boks.appendChild(frag);

    if (flyttFokus) {
      var mal = boks.querySelector(".kalk-q") || boks.querySelector("#kalk-resultat");
      if (mal) mal.focus({ preventScroll: true });
    }
  }

  tegn(false);
})();
